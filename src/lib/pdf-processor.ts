import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";

const PROCESSED_DIR = path.join(process.cwd(), "data", "processed");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function processPdfStreaming(
  fileBuffer: Buffer,
  originalFilename: string,
  type: "deck" | "exam" = "deck",
  onProgress?: (stage: "converting" | "thumbnail", current: number, total: number) => void
): Promise<string> {
  return processPdf(fileBuffer, originalFilename, type, onProgress);
}

export async function processPdf(
  fileBuffer: Buffer,
  originalFilename: string,
  type: "deck" | "exam" = "deck",
  onProgress?: (stage: "converting" | "thumbnail", current: number, total: number) => void
): Promise<string> {
  const id = uuidv4();
  const outputDir = path.join(PROCESSED_DIR, type === "deck" ? "decks" : "exams", id);
  ensureDir(outputDir);

  // Save original file
  const originalPath = path.join(outputDir, originalFilename);
  fs.writeFileSync(originalPath, fileBuffer);

  // Get page count from PDF
  const pdfDoc = await PDFDocument.load(fileBuffer);
  const pageCount = pdfDoc.getPageCount();

  const db = getDb();

  if (type === "deck") {
    const title = originalFilename.replace(/\.pdf$/i, "");
    db.prepare(
      `INSERT INTO decks (id, title, original_filename, page_count) VALUES (?, ?, ?, ?)`
    ).run(id, title, originalFilename, pageCount);

    onProgress?.("converting", 0, pageCount);
    await processPages(id, fileBuffer, pageCount, outputDir, "deck", onProgress);
  } else {
    const title = originalFilename.replace(/\.pdf$/i, "");
    db.prepare(
      `INSERT INTO exam_documents (id, title, original_filename, page_count) VALUES (?, ?, ?, ?)`
    ).run(id, title, originalFilename, pageCount);

    onProgress?.("converting", 0, pageCount);
    await processPages(id, fileBuffer, pageCount, outputDir, "exam", onProgress);
  }

  return id;
}

export async function processImage(
  fileBuffer: Buffer,
  originalFilename: string,
  type: "deck" | "exam" = "deck"
): Promise<string> {
  const id = uuidv4();
  const outputDir = path.join(PROCESSED_DIR, type === "deck" ? "decks" : "exams", id);
  ensureDir(outputDir);

  const db = getDb();

  // Process image with sharp
  const image = sharp(fileBuffer);
  const metadata = await image.metadata();

  const imagePath = path.join(outputDir, "slide_1.png");
  const thumbPath = path.join(outputDir, "thumb_1.png");

  await image.png().toFile(imagePath);
  await image.resize(300).png().toFile(thumbPath);

  if (type === "deck") {
    const title = originalFilename.replace(/\.(png|jpg|jpeg)$/i, "");
    db.prepare(
      `INSERT INTO decks (id, title, original_filename, page_count) VALUES (?, ?, ?, ?)`
    ).run(id, title, originalFilename, 1);

    const slideId = uuidv4();
    db.prepare(
      `INSERT INTO slides (id, deck_id, slide_number, image_path, thumbnail_path, extracted_text, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(slideId, id, 1, imagePath, thumbPath, "", metadata.width || 0, metadata.height || 0);
  } else {
    db.prepare(
      `INSERT INTO exam_documents (id, title, original_filename, page_count) VALUES (?, ?, ?, ?)`
    ).run(id, originalFilename.replace(/\.(png|jpg|jpeg)$/i, ""), originalFilename, 1);

    const pageId = uuidv4();
    db.prepare(
      `INSERT INTO exam_pages (id, exam_id, page_number, image_path, extracted_text) VALUES (?, ?, ?, ?, ?)`
    ).run(pageId, id, 1, imagePath, "");
  }

  return id;
}

async function processPages(
  parentId: string,
  pdfBuffer: Buffer,
  pageCount: number,
  outputDir: string,
  type: "deck" | "exam",
  onProgress?: (stage: "converting" | "thumbnail", current: number, total: number) => void
) {
  const db = getDb();

  // We'll convert PDF pages to images using pdftoppm or a Node-based approach
  // For robustness, we'll extract individual page PDFs then convert with sharp via pdf rendering
  // Since sharp can't directly render PDFs, we'll use the pdftocairo/pdftoppm system utility
  // or fall back to a pure-JS approach

  // Try system pdftoppm first (most reliable for quality)
  const hasPdftoppm = await checkCommand("pdftoppm");

  if (hasPdftoppm) {
    await convertWithPdftoppm(pdfBuffer, outputDir, parentId, pageCount, type, onProgress);
  } else {
    await convertWithSips(pdfBuffer, outputDir, parentId, pageCount, type, onProgress);
  }
}

async function checkCommand(cmd: string): Promise<boolean> {
  const { exec } = require("child_process");
  return new Promise((resolve) => {
    exec(`which ${cmd}`, (error: Error | null) => {
      resolve(!error);
    });
  });
}

async function convertWithPdftoppm(
  pdfBuffer: Buffer,
  outputDir: string,
  parentId: string,
  pageCount: number,
  type: "deck" | "exam",
  onProgress?: (stage: "converting" | "thumbnail", current: number, total: number) => void
) {
  const { execSync } = require("child_process");
  const db = getDb();

  const pdfPath = path.join(outputDir, "source.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  // Convert all pages to PNG
  execSync(`pdftoppm -png -r 200 "${pdfPath}" "${path.join(outputDir, "page")}"`, {
    timeout: 120000,
  });

  for (let i = 1; i <= pageCount; i++) {
    const paddedNum = String(i).padStart(pageCount > 99 ? 3 : pageCount > 9 ? 2 : 1, "0");
    // pdftoppm names files as page-01.png, page-02.png, etc.
    let srcFile = path.join(outputDir, `page-${paddedNum}.png`);

    // Try different padding schemes
    if (!fs.existsSync(srcFile)) {
      srcFile = path.join(outputDir, `page-${String(i).padStart(2, "0")}.png`);
    }
    if (!fs.existsSync(srcFile)) {
      srcFile = path.join(outputDir, `page-${String(i).padStart(3, "0")}.png`);
    }
    if (!fs.existsSync(srcFile)) {
      srcFile = path.join(outputDir, `page-${i}.png`);
    }

    const imagePath = path.join(outputDir, `slide_${i}.png`);
    const thumbPath = path.join(outputDir, `thumb_${i}.png`);

    if (fs.existsSync(srcFile)) {
      fs.renameSync(srcFile, imagePath);
      onProgress?.("thumbnail", i, pageCount);

      // Generate thumbnail
      await sharp(imagePath).resize(300).png().toFile(thumbPath);

      const metadata = await sharp(imagePath).metadata();

      // Extract text using basic approach (the AI will handle visual understanding)
      const slideId = uuidv4();

      if (type === "deck") {
        db.prepare(
          `INSERT INTO slides (id, deck_id, slide_number, image_path, thumbnail_path, extracted_text, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(slideId, parentId, i, imagePath, thumbPath, "", metadata.width || 0, metadata.height || 0);
      } else {
        db.prepare(
          `INSERT INTO exam_pages (id, exam_id, page_number, image_path, extracted_text) VALUES (?, ?, ?, ?, ?)`
        ).run(slideId, parentId, i, imagePath, "");
      }
    }
  }
}

async function convertWithSips(
  pdfBuffer: Buffer,
  outputDir: string,
  parentId: string,
  pageCount: number,
  type: "deck" | "exam",
  onProgress?: (stage: "converting" | "thumbnail", current: number, total: number) => void
) {
  const { execSync } = require("child_process");
  const db = getDb();
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  for (let i = 0; i < pageCount; i++) {
    const singlePagePdf = await PDFDocument.create();
    const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
    singlePagePdf.addPage(copiedPage);
    const singlePageBytes = await singlePagePdf.save();

    const singlePdfPath = path.join(outputDir, `page_${i + 1}.pdf`);
    const imagePath = path.join(outputDir, `slide_${i + 1}.png`);
    const thumbPath = path.join(outputDir, `thumb_${i + 1}.png`);

    fs.writeFileSync(singlePdfPath, singlePageBytes);

    try {
      // Use sips on macOS to convert PDF to PNG
      execSync(
        `sips -s format png "${singlePdfPath}" --out "${imagePath}" --resampleWidth 1600 2>/dev/null`,
        { timeout: 30000 }
      );
    } catch {
      // If sips fails, try convert (ImageMagick)
      try {
        execSync(`convert -density 200 "${singlePdfPath}" "${imagePath}"`, { timeout: 30000 });
      } catch {
        // Last resort: create a placeholder
        await sharp({
          create: { width: 800, height: 600, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } }
        }).png().toFile(imagePath);
      }
    }

    if (fs.existsSync(imagePath)) {
      onProgress?.("thumbnail", i + 1, pageCount);
      await sharp(imagePath).resize(300).png().toFile(thumbPath);
      const metadata = await sharp(imagePath).metadata();

      const slideId = uuidv4();
      if (type === "deck") {
        db.prepare(
          `INSERT INTO slides (id, deck_id, slide_number, image_path, thumbnail_path, extracted_text, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(slideId, parentId, i + 1, imagePath, thumbPath, "", metadata.width || 0, metadata.height || 0);
      } else {
        db.prepare(
          `INSERT INTO exam_pages (id, exam_id, page_number, image_path, extracted_text) VALUES (?, ?, ?, ?, ?)`
        ).run(slideId, parentId, i + 1, imagePath, "");
      }
    }

    // Clean up single page PDF
    try { fs.unlinkSync(singlePdfPath); } catch {}
  }
}

export async function cropSlideRegion(
  slideImagePath: string,
  region: { x: number; y: number; width: number; height: number; slideWidth: number; slideHeight: number }
): Promise<Buffer> {
  const image = sharp(slideImagePath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  // Scale region coordinates to actual image dimensions
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
