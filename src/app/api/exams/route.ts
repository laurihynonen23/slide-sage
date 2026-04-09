import { NextRequest } from "next/server";
import { deleteAssetsWithPrefix, examAssetPrefix, loadAppState, saveAppState } from "@/lib/persistence";
import { getWorkspaceId } from "@/lib/user-session";

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    return Response.json(state.exams);
  } catch (error) {
    console.error("Error fetching exams:", error);
    return Response.json(
      { error: "Failed to fetch exams" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Missing exam id" }, { status: 400 });
    }

    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    state.exams = state.exams.filter((exam) => exam.id !== id);
    state.examPages = state.examPages.filter((page) => page.exam_id !== id);
    state.slideRelevance = state.slideRelevance.filter((item) => item.exam_id !== id);
    await saveAppState(workspaceId, state);
    await deleteAssetsWithPrefix(examAssetPrefix(workspaceId, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting exam:", error);
    return Response.json(
      { error: "Failed to delete exam" },
      { status: 500 }
    );
  }
}
