import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { streamChatWithProvider } from "@/lib/ai-providers";
import type { AIChatOptions } from "@/lib/ai-providers";
import { cropSlideRegion } from "@/lib/pdf-processor";
import type {
  Slide,
  Deck,
  ExamDocument,
  ExamPage,
  ContextMode,
  DifficultyMode,
  ExplanationStyle,
  RegionSelection,
} from "@/lib/types";

function getProviderConfig(db: ReturnType<typeof getDb>) {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('provider', 'model', 'anthropic_api_key', 'openai_api_key')").all() as { key: string; value: string }[];
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    const provider = (s.provider || "anthropic") as "anthropic" | "openai";
    const apiKey = provider === "anthropic"
      ? (s.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "")
      : (s.openai_api_key || process.env.OPENAI_API_KEY || "");
    const model = s.model || (provider === "anthropic" ? (process.env.AI_MODEL || "claude-sonnet-4-20250514") : "gpt-4o");
    return { provider, apiKey, model };
  } catch {
    return { provider: "anthropic" as const, apiKey: process.env.ANTHROPIC_API_KEY || "", model: process.env.AI_MODEL || "claude-sonnet-4-20250514" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, deckId, slideNumbers, regionData, difficulty, contextMode, style, slideRange, language } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      deckId: string;
      slideNumbers: number[];
      regionData?: RegionSelection;
      difficulty: DifficultyMode;
      contextMode: ContextMode;
      style?: ExplanationStyle;
      slideRange?: { from: number; to: number };
      language?: string;
    };

    const db = getDb();
    const deck = db.prepare("SELECT * FROM decks WHERE id = ?").get(deckId) as Deck | undefined;
    if (!deck) return Response.json({ error: "Deck not found" }, { status: 404 });

    const allSlides = db.prepare("SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number ASC").all(deckId) as Slide[];
    let relevantSlides: Slide[] = [];
    const currentSlideNumber = slideNumbers?.[0] || 1;

    switch (contextMode) {
      case "current_slide":
      case "selected_region":
        relevantSlides = allSlides.filter(s => slideNumbers.includes(s.slide_number));
        break;
      case "neighboring_slides": {
        const neighbors = new Set<number>();
        for (const num of slideNumbers) { neighbors.add(num - 1); neighbors.add(num); neighbors.add(num + 1); }
        relevantSlides = allSlides.filter(s => neighbors.has(s.slide_number));
        break;
      }
      case "slide_range":
        relevantSlides = slideRange
          ? allSlides.filter(s => s.slide_number >= slideRange.from && s.slide_number <= slideRange.to)
          : allSlides.filter(s => slideNumbers.includes(s.slide_number));
        break;
      case "entire_deck":
      case "slides_and_exams":
      case "exam_relevance":
        relevantSlides = allSlides;
        break;
      case "exams_only":
        break;
      default:
        relevantSlides = allSlides.filter(s => slideNumbers.includes(s.slide_number));
    }

    const slideImages = relevantSlides.filter(s => s.image_path).map(s => ({ slideNumber: s.slide_number, imagePath: s.image_path! }));

    let regionCrop: Buffer | undefined;
    if (regionData && contextMode === "selected_region") {
      const currentSlide = allSlides.find(s => s.slide_number === currentSlideNumber);
      if (currentSlide?.image_path) regionCrop = await cropSlideRegion(currentSlide.image_path, regionData);
    }

    const extractedTexts = relevantSlides.filter(s => s.extracted_text).map(s => ({ slideNumber: s.slide_number, text: s.extracted_text }));

    let examContext: { examTitle: string; pageImages: string[] }[] | undefined;
    if (["exams_only", "slides_and_exams", "exam_relevance"].includes(contextMode)) {
      const exams = db.prepare("SELECT * FROM exam_documents ORDER BY created_at DESC").all() as ExamDocument[];
      examContext = [];
      for (const exam of exams) {
        const pages = db.prepare("SELECT * FROM exam_pages WHERE exam_id = ? ORDER BY page_number ASC").all(exam.id) as ExamPage[];
        examContext.push({ examTitle: exam.title, pageImages: pages.filter(p => p.image_path).map(p => p.image_path!) });
      }
    }

    const providerConfig = getProviderConfig(db);

    const chatOptions: AIChatOptions = {
      messages, slideImages, regionCrop, extractedTexts, difficulty, style, contextMode,
      currentSlideNumber, deckTitle: deck.title, examContext, providerConfig,
      language: (language as "en" | "fi") || "en",
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChatWithProvider(chatOptions)) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          // Send error message as part of the stream so the user sees it
          const errMsg = error instanceof Error ? error.message : String(error);
          controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${errMsg}`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return Response.json({ error: "Failed to process chat request" }, { status: 500 });
  }
}
