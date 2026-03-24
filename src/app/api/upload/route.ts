import { NextRequest } from "next/server";
import { processPdf, processImage } from "@/lib/pdf-processor";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as "deck" | "exam") || "deck";

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase();

    let id: string;

    if (ext === "pdf") {
      id = await processPdf(buffer, filename, type);
    } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      id = await processImage(buffer, filename, type);
    } else {
      return Response.json(
        { error: "Unsupported file type. Please upload a PDF, PNG, or JPG file." },
        { status: 400 }
      );
    }

    return Response.json({ id, type });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}
