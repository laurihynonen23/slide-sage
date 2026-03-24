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

    if (!slide || !slide.image_path) {
      return Response.json({ error: "Slide not found" }, { status: 404 });
    }

    if (!fs.existsSync(slide.image_path)) {
      return Response.json({ error: "Image file not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(slide.image_path);

    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Error serving slide image:", error);
    return Response.json(
      { error: "Failed to serve image" },
      { status: 500 }
    );
  }
}
