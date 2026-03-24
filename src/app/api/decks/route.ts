import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { Deck } from "@/lib/types";

export async function GET() {
  try {
    const db = getDb();
    const decks = db
      .prepare("SELECT * FROM decks ORDER BY created_at DESC")
      .all() as Deck[];

    return Response.json(decks);
  } catch (error) {
    console.error("Error fetching decks:", error);
    return Response.json(
      { error: "Failed to fetch decks" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Missing deck id" }, { status: 400 });
    }

    const db = getDb();

    // Slides are deleted via CASCADE
    db.prepare("DELETE FROM decks WHERE id = ?").run(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting deck:", error);
    return Response.json(
      { error: "Failed to delete deck" },
      { status: 500 }
    );
  }
}
