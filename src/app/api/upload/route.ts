import { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { processImage, processPdfStreaming } from "@/lib/pdf-processor";
import { incomingAssetPrefix } from "@/lib/persistence";
import { getUploadMode } from "@/lib/storage-env";
import { getWorkspaceId } from "@/lib/user-session";

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

export async function GET() {
  const workspaceId = await getWorkspaceId();
  return Response.json({ mode: getUploadMode(), workspaceId });
}

export async function POST(request: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const uploadMode = getUploadMode();
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    if (uploadMode !== "blob") {
      return Response.json({ error: "Direct blob uploads are not configured." }, { status: 400 });
    }

    try {
      const body = await request.json() as HandleUploadBody;
      const jsonResponse = await handleUpload({
        request,
        body,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(incomingAssetPrefix(workspaceId))) {
            throw new Error("Invalid upload target for this workspace.");
          }

          return {
            allowedContentTypes: ["application/pdf", "image/png", "image/jpeg"],
            maximumSizeInBytes: 100 * 1024 * 1024,
            addRandomSuffix: false,
            allowOverwrite: true,
          };
        },
      });

      return Response.json(jsonResponse);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 }
      );
    }
  }

  if (uploadMode === "unsupported") {
    return Response.json(
      { error: "Uploads require Vercel Blob on hosted deployments. Configure BLOB_READ_WRITE_TOKEN first." },
      { status: 503 }
    );
  }

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
          id = await processPdfStreaming(workspaceId, buffer, filename, type, (stage, current, total) => {
            if (stage === "converting") {
              send("progress", JSON.stringify({ stage, message: `Converting ${total} pages to images...` }));
            } else if (stage === "thumbnail") {
              send("progress", JSON.stringify({ stage, message: `Processing thumbnails (${current}/${total})...`, current, total }));
            }
          });
        } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
          send("progress", JSON.stringify({ stage: "converting", message: "Processing image..." }));
          id = await processImage(workspaceId, buffer, filename, type);
        } else {
          send("error", JSON.stringify({ error: "Unsupported file type. Please upload a PDF, PNG, or JPG file." }));
          controller.close();
          return;
        }

        send("complete", JSON.stringify({ id, type }));
      } catch (error) {
        console.error("Upload error:", error);
        const message = error instanceof Error ? error.message : String(error);
        send("error", JSON.stringify({ error: message || "Failed to process file" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
