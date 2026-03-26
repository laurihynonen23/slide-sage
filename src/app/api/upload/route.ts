import { NextRequest } from "next/server";
import { processPdfStreaming, processImage } from "@/lib/pdf-processor";

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: string) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      }

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const type = (formData.get("type") as "deck" | "exam") || "deck";

        if (!file) {
          send("error", JSON.stringify({ error: "No file provided" }));
          controller.close();
          return;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = file.name;
        const ext = filename.split(".").pop()?.toLowerCase();

        send("progress", JSON.stringify({ stage: "uploading", message: `Uploading ${filename}...` }));

        let id: string;

        if (ext === "pdf") {
          id = await processPdfStreaming(buffer, filename, type, (stage, current, total) => {
            if (stage === "converting") {
              send("progress", JSON.stringify({ stage, message: `Converting ${total} pages to images...` }));
            } else if (stage === "thumbnail") {
              send("progress", JSON.stringify({ stage, message: `Processing thumbnails (${current}/${total})...`, current, total }));
            }
          });
        } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
          send("progress", JSON.stringify({ stage: "converting", message: `Processing image...` }));
          id = await processImage(buffer, filename, type);
        } else {
          send("error", JSON.stringify({ error: "Unsupported file type. Please upload a PDF, PNG, or JPG file." }));
          controller.close();
          return;
        }

        send("complete", JSON.stringify({ id, type }));
      } catch (error) {
        console.error("Upload error:", error);
        send("error", JSON.stringify({ error: "Failed to process file" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
