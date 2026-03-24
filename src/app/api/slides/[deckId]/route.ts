import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { Slide } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> }
) {
  try {
    const { deckId } = await params;
    const db = getDb();

    const slides = db
      .prepare("SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number ASC")
      .all(deckId) as Slide[];

    return Response.json(slides);
  } catch (error) {
    console.error("Error fetching slides:", error);
    return Response.json(
      { error: "Failed to fetch slides" },
      { status: 500 }
    );
  }
}
