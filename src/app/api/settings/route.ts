import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

// Ensure the settings table exists
function ensureSettingsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}

export async function GET() {
  try {
    const db = ensureSettingsTable();
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    // Never expose actual key values — just whether they're set
    return Response.json({
      provider: settings.provider || "anthropic",
      model: settings.model || "",
      hasAnthropicKey: !!(settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY),
      hasOpenAIKey: !!(settings.openai_api_key || process.env.OPENAI_API_KEY),
      // Mask keys: show last 4 chars only
      anthropicKeyHint: settings.anthropic_api_key ? `...${settings.anthropic_api_key.slice(-4)}` : (process.env.ANTHROPIC_API_KEY ? `...${process.env.ANTHROPIC_API_KEY.slice(-4)}` : ""),
      openaiKeyHint: settings.openai_api_key ? `...${settings.openai_api_key.slice(-4)}` : (process.env.OPENAI_API_KEY ? `...${process.env.OPENAI_API_KEY.slice(-4)}` : ""),
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return Response.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = ensureSettingsTable();
    const body = await request.json() as {
      provider?: string;
      model?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
    };

    const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

    if (body.provider) upsert.run("provider", body.provider);
    if (body.model) upsert.run("model", body.model);
    if (body.anthropicApiKey !== undefined) {
      if (body.anthropicApiKey) upsert.run("anthropic_api_key", body.anthropicApiKey);
      else db.prepare("DELETE FROM settings WHERE key = 'anthropic_api_key'").run();
    }
    if (body.openaiApiKey !== undefined) {
      if (body.openaiApiKey) upsert.run("openai_api_key", body.openaiApiKey);
      else db.prepare("DELETE FROM settings WHERE key = 'openai_api_key'").run();
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Settings POST error:", error);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
