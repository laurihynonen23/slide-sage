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
const USERS_DIR = path.join(DATA_DIR, "users");
const LEGACY_LOCAL_STATE_PATH = path.join(DATA_DIR, "app-state.json");
const LEGACY_LOCAL_DB_PATH = path.join(DATA_DIR, "slide-sage.db");

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

export interface WorkspaceInfo {
  workspaceId: string;
  hasPersonalData: boolean;
  legacySharedLibraryAvailable: boolean;
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

function cloneEmptyState(): AppState {
  return structuredClone(EMPTY_STATE);
}

function userBlobBasePath(userId: string): string {
  return `users/${userId}`;
}

function userBlobStatePath(userId: string): string {
  return `${userBlobBasePath(userId)}/state/app-state.json`;
}

function userLocalDir(userId: string): string {
  return path.join(USERS_DIR, userId);
}

function userLocalStatePath(userId: string): string {
  return path.join(userLocalDir(userId), "app-state.json");
}

function legacyDeckAssetPrefix(deckId: string): string {
  return `processed/decks/${deckId}/`;
}

function legacyExamAssetPrefix(examId: string): string {
  return `processed/exams/${examId}/`;
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.-]+/g, "_");
}

export function incomingAssetPrefix(userId: string, type?: "deck" | "exam"): string {
  return type ? `incoming/${userId}/${type}/` : `incoming/${userId}/`;
}

export function deckAssetPrefix(userId: string, deckId: string): string {
  return `${userBlobBasePath(userId)}/processed/decks/${deckId}/`;
}

export function examAssetPrefix(userId: string, examId: string): string {
  return `${userBlobBasePath(userId)}/processed/exams/${examId}/`;
}

export function sourceAssetPath(
  userId: string,
  id: string,
  type: "deck" | "exam",
  extension: string
): string {
  const safeExtension = extension.replace(/^\./, "").toLowerCase() || "bin";
  return `${type === "deck" ? deckAssetPrefix(userId, id) : examAssetPrefix(userId, id)}source.${safeExtension}`;
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

function isAppStateEmpty(state: AppState): boolean {
  return (
    state.decks.length === 0 &&
    state.slides.length === 0 &&
    state.exams.length === 0 &&
    state.examPages.length === 0 &&
    state.quizzes.length === 0 &&
    state.slideRelevance.length === 0 &&
    Object.keys(state.settings).length === 0
  );
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

function validateState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") {
    return cloneEmptyState();
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

async function loadBlobStateAtPath(pathname: string): Promise<AppState | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const buffer = await streamToBuffer(result.stream);
  return validateState(JSON.parse(buffer.toString("utf8")));
}

async function saveBlobStateAtPath(pathname: string, state: AppState): Promise<void> {
  await put(pathname, JSON.stringify(state), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function migrateLegacySqliteIfNeeded(): Promise<AppState | null> {
  if (!fs.existsSync(LEGACY_LOCAL_DB_PATH)) {
    return null;
  }

  const BetterSqlite3 = (await import("better-sqlite3")).default;
  const db = new BetterSqlite3(LEGACY_LOCAL_DB_PATH, { readonly: true });

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

    return {
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
  } finally {
    db.close();
  }
}

async function loadLegacyLocalState(): Promise<AppState | null> {
  if (fs.existsSync(LEGACY_LOCAL_STATE_PATH)) {
    const raw = await fs.promises.readFile(LEGACY_LOCAL_STATE_PATH, "utf8");
    return validateState(JSON.parse(raw));
  }

  return migrateLegacySqliteIfNeeded();
}

async function loadLocalUserState(userId: string): Promise<AppState | null> {
  const statePath = userLocalStatePath(userId);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  const raw = await fs.promises.readFile(statePath, "utf8");
  return validateState(JSON.parse(raw));
}

async function saveLocalUserState(userId: string, state: AppState): Promise<void> {
  const statePath = userLocalStatePath(userId);
  ensureLocalDir(statePath);
  await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function guessContentType(assetPath: string): string {
  const lower = assetPath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function assetExists(assetPath: string): Promise<boolean> {
  if (isBlobStorageEnabled()) {
    const result = await get(assetPath, { access: "private", useCache: false });
    return Boolean(result && result.statusCode === 200);
  }

  return fs.existsSync(resolveLocalPath(assetPath));
}

async function copyAsset(fromPath: string, toPath: string): Promise<void> {
  const buffer = await readAssetBuffer(fromPath);
  await writeAssetBuffer(toPath, buffer, guessContentType(toPath));
}

async function copyFirstExistingAsset(candidates: string[], targetPath: string): Promise<void> {
  for (const candidate of candidates) {
    if (await assetExists(candidate)) {
      await copyAsset(candidate, targetPath);
      return;
    }
  }
}

function rewriteLegacyStateForUser(userId: string, legacyState: AppState): AppState {
  return {
    version: 1,
    decks: legacyState.decks.map((deck) => ({ ...deck })),
    slides: legacyState.slides.map((slide) => ({
      ...slide,
      image_path: slide.image_path ? `${deckAssetPrefix(userId, slide.deck_id)}slide_${slide.slide_number}.png` : null,
      thumbnail_path: slide.thumbnail_path ? `${deckAssetPrefix(userId, slide.deck_id)}thumb_${slide.slide_number}.png` : null,
    })),
    exams: legacyState.exams.map((exam) => ({ ...exam })),
    examPages: legacyState.examPages.map((page) => ({
      ...page,
      image_path: page.image_path ? `${examAssetPrefix(userId, page.exam_id)}slide_${page.page_number}.png` : null,
    })),
    settings: { ...legacyState.settings },
    quizzes: legacyState.quizzes.map((quiz) => ({
      ...quiz,
      questions: quiz.questions.map((question) => ({ ...question })),
    })),
    slideRelevance: legacyState.slideRelevance.map((item) => ({ ...item })),
  };
}

async function copyLegacyAssetsToUser(userId: string, legacyState: AppState): Promise<void> {
  for (const deck of legacyState.decks) {
    const extension = path.extname(deck.original_filename || "").replace(/^\./, "").toLowerCase() || "pdf";
    await copyFirstExistingAsset(
      [
        sourceAssetPath(userId, deck.id, "deck", extension).replace(`${userBlobBasePath(userId)}/`, ""),
        `${legacyDeckAssetPrefix(deck.id)}source.${extension}`,
        path.join("processed", "decks", deck.id, deck.original_filename),
      ],
      sourceAssetPath(userId, deck.id, "deck", extension)
    );
  }

  for (const slide of legacyState.slides) {
    const imagePath = `${deckAssetPrefix(userId, slide.deck_id)}slide_${slide.slide_number}.png`;
    const thumbnailPath = `${deckAssetPrefix(userId, slide.deck_id)}thumb_${slide.slide_number}.png`;

    if (slide.image_path) {
      await copyFirstExistingAsset(
        [normalizeAssetPath(slide.image_path), `${legacyDeckAssetPrefix(slide.deck_id)}slide_${slide.slide_number}.png`],
        imagePath
      );
    }

    if (slide.thumbnail_path) {
      await copyFirstExistingAsset(
        [normalizeAssetPath(slide.thumbnail_path), `${legacyDeckAssetPrefix(slide.deck_id)}thumb_${slide.slide_number}.png`],
        thumbnailPath
      );
    }
  }

  for (const exam of legacyState.exams) {
    const extension = path.extname(exam.original_filename || "").replace(/^\./, "").toLowerCase() || "pdf";
    await copyFirstExistingAsset(
      [
        `${legacyExamAssetPrefix(exam.id)}source.${extension}`,
        path.join("processed", "exams", exam.id, exam.original_filename),
      ],
      sourceAssetPath(userId, exam.id, "exam", extension)
    );
  }

  for (const page of legacyState.examPages) {
    const imagePath = `${examAssetPrefix(userId, page.exam_id)}slide_${page.page_number}.png`;

    if (page.image_path) {
      await copyFirstExistingAsset(
        [normalizeAssetPath(page.image_path), `${legacyExamAssetPrefix(page.exam_id)}slide_${page.page_number}.png`],
        imagePath
      );
    }
  }
}

export async function getWorkspaceInfo(userId: string): Promise<WorkspaceInfo> {
  const state = await loadAppState(userId);

  return {
    workspaceId: userId,
    hasPersonalData: !isAppStateEmpty(state),
    legacySharedLibraryAvailable: !isBlobStorageEnabled() && Boolean(await loadLegacyLocalState()),
  };
}

export async function loadAppState(userId: string): Promise<AppState> {
  if (isBlobStorageEnabled()) {
    const personalState = await loadBlobStateAtPath(userBlobStatePath(userId));
    if (personalState) {
      return personalState;
    }
    // Hosted workspaces must never auto-import from the legacy shared library.
    // That would assign one shared dataset to whichever browser arrives first.
    return cloneEmptyState();
  }

  const personalState = await loadLocalUserState(userId);
  if (personalState) {
    return personalState;
  }

  const legacyState = await loadLegacyLocalState();
  if (!legacyState) {
    return cloneEmptyState();
  }

  const importedState = rewriteLegacyStateForUser(userId, legacyState);
  await copyLegacyAssetsToUser(userId, legacyState);
  await saveLocalUserState(userId, importedState);
  return importedState;
}

export async function saveAppState(userId: string, state: AppState): Promise<void> {
  if (isBlobStorageEnabled()) {
    await saveBlobStateAtPath(userBlobStatePath(userId), state);
    return;
  }

  await saveLocalUserState(userId, state);
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
