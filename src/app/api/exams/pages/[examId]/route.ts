import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { ExamPage } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const db = getDb();

    const pages = db
      .prepare("SELECT * FROM exam_pages WHERE exam_id = ? ORDER BY page_number ASC")
      .all(examId) as ExamPage[];

    return Response.json(pages);
  } catch (error) {
    console.error("Error fetching exam pages:", error);
    return Response.json(
      { error: "Failed to fetch exam pages" },
      { status: 500 }
    );
  }
}
