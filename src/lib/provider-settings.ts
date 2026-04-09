import type { AIProvider, ProviderConfig } from "./ai-config";

export function getDefaultProvider(settings: Record<string, string>): AIProvider {
  if (settings.provider === "anthropic" || settings.provider === "openai") {
    return settings.provider;
  }

  const hasAnthropicKey = Boolean(settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY);
  const hasOpenAIKey = Boolean(settings.openai_api_key || process.env.OPENAI_API_KEY);

  if (hasOpenAIKey && !hasAnthropicKey) {
    return "openai";
  }

  return "anthropic";
}

export function getProviderConfigFromSettings(settings: Record<string, string>): ProviderConfig {
  const provider = getDefaultProvider(settings);
  const apiKey =
    provider === "anthropic"
      ? (settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "")
      : (settings.openai_api_key || process.env.OPENAI_API_KEY || "");
  const model =
    settings.model ||
    process.env.AI_MODEL ||
    (provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o");

  return { provider, apiKey, model };
}
