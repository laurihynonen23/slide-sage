import { NextRequest } from "next/server";
import { loadAppState, readAssetBuffer } from "@/lib/persistence";
import { getWorkspaceId } from "@/lib/user-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  try {
    const { slideId } = await params;
    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const slide = state.slides.find((item) => item.id === slideId);

    if (!slide || !slide.thumbnail_path) {
      return Response.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    const buffer = await readAssetBuffer(slide.thumbnail_path);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving thumbnail:", error);
    return Response.json(
      { error: "Failed to serve thumbnail" },
      { status: 500 }
    );
  }
}
