import { NextRequest } from "next/server";
import { loadAppState, readAssetBuffer } from "@/lib/persistence";
import { getWorkspaceId } from "@/lib/user-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const page = state.examPages.find((item) => item.id === pageId);

    if (!page || !page.image_path) {
      return Response.json({ error: "Exam page not found" }, { status: 404 });
    }

    const buffer = await readAssetBuffer(page.image_path);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving exam page image:", error);
    return Response.json(
      { error: "Failed to serve image" },
      { status: 500 }
    );
  }
}
