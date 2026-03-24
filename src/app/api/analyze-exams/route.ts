import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { analyzeExamRelevanceWithProvider } from "@/lib/ai-providers";
import type { Slide, Deck, ExamDocument, ExamPage } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

function getProviderConfig(db: ReturnType<typeof getDb>) {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('provider', 'model', 'anthropic_api_key', 'openai_api_key')").all() as { key: string; value: string }[];
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    const provider = (s.provider || "anthropic") as "anthropic" | "openai";
    const apiKey = provider === "anthropic" ? (s.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "") : (s.openai_api_key || process.env.OPENAI_API_KEY || "");
    const model = s.model || (provider === "anthropic" ? (process.env.AI_MODEL || "claude-sonnet-4-20250514") : "gpt-4o");
    return { provider, apiKey, model };
  } catch {
    return { provider: "anthropic" as const, apiKey: process.env.ANTHROPIC_API_KEY || "", model: process.env.AI_MODEL || "claude-sonnet-4-20250514" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deckId } = body as { deckId: string };

    const db = getDb();
    const deck = db.prepare("SELECT * FROM decks WHERE id = ?").get(deckId) as Deck | undefined;
    if (!deck) return Response.json({ error: "Deck not found" }, { status: 404 });

    const slides = db.prepare("SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number ASC").all(deckId) as Slide[];
    const slideImages = slides.filter(s => s.image_path).map(s => ({ slideNumber: s.slide_number, imagePath: s.image_path! }));

    const exams = db.prepare("SELECT * FROM exam_documents ORDER BY created_at DESC").all() as ExamDocument[];
    if (exams.length === 0) return Response.json({ error: "No exam documents found. Upload exam papers first." }, { status: 400 });

    const examImages: { examTitle: string; pageImages: string[] }[] = [];
    for (const exam of exams) {
      const pages = db.prepare("SELECT * FROM exam_pages WHERE exam_id = ? ORDER BY page_number ASC").all(exam.id) as ExamPage[];
      examImages.push({ examTitle: exam.title, pageImages: pages.filter(p => p.image_path).map(p => p.image_path!) });
    }

    const providerConfig = getProviderConfig(db);
    const result = await analyzeExamRelevanceWithProvider({ slideImages, examImages, deckTitle: deck.title, providerConfig });

    let analysis;
    try {
      analysis = JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    db.prepare("DELETE FROM slide_relevance WHERE deck_id = ?").run(deckId);
    if (analysis.high_priority_slides) {
      for (const item of analysis.high_priority_slides) {
        for (const exam of exams) {
          db.prepare("INSERT INTO slide_relevance (id, deck_id, exam_id, slide_range, reason, score) VALUES (?, ?, ?, ?, ?, ?)").run(uuidv4(), deckId, exam.id, item.range, item.reason, item.score);
        }
      }
    }

    return Response.json(analysis);
  } catch (error) {
    console.error("Exam analysis error:", error);
    return Response.json({ error: "Failed to analyze exam relevance" }, { status: 500 });
  }
}
