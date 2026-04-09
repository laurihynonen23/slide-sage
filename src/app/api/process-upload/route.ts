import { NextRequest } from "next/server";
import { deleteAsset, incomingAssetPrefix, readAssetBuffer } from "@/lib/persistence";
import { processImage, processPdfStreaming } from "@/lib/pdf-processor";
import { getUploadMode } from "@/lib/storage-env";
import { getWorkspaceId } from "@/lib/user-session";

export async function POST(request: NextRequest) {
  if (getUploadMode() !== "blob") {
    return Response.json({ error: "Blob processing is only available when Vercel Blob is configured." }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: string) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      }

      try {
        const body = await request.json() as {
          pathname: string;
          originalFilename: string;
          type: "deck" | "exam";
        };

        if (!body.pathname || !body.originalFilename) {
          send("error", JSON.stringify({ error: "Missing upload details." }));
          controller.close();
          return;
        }

        if (!body.pathname.startsWith(incomingAssetPrefix(workspaceId))) {
          send("error", JSON.stringify({ error: "Upload does not belong to this workspace." }));
          controller.close();
          return;
        }

        const buffer = await readAssetBuffer(body.pathname);
        const ext = body.originalFilename.split(".").pop()?.toLowerCase();
        let id: string;

        if (ext === "pdf") {
          id = await processPdfStreaming(workspaceId, buffer, body.originalFilename, body.type, (stage, current, total) => {
            if (stage === "converting") {
              send("progress", JSON.stringify({ stage, message: `Converting ${total} pages to images...` }));
            } else if (stage === "thumbnail") {
              send("progress", JSON.stringify({ stage, message: `Processing thumbnails (${current}/${total})...`, current, total }));
            }
          });
        } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
          send("progress", JSON.stringify({ stage: "converting", message: "Processing image..." }));
          id = await processImage(workspaceId, buffer, body.originalFilename, body.type);
        } else {
          send("error", JSON.stringify({ error: "Unsupported file type. Please upload a PDF, PNG, or JPG file." }));
          controller.close();
          return;
        }

        try {
          await deleteAsset(body.pathname);
        } catch (cleanupError) {
          console.warn("Failed to delete temporary upload:", cleanupError);
        }

        send("complete", JSON.stringify({ id, type: body.type }));
      } catch (error) {
        console.error("Process upload error:", error);
        send("error", JSON.stringify({ error: "Failed to process uploaded file." }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
