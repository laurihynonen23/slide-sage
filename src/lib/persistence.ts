import fs from "fs";
import path from "path";
import { del, get, list, put } from "@vercel/blob";
import type {
  Deck,
  ExamDocument,
  ExamPage,
  Quiz,
  Slide,
  SlideRelevance,
} from "./types";
import { isBlobStorageEnabled } from "./storage-env";

const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const LOCAL_STATE_PATH = path.join(DATA_DIR, "app-state.json");
const LOCAL_LEGACY_DB_PATH = path.join(DATA_DIR, "slide-sage.db");
const BLOB_STATE_PATH = "state/app-state.json";

export interface AppState {
  version: 1;
  decks: Deck[];
  slides: Slide[];
  exams: ExamDocument[];
  examPages: ExamPage[];
  settings: Record<string, string>;
  quizzes: Quiz[];
  slideRelevance: SlideRelevance[];
}

const EMPTY_STATE: AppState = {
  version: 1,
  decks: [],
  slides: [],
  exams: [],
  examPages: [],
  settings: {},
  quizzes: [],
  slideRelevance: [],
};

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.-]+/g, "_");
}

export function deckAssetPrefix(deckId: string): string {
  return `processed/decks/${deckId}/`;
}

export function examAssetPrefix(examId: string): string {
  return `processed/exams/${examId}/`;
}

export function sourceAssetPath(id: string, type: "deck" | "exam", extension: string): string {
  const safeExtension = extension.replace(/^\./, "").toLowerCase() || "bin";
  return `${type === "deck" ? deckAssetPrefix(id) : examAssetPrefix(id)}source.${safeExtension}`;
}

function normalizeAssetPath(assetPath: string): string {
  if (path.isAbsolute(assetPath)) {
    const relative = path.relative(DATA_DIR, assetPath);
    return relative.split(path.sep).join("/");
  }

  return assetPath.split(path.sep).join("/");
}

function resolveLocalPath(assetPath: string): string {
  if (path.isAbsolute(assetPath)) return assetPath;
  return path.join(DATA_DIR, assetPath);
}

function ensureLocalDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function loadBlobState(): Promise<AppState> {
  const result = await get(BLOB_STATE_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return structuredClone(EMPTY_STATE);
  }

  const buffer = await streamToBuffer(result.stream);
  return validateState(JSON.parse(buffer.toString("utf8")));
}

async function saveBlobState(state: AppState): Promise<void> {
  await put(BLOB_STATE_PATH, JSON.stringify(state), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function migrateLegacySqliteIfNeeded(): Promise<AppState | null> {
  if (!fs.existsSync(LOCAL_LEGACY_DB_PATH)) {
    return null;
  }

  const BetterSqlite3 = (await import("better-sqlite3")).default;
  const db = new BetterSqlite3(LOCAL_LEGACY_DB_PATH, { readonly: true });

  try {
    const decks = db.prepare("SELECT * FROM decks ORDER BY created_at DESC").all() as Deck[];
    const slides = db.prepare("SELECT * FROM slides ORDER BY deck_id ASC, slide_number ASC").all() as Slide[];
    const exams = db.prepare("SELECT * FROM exam_documents ORDER BY created_at DESC").all() as ExamDocument[];
    const examPages = db.prepare("SELECT * FROM exam_pages ORDER BY exam_id ASC, page_number ASC").all() as ExamPage[];

    const hasSettingsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
      .get() as { name: string } | undefined;

    const settingsRows = hasSettingsTable
      ? db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[]
      : [];

    const quizzes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quizzes'")
      .get()
      ? (db.prepare("SELECT * FROM quizzes ORDER BY created_at DESC").all() as Array<Omit<Quiz, "questions"> & { questions: string | unknown[] }>)
          .map((quiz) => ({
            ...quiz,
            questions: Array.isArray(quiz.questions)
              ? quiz.questions
              : JSON.parse(typeof quiz.questions === "string" ? quiz.questions : "[]"),
          }))
      : [];

    const slideRelevance = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'slide_relevance'")
      .get()
      ? (db.prepare("SELECT * FROM slide_relevance").all() as SlideRelevance[])
      : [];

    const state: AppState = {
      version: 1,
      decks,
      slides: slides.map((slide) => ({
        ...slide,
        image_path: slide.image_path ? normalizeAssetPath(slide.image_path) : null,
        thumbnail_path: slide.thumbnail_path ? normalizeAssetPath(slide.thumbnail_path) : null,
      })),
      exams,
      examPages: examPages.map((page) => ({
        ...page,
        image_path: page.image_path ? normalizeAssetPath(page.image_path) : null,
      })),
      settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
      quizzes,
      slideRelevance,
    };

    return state;
  } finally {
    db.close();
  }
}

async function loadLocalState(): Promise<AppState> {
  if (fs.existsSync(LOCAL_STATE_PATH)) {
    const raw = await fs.promises.readFile(LOCAL_STATE_PATH, "utf8");
    return validateState(JSON.parse(raw));
  }

  const migrated = await migrateLegacySqliteIfNeeded();
  if (migrated) {
    await saveLocalState(migrated);
    return migrated;
  }

  return structuredClone(EMPTY_STATE);
}

async function saveLocalState(state: AppState): Promise<void> {
  ensureLocalDir(LOCAL_STATE_PATH);
  await fs.promises.writeFile(LOCAL_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function validateState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") {
    return structuredClone(EMPTY_STATE);
  }

  const candidate = raw as Partial<AppState>;
  return {
    version: 1,
    decks: Array.isArray(candidate.decks) ? candidate.decks : [],
    slides: Array.isArray(candidate.slides) ? candidate.slides : [],
    exams: Array.isArray(candidate.exams) ? candidate.exams : [],
    examPages: Array.isArray(candidate.examPages) ? candidate.examPages : [],
    settings:
      candidate.settings && typeof candidate.settings === "object" && !Array.isArray(candidate.settings)
        ? candidate.settings as Record<string, string>
        : {},
    quizzes: Array.isArray(candidate.quizzes) ? candidate.quizzes : [],
    slideRelevance: Array.isArray(candidate.slideRelevance) ? candidate.slideRelevance : [],
  };
}

export async function loadAppState(): Promise<AppState> {
  if (isBlobStorageEnabled()) {
    return loadBlobState();
  }

  return loadLocalState();
}

export async function saveAppState(state: AppState): Promise<void> {
  if (isBlobStorageEnabled()) {
    await saveBlobState(state);
    return;
  }

  await saveLocalState(state);
}

export async function readAssetBuffer(assetPath: string): Promise<Buffer> {
  if (isBlobStorageEnabled()) {
    const result = await get(assetPath, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Asset not found: ${assetPath}`);
    }
    return streamToBuffer(result.stream);
  }

  return fs.promises.readFile(resolveLocalPath(assetPath));
}

export async function writeAssetBuffer(assetPath: string, body: Buffer, contentType: string): Promise<void> {
  if (isBlobStorageEnabled()) {
    await put(assetPath, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return;
  }

  const localPath = resolveLocalPath(assetPath);
  ensureLocalDir(localPath);
  await fs.promises.writeFile(localPath, body);
}

export async function deleteAssetsWithPrefix(prefix: string): Promise<void> {
  if (isBlobStorageEnabled()) {
    const pathnames: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      pathnames.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    if (pathnames.length > 0) {
      await del(pathnames);
    }
    return;
  }

  await fs.promises.rm(resolveLocalPath(prefix), { recursive: true, force: true });
}

export async function deleteAsset(assetPath: string): Promise<void> {
  if (isBlobStorageEnabled()) {
    await del(assetPath);
    return;
  }

  await fs.promises.rm(resolveLocalPath(assetPath), { force: true });
}
