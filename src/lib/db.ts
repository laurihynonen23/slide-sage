import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "slide-sage.db");

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slides (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL,
      slide_number INTEGER NOT NULL,
      image_path TEXT,
      thumbnail_path TEXT,
      extracted_text TEXT DEFAULT '',
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exam_pages (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      image_path TEXT,
      extracted_text TEXT DEFAULT '',
      FOREIGN KEY (exam_id) REFERENCES exam_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      deck_id TEXT,
      slide_id TEXT,
      exam_id TEXT,
      context_mode TEXT NOT NULL DEFAULT 'current_slide',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      slide_number INTEGER,
      region_data TEXT,
      difficulty TEXT DEFAULT 'normal',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL,
      source_scope TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'normal',
      questions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slide_relevance (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      slide_range TEXT NOT NULL,
      reason TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (exam_id) REFERENCES exam_documents(id) ON DELETE CASCADE
    );
  `);
}
