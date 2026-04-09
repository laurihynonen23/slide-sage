import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import type { Deck, ExamDocument, ExamPage, Slide } from "./types";
import {
  deckAssetPrefix,
  examAssetPrefix,
  loadAppState,
  readAssetBuffer,
  saveAppState,
  sanitizeFilename,
  sourceAssetPath,
  writeAssetBuffer,
} from "./persistence";

type ProgressStage = "converting" | "thumbnail";

let pdfRuntimePromise: Promise<{
  createCanvas: typeof import("@napi-rs/canvas").createCanvas;
  getDocument: typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument;
}> | null = null;

function extensionFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext || "bin";
}

function contentTypeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

async function getPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = (async () => {
      const canvas = await import("@napi-rs/canvas");
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

      const globalScope = globalThis as unknown as {
        DOMMatrix?: typeof canvas.DOMMatrix;
        ImageData?: typeof canvas.ImageData;
        Path2D?: typeof canvas.Path2D;
      };

      if (!globalScope.DOMMatrix) globalScope.DOMMatrix = canvas.DOMMatrix;
      if (!globalScope.ImageData) globalScope.ImageData = canvas.ImageData;
      if (!globalScope.Path2D) globalScope.Path2D = canvas.Path2D;

      return {
        createCanvas: canvas.createCanvas,
        getDocument: pdfjs.getDocument,
      };
    })();
  }

  return pdfRuntimePromise;
}

function getTitleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/i, "");
}

async function renderPdfPages(
  pdfBuffer: Buffer,
  onProgress?: (stage: ProgressStage, current: number, total: number) => void
): Promise<Array<{ imageBuffer: Buffer; width: number; height: number }>> {
  const { createCanvas, getDocument } = await getPdfRuntime();
  const init = {
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  };
  const document = await getDocument(init as Parameters<typeof getDocument>[0]).promise;

  const renderedPages: Array<{ imageBuffer: Buffer; width: number; height: number }> = [];
  const total = document.numPages;
  onProgress?.("converting", 0, total);

  for (let index = 1; index <= total; index++) {
    const page = await document.getPage(index);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(1, 1600 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const imageBuffer = await canvas.encode("png");

    renderedPages.push({ imageBuffer, width, height });
    onProgress?.("thumbnail", index, total);
  }

  return renderedPages;
}

export async function processPdfStreaming(
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string,
  type: "deck" | "exam" = "deck",
  onProgress?: (stage: ProgressStage, current: number, total: number) => void
): Promise<string> {
  return processPdf(userId, fileBuffer, originalFilename, type, onProgress);
}

export async function processPdf(
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string,
  type: "deck" | "exam" = "deck",
  onProgress?: (stage: ProgressStage, current: number, total: number) => void
): Promise<string> {
  const id = uuidv4();
  const extension = extensionFromFilename(originalFilename);
  const title = getTitleFromFilename(originalFilename);
  const state = await loadAppState(userId);
  const assetPrefix = type === "deck" ? deckAssetPrefix(userId, id) : examAssetPrefix(userId, id);

  await writeAssetBuffer(
    sourceAssetPath(userId, id, type, extension),
    fileBuffer,
    contentTypeFromExtension(extension)
  );

  const renderedPages = await renderPdfPages(fileBuffer, onProgress);
  const createdAt = new Date().toISOString();

  if (type === "deck") {
    const deck: Deck = {
      id,
      title,
      original_filename: sanitizeFilename(originalFilename),
      page_count: renderedPages.length,
      created_at: createdAt,
      updated_at: createdAt,
    };

    state.decks = [deck, ...state.decks];

    const newSlides: Slide[] = [];
    for (const [index, page] of renderedPages.entries()) {
      const slideNumber = index + 1;
      const imagePath = `${assetPrefix}slide_${slideNumber}.png`;
      const thumbnailPath = `${assetPrefix}thumb_${slideNumber}.png`;
      const thumbnailBuffer = await sharp(page.imageBuffer).resize(300).png().toBuffer();

      await writeAssetBuffer(imagePath, page.imageBuffer, "image/png");
      await writeAssetBuffer(thumbnailPath, thumbnailBuffer, "image/png");

      newSlides.push({
        id: uuidv4(),
        deck_id: id,
        slide_number: slideNumber,
        image_path: imagePath,
        thumbnail_path: thumbnailPath,
        extracted_text: "",
        width: page.width,
        height: page.height,
      });
    }

    state.slides.push(...newSlides);
  } else {
    const exam: ExamDocument = {
      id,
      title,
      original_filename: sanitizeFilename(originalFilename),
      page_count: renderedPages.length,
      created_at: createdAt,
    };

    state.exams = [exam, ...state.exams];

    const newPages: ExamPage[] = [];
    for (const [index, page] of renderedPages.entries()) {
      const pageNumber = index + 1;
      const imagePath = `${assetPrefix}slide_${pageNumber}.png`;
      const thumbnailPath = `${assetPrefix}thumb_${pageNumber}.png`;
      const thumbnailBuffer = await sharp(page.imageBuffer).resize(300).png().toBuffer();

      await writeAssetBuffer(imagePath, page.imageBuffer, "image/png");
      await writeAssetBuffer(thumbnailPath, thumbnailBuffer, "image/png");

      newPages.push({
        id: uuidv4(),
        exam_id: id,
        page_number: pageNumber,
        image_path: imagePath,
        extracted_text: "",
      });
    }

    state.examPages.push(...newPages);
  }

  await saveAppState(userId, state);
  return id;
}

export async function processImage(
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string,
  type: "deck" | "exam" = "deck"
): Promise<string> {
  const id = uuidv4();
  const extension = extensionFromFilename(originalFilename);
  const title = getTitleFromFilename(originalFilename);
  const state = await loadAppState(userId);
  const assetPrefix = type === "deck" ? deckAssetPrefix(userId, id) : examAssetPrefix(userId, id);
  const sourcePath = sourceAssetPath(userId, id, type, extension);
  const imagePath = `${assetPrefix}slide_1.png`;
  const thumbnailPath = `${assetPrefix}thumb_1.png`;

  const image = sharp(fileBuffer);
  const metadata = await image.metadata();
  const normalizedImage = await image.png().toBuffer();
  const thumbnailBuffer = await sharp(normalizedImage).resize(300).png().toBuffer();
  const createdAt = new Date().toISOString();

  await writeAssetBuffer(sourcePath, fileBuffer, contentTypeFromExtension(extension));
  await writeAssetBuffer(imagePath, normalizedImage, "image/png");
  await writeAssetBuffer(thumbnailPath, thumbnailBuffer, "image/png");

  if (type === "deck") {
    const deck: Deck = {
      id,
      title,
      original_filename: sanitizeFilename(originalFilename),
      page_count: 1,
      created_at: createdAt,
      updated_at: createdAt,
    };

    state.decks = [deck, ...state.decks];
    state.slides.push({
      id: uuidv4(),
      deck_id: id,
      slide_number: 1,
      image_path: imagePath,
      thumbnail_path: thumbnailPath,
      extracted_text: "",
      width: metadata.width || 0,
      height: metadata.height || 0,
    });
  } else {
    const exam: ExamDocument = {
      id,
      title,
      original_filename: sanitizeFilename(originalFilename),
      page_count: 1,
      created_at: createdAt,
    };

    state.exams = [exam, ...state.exams];
    state.examPages.push({
      id: uuidv4(),
      exam_id: id,
      page_number: 1,
      image_path: imagePath,
      extracted_text: "",
    });
  }

  await saveAppState(userId, state);
  return id;
}

export async function cropSlideRegion(
  slideImagePath: string,
  region: { x: number; y: number; width: number; height: number; slideWidth: number; slideHeight: number }
): Promise<Buffer> {
  const imageBuffer = await readAssetBuffer(slideImagePath);
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  const scaleX = metadata.width / region.slideWidth;
  const scaleY = metadata.height / region.slideHeight;

  const left = Math.max(0, Math.round(region.x * scaleX));
  const top = Math.max(0, Math.round(region.y * scaleY));
  const width = Math.min(metadata.width - left, Math.round(region.width * scaleX));
  const height = Math.min(metadata.height - top, Math.round(region.height * scaleY));

  return image
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
}
