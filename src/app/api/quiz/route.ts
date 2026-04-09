import { NextRequest } from "next/server";
import { generateQuizWithProvider } from "@/lib/ai-providers";
import { loadAppState, saveAppState } from "@/lib/persistence";
import { getProviderConfigFromSettings } from "@/lib/provider-settings";
import { getWorkspaceId } from "@/lib/user-session";
import type { Deck, DifficultyMode, ExamDocument, ExamPage, Quiz, Slide } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

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

    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const deck = state.decks.find((item) => item.id === deckId) as Deck | undefined;
    if (!deck) return Response.json({ error: "Deck not found" }, { status: 404 });

    const slides = state.slides
      .filter((slide) => slide.deck_id === deckId && slide.slide_number >= slideRange.from && slide.slide_number <= slideRange.to)
      .sort((a, b) => a.slide_number - b.slide_number) as Slide[];
    const slideImages = slides
      .filter((slide) => slide.image_path)
      .map((slide) => ({ slideNumber: slide.slide_number, imagePath: slide.image_path! }));
    const extractedTexts = slides
      .filter((slide) => slide.extracted_text)
      .map((slide) => ({ slideNumber: slide.slide_number, text: slide.extracted_text }));

    let examContext: { examTitle: string; pageImages: string[] }[] | undefined;
    if (useExams) {
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

    const scope = `Slides ${slideRange.from}-${slideRange.to}`;
    const providerConfig = getProviderConfigFromSettings(state.settings);
    const result = await generateQuizWithProvider({
      slideImages,
      extractedTexts,
      examContext,
      difficulty,
      questionCount,
      questionTypes,
      scope,
      deckTitle: deck.title,
      providerConfig,
    });

    let questions;
    try {
      questions = JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      questions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    }

    const quiz: Quiz = {
      id: uuidv4(),
      deck_id: deckId,
      source_scope: scope,
      difficulty,
      questions,
      created_at: new Date().toISOString(),
    };

    state.quizzes = [quiz, ...state.quizzes];
    await saveAppState(workspaceId, state);

    return Response.json(quiz);
  } catch (error) {
    console.error("Quiz generation error:", error);
    return Response.json({ error: "Failed to generate quiz" }, { status: 500 });
  }
}
