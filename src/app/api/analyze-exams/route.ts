import { NextRequest } from "next/server";
import { analyzeExamRelevanceWithProvider } from "@/lib/ai-providers";
import { loadAppState, saveAppState } from "@/lib/persistence";
import { getProviderConfigFromSettings } from "@/lib/provider-settings";
import { getWorkspaceId } from "@/lib/user-session";
import type { Deck, ExamDocument, ExamPage, Slide } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deckId } = body as { deckId: string };

    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const deck = state.decks.find((item) => item.id === deckId) as Deck | undefined;
    if (!deck) return Response.json({ error: "Deck not found" }, { status: 404 });

    const slides = state.slides
      .filter((slide) => slide.deck_id === deckId)
      .sort((a, b) => a.slide_number - b.slide_number) as Slide[];
    const slideImages = slides
      .filter((slide) => slide.image_path)
      .map((slide) => ({ slideNumber: slide.slide_number, imagePath: slide.image_path! }));

    const exams = [...state.exams].sort((a, b) => b.created_at.localeCompare(a.created_at)) as ExamDocument[];
    if (exams.length === 0) {
      return Response.json({ error: "No exam documents found. Upload exam papers first." }, { status: 400 });
    }

    const examImages = exams.map((exam) => {
      const pages = state.examPages
        .filter((page) => page.exam_id === exam.id)
        .sort((a, b) => a.page_number - b.page_number) as ExamPage[];
      return {
        examTitle: exam.title,
        pageImages: pages.filter((page) => page.image_path).map((page) => page.image_path!),
      };
    });

    const providerConfig = getProviderConfigFromSettings(state.settings);
    const result = await analyzeExamRelevanceWithProvider({
      slideImages,
      examImages,
      deckTitle: deck.title,
      providerConfig,
    });

    let analysis;
    try {
      analysis = JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    state.slideRelevance = state.slideRelevance.filter((item) => item.deck_id !== deckId);
    if (analysis.high_priority_slides) {
      for (const item of analysis.high_priority_slides) {
        for (const exam of exams) {
          state.slideRelevance.push({
            id: uuidv4(),
            deck_id: deckId,
            exam_id: exam.id,
            slide_range: item.range,
            reason: item.reason,
            score: item.score,
          });
        }
      }
    }

    await saveAppState(workspaceId, state);
    return Response.json(analysis);
  } catch (error) {
    console.error("Exam analysis error:", error);
    return Response.json({ error: "Failed to analyze exam relevance" }, { status: 500 });
  }
}
