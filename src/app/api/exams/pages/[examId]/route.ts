import { NextRequest } from "next/server";
import { loadAppState } from "@/lib/persistence";
import { getWorkspaceId } from "@/lib/user-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const pages = state.examPages
      .filter((page) => page.exam_id === examId)
      .sort((a, b) => a.page_number - b.page_number);

    return Response.json(pages);
  } catch (error) {
    console.error("Error fetching exam pages:", error);
    return Response.json(
      { error: "Failed to fetch exam pages" },
      { status: 500 }
    );
  }
}
