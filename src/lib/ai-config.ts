/**
 * AI provider config — safe to import from both client and server
 */

export type AIProvider = "anthropic" | "openai";

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

export const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export const OPENAI_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { id: "gpt-5.3", label: "GPT-5.3" },
  { id: "gpt-5.2", label: "GPT-5.2" },
  { id: "gpt-4o", label: "GPT-4o (legacy)" },
];
