import { NextRequest } from "next/server";
import {
  getWorkspaceInfo,
  loadAppState,
  saveAppState,
} from "@/lib/persistence";
import { canPersistApiKeys, getUploadMode, isBlobStorageEnabled } from "@/lib/storage-env";
import { getDefaultProvider } from "@/lib/provider-settings";
import { getWorkspaceId } from "@/lib/user-session";

function maskKey(value: string | undefined): string {
  return value ? `...${value.slice(-4)}` : "";
}

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    const state = await loadAppState(workspaceId);
    const workspace = await getWorkspaceInfo(workspaceId);
    const settings = state.settings;
    const allowApiKeyPersistence = canPersistApiKeys();
    const provider = getDefaultProvider(settings);

    const anthropicKey = allowApiKeyPersistence
      ? (settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "")
      : (process.env.ANTHROPIC_API_KEY || "");
    const openaiKey = allowApiKeyPersistence
      ? (settings.openai_api_key || process.env.OPENAI_API_KEY || "")
      : (process.env.OPENAI_API_KEY || "");

    return Response.json({
      provider,
      model: settings.model || process.env.AI_MODEL || "",
      hasAnthropicKey: Boolean(anthropicKey),
      hasOpenAIKey: Boolean(openaiKey),
      anthropicKeyHint: maskKey(anthropicKey),
      openaiKeyHint: maskKey(openaiKey),
      canPersistApiKeys: allowApiKeyPersistence,
      apiKeyStorage: allowApiKeyPersistence ? (isBlobStorageEnabled() ? "workspace" : "local") : "environment",
      storageBackend: isBlobStorageEnabled() ? "vercel-blob" : "local",
      uploadMode: getUploadMode(),
      workspaceId: workspace.workspaceId,
      legacySharedLibraryAvailable: workspace.legacySharedLibraryAvailable,
      hasPersonalData: workspace.hasPersonalData,
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return Response.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    const body = await request.json() as {
      provider?: string;
      model?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
    };

    const state = await loadAppState(workspaceId);

    if (body.provider) state.settings.provider = body.provider;
    if (body.model) state.settings.model = body.model;

    if (canPersistApiKeys()) {
      if (body.anthropicApiKey !== undefined) {
        if (body.anthropicApiKey) state.settings.anthropic_api_key = body.anthropicApiKey;
        else delete state.settings.anthropic_api_key;
      }

      if (body.openaiApiKey !== undefined) {
        if (body.openaiApiKey) state.settings.openai_api_key = body.openaiApiKey;
        else delete state.settings.openai_api_key;
      }
    }

    await saveAppState(workspaceId, state);

    return Response.json({
      ok: true,
      persistedApiKeys: canPersistApiKeys(),
    });
  } catch (error) {
    console.error("Settings POST error:", error);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
