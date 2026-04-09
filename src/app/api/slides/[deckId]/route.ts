import { NextRequest } from "next/server";
import { loadAppState } from "@/lib/persistence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> }
) {
  try {
    const { deckId } = await params;
    const state = await loadAppState();
    const slides = state.slides
      .filter((slide) => slide.deck_id === deckId)
      .sort((a, b) => a.slide_number - b.slide_number);

    return Response.json(slides);
  } catch (error) {
    console.error("Error fetching slides:", error);
    return Response.json(
      { error: "Failed to fetch slides" },
      { status: 500 }
    );
  }
}
