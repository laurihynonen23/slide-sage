import { NextRequest } from "next/server";
import { deckAssetPrefix, deleteAssetsWithPrefix, loadAppState, saveAppState } from "@/lib/persistence";
import { getWorkspaceId } from "@/lib/user-session";

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    return Response.json(state.decks);
  } catch (error) {
    console.error("Error fetching decks:", error);
    return Response.json(
      { error: "Failed to fetch decks" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Missing deck id" }, { status: 400 });
    }

    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    state.decks = state.decks.filter((deck) => deck.id !== id);
    state.slides = state.slides.filter((slide) => slide.deck_id !== id);
    state.quizzes = state.quizzes.filter((quiz) => quiz.deck_id !== id);
    state.slideRelevance = state.slideRelevance.filter((item) => item.deck_id !== id);
    await saveAppState(workspaceId, state);
    await deleteAssetsWithPrefix(deckAssetPrefix(workspaceId, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting deck:", error);
    return Response.json(
      { error: "Failed to delete deck" },
      { status: 500 }
    );
  }
}
