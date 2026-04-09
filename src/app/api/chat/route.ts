import { NextRequest } from "next/server";
import { streamChatWithProvider } from "@/lib/ai-providers";
import type { AIChatOptions } from "@/lib/ai-providers";
import { cropSlideRegion } from "@/lib/pdf-processor";
import { loadAppState } from "@/lib/persistence";
import { getProviderConfigFromSettings } from "@/lib/provider-settings";
import { getWorkspaceId } from "@/lib/user-session";
import type {
  Deck,
  ExamDocument,
  ExamPage,
  ContextMode,
  DifficultyMode,
  ExplanationStyle,
  RegionSelection,
  Slide,
} from "@/lib/types";

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

    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const deck = state.decks.find((item) => item.id === deckId) as Deck | undefined;
    if (!deck) return Response.json({ error: "Deck not found" }, { status: 404 });

    const allSlides = state.slides
      .filter((slide) => slide.deck_id === deckId)
      .sort((a, b) => a.slide_number - b.slide_number) as Slide[];
    let relevantSlides: Slide[] = [];
    const currentSlideNumber = slideNumbers?.[0] || 1;

    switch (contextMode) {
      case "current_slide":
      case "selected_region":
        relevantSlides = allSlides.filter((slide) => slideNumbers.includes(slide.slide_number));
        break;
      case "neighboring_slides": {
        const neighbors = new Set<number>();
        for (const num of slideNumbers) {
          neighbors.add(num - 1);
          neighbors.add(num);
          neighbors.add(num + 1);
        }
        relevantSlides = allSlides.filter((slide) => neighbors.has(slide.slide_number));
        break;
      }
      case "slide_range":
        relevantSlides = slideRange
          ? allSlides.filter((slide) => slide.slide_number >= slideRange.from && slide.slide_number <= slideRange.to)
          : allSlides.filter((slide) => slideNumbers.includes(slide.slide_number));
        break;
      case "entire_deck":
      case "slides_and_exams":
      case "exam_relevance":
        relevantSlides = allSlides;
        break;
      case "exams_only":
        break;
      default:
        relevantSlides = allSlides.filter((slide) => slideNumbers.includes(slide.slide_number));
    }

    const slideImages = relevantSlides
      .filter((slide) => slide.image_path)
      .map((slide) => ({ slideNumber: slide.slide_number, imagePath: slide.image_path! }));

    let regionCrop: Buffer | undefined;
    if (regionData && contextMode === "selected_region") {
      const currentSlide = allSlides.find((slide) => slide.slide_number === currentSlideNumber);
      if (currentSlide?.image_path) {
        regionCrop = await cropSlideRegion(currentSlide.image_path, regionData);
      }
    }

    const extractedTexts = relevantSlides
      .filter((slide) => slide.extracted_text)
      .map((slide) => ({ slideNumber: slide.slide_number, text: slide.extracted_text }));

    let examContext: { examTitle: string; pageImages: string[] }[] | undefined;
    if (["exams_only", "slides_and_exams", "exam_relevance"].includes(contextMode)) {
      const exams = [...state.exams].sort((a, b) => b.created_at.localeCompare(a.created_at)) as ExamDocument[];
      examContext = exams.map((exam) => {
        const pages = state.examPages
          .filter((page) => page.exam_id === exam.id)
          .sort((a, b) => a.page_number - b.page_number) as ExamPage[];
        return {
          examTitle: exam.title,
          pageImages: pages.filter((page) => page.image_path).map((page) => page.image_path!),
        };
      });
    }

    const providerConfig = getProviderConfigFromSettings(state.settings);

    const chatOptions: AIChatOptions = {
      messages,
      slideImages,
      regionCrop,
      extractedTexts,
      difficulty,
      style,
      contextMode,
      currentSlideNumber,
      deckTitle: deck.title,
      examContext,
      providerConfig,
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
          const errMsg = error instanceof Error ? error.message : String(error);
          controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${errMsg}`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return Response.json({ error: "Failed to process chat request" }, { status: 500 });
  }
}
