import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { Slide } from "@/lib/types";
import fs from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slideId: string }> }
) {
  try {
    const { slideId } = await params;
    const db = getDb();

    const slide = db
      .prepare("SELECT * FROM slides WHERE id = ?")
      .get(slideId) as Slide | undefined;

    if (!slide || !slide.thumbnail_path) {
      return Response.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    if (!fs.existsSync(slide.thumbnail_path)) {
      return Response.json({ error: "Thumbnail file not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(slide.thumbnail_path);

    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000",
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
