import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { ExamPage } from "@/lib/types";
import fs from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const db = getDb();

    const page = db
      .prepare("SELECT * FROM exam_pages WHERE id = ?")
      .get(pageId) as ExamPage | undefined;

    if (!page || !page.image_path) {
      return Response.json({ error: "Exam page not found" }, { status: 404 });
    }

    if (!fs.existsSync(page.image_path)) {
      return Response.json({ error: "Image file not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(page.image_path);

    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000",
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
