import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { generateQuizWithProvider } from "@/lib/ai-providers";
import type { Slide, Deck, ExamDocument, ExamPage, DifficultyMode } from "@/lib/types";
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
    const { deckId, slideRange, difficulty, questionCount, questionTypes, useExams } = body as {
      deckId: string;
      slideRange: { from: number; to: number };
      difficulty: DifficultyMode;
      questionCount: number;
      questionTypes: string[];
      useExams: boolean;
    };

    const db = getDb();
    const deck = db.prepare("SELECT * FROM decks WHERE id = ?").get(deckId) as Deck | undefined;
    if (!deck) return Response.json({ error: "Deck not found" }, { status: 404 });

    const slides = db.prepare("SELECT * FROM slides WHERE deck_id = ? AND slide_number >= ? AND slide_number <= ? ORDER BY slide_number ASC").all(deckId, slideRange.from, slideRange.to) as Slide[];
    const slideImages = slides.filter(s => s.image_path).map(s => ({ slideNumber: s.slide_number, imagePath: s.image_path! }));
    const extractedTexts = slides.filter(s => s.extracted_text).map(s => ({ slideNumber: s.slide_number, text: s.extracted_text }));

    let examContext: { examTitle: string; pageImages: string[] }[] | undefined;
    if (useExams) {
      const exams = db.prepare("SELECT * FROM exam_documents ORDER BY created_at DESC").all() as ExamDocument[];
      examContext = [];
      for (const exam of exams) {
        const pages = db.prepare("SELECT * FROM exam_pages WHERE exam_id = ? ORDER BY page_number ASC").all(exam.id) as ExamPage[];
        examContext.push({ examTitle: exam.title, pageImages: pages.filter(p => p.image_path).map(p => p.image_path!) });
      }
    }

    const scope = `Slides ${slideRange.from}-${slideRange.to}`;
    const providerConfig = getProviderConfig(db);

    const result = await generateQuizWithProvider({ slideImages, extractedTexts, examContext, difficulty, questionCount, questionTypes, scope, deckTitle: deck.title, providerConfig });

    let questions;
    try {
      questions = JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      questions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    }

    const quizId = uuidv4();
    db.prepare("INSERT INTO quizzes (id, deck_id, source_scope, difficulty, questions) VALUES (?, ?, ?, ?, ?)").run(quizId, deckId, scope, difficulty, JSON.stringify(questions));

    return Response.json({ id: quizId, deck_id: deckId, source_scope: scope, difficulty, questions, created_at: new Date().toISOString() });
  } catch (error) {
    console.error("Quiz generation error:", error);
    return Response.json({ error: "Failed to generate quiz" }, { status: 500 });
  }
}
