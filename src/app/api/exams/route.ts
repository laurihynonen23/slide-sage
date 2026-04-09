import { NextRequest } from "next/server";
import { deleteAssetsWithPrefix, examAssetPrefix, loadAppState, saveAppState } from "@/lib/persistence";

export async function GET() {
  try {
    const state = await loadAppState();
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

    const state = await loadAppState();
    state.exams = state.exams.filter((exam) => exam.id !== id);
    state.examPages = state.examPages.filter((page) => page.exam_id !== id);
    state.slideRelevance = state.slideRelevance.filter((item) => item.exam_id !== id);
    await saveAppState(state);
    await deleteAssetsWithPrefix(examAssetPrefix(id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting exam:", error);
    return Response.json(
      { error: "Failed to delete exam" },
      { status: 500 }
    );
  }
}
