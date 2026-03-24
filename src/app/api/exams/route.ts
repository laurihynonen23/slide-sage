import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { ExamDocument } from "@/lib/types";

export async function GET() {
  try {
    const db = getDb();
    const exams = db
      .prepare("SELECT * FROM exam_documents ORDER BY created_at DESC")
      .all() as ExamDocument[];

    return Response.json(exams);
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

    const db = getDb();

    // Exam pages are deleted via CASCADE
    db.prepare("DELETE FROM exam_documents WHERE id = ?").run(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting exam:", error);
    return Response.json(
      { error: "Failed to delete exam" },
      { status: 500 }
    );
  }
}
