/**
 * AI provider abstraction — supports Anthropic Claude and OpenAI (GPT-4o etc.)
 * SERVER-ONLY: reads assets from durable storage
 */

import type { DifficultyMode, ContextMode, ExplanationStyle } from "./types";
export type { AIProvider, ProviderConfig } from "./ai-config";
export { ANTHROPIC_MODELS, OPENAI_MODELS } from "./ai-config";
import type { AIProvider, ProviderConfig } from "./ai-config";
import type { MessageParam as AnthropicMessageParam } from "@anthropic-ai/sdk/resources";
import { readAssetBuffer } from "./persistence";

const SYSTEM_PROMPT = `You are a focused, expert study tutor helping a student prepare for exams by analyzing their lecture slides and past exam papers.

Your core responsibilities:
- Explain slide content clearly at the requested difficulty level
- Identify the most important concepts, formulas, and visual elements
- Help the student understand diagrams, charts, tables, and mathematical notation
- Connect material to likely exam topics when exam context is provided
- Generate practice questions and exercises
- Stay grounded in the uploaded material — never hallucinate content not present in the slides or exams

Behavioral guidelines:
- Always reference specific slide numbers when discussing content
- When a region is selected, focus your explanation on that specific area
- Acknowledge when slide content is ambiguous or hard to read
- Prefer clarity over verbosity
- When explaining formulas, break down each component
- When explaining diagrams, describe the relationships and flow
- If asked about content not in the provided slides, say so honestly
- Never give vague generic study advice — be specific to the material`;

function getDifficultyInstruction(difficulty: DifficultyMode): string {
  switch (difficulty) {
    case "beginner": return "Explain like I'm completely new to this topic. Use everyday language, analogies, and avoid jargon. Define any technical terms immediately.";
    case "simple": return "Explain clearly and accessibly. Use simple language but don't oversimplify. Define key terms briefly.";
    case "normal": return "Explain at a standard university level. Assume basic familiarity with the subject.";
    case "advanced": return "Explain in depth with full technical detail. Include nuances, edge cases, and theoretical foundations.";
    case "exam": return "Focus on what's most likely to be tested. Highlight key facts to memorize, common exam question formats, and potential traps.";
  }
}

function getStyleInstruction(style?: ExplanationStyle): string {
  if (!style) return "";
  switch (style) {
    case "concise": return "\nBe concise. Use short sentences and bullet points.";
    case "step_by_step": return "\nExplain step by step, numbering each step clearly.";
    case "intuitive": return "\nFocus on building intuition. Use analogies and mental models.";
    case "rigorous": return "\nBe rigorous and precise. Include formal definitions and proofs where relevant.";
    case "example_driven": return "\nLead with concrete examples to illustrate each concept.";
  }
}

export interface AIChatOptions {
  messages: { role: "user" | "assistant"; content: string }[];
  slideImages: { slideNumber: number; imagePath: string }[];
  regionCrop?: Buffer;
  extractedTexts?: { slideNumber: number; text: string }[];
  difficulty: DifficultyMode;
  style?: ExplanationStyle;
  contextMode: ContextMode;
  currentSlideNumber?: number;
  deckTitle?: string;
  examContext?: { examTitle: string; pageImages: string[] }[];
  providerConfig?: ProviderConfig;
  language?: "en" | "fi";
}

async function readAssetBase64(assetPath: string): Promise<string | null> {
  try {
    return (await readAssetBuffer(assetPath)).toString("base64");
  } catch {
    return null;
  }
}

export async function* streamChatWithProvider(options: AIChatOptions): AsyncGenerator<string> {
  const config = options.providerConfig;

  // Determine which provider and key to use
  const provider: AIProvider = config?.provider ?? "anthropic";
  const apiKey = config?.apiKey || (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || "";
  const model = config?.model || (provider === "anthropic" ? (process.env.AI_MODEL || "claude-sonnet-4-20250514") : "gpt-4o");

  const languageInstruction = options.language === "fi"
    ? "\n\nIMPORTANT: Respond entirely in Finnish (suomeksi). Use Finnish for all explanations, terms, and descriptions. Technical terms and formula variable names can remain in their original form."
    : "";

  const systemContent = [
    SYSTEM_PROMPT,
    `\nDifficulty level: ${getDifficultyInstruction(options.difficulty)}`,
    getStyleInstruction(options.style),
    options.deckTitle ? `\nLecture deck: "${options.deckTitle}"` : "",
    options.currentSlideNumber ? `\nCurrently viewing: Slide ${options.currentSlideNumber}` : "",
    `\nContext mode: ${options.contextMode}`,
    options.regionCrop ? "\nThe student has selected a specific region on the slide. Focus your response on that selected area." : "",
    languageInstruction,
  ].filter(Boolean).join("");

  if (provider === "anthropic") {
    yield* streamAnthropic(options, apiKey, model, systemContent);
  } else {
    yield* streamOpenAI(options, apiKey, model, systemContent);
  }
}

async function* streamAnthropic(
  options: AIChatOptions,
  apiKey: string,
  model: string,
  systemContent: string
): AsyncGenerator<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const contentBlocks: AnthropicMessageParam["content"] = [];

  for (const slide of options.slideImages) {
    const base64 = await readAssetBase64(slide.imagePath);
    if (base64) {
      (contentBlocks as unknown[]).push({ type: "text", text: `--- Slide ${slide.slideNumber} ---` });
      (contentBlocks as unknown[]).push({ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } });
    }
  }

  if (options.regionCrop) {
    (contentBlocks as unknown[]).push({ type: "text", text: "--- Selected Region ---" });
    (contentBlocks as unknown[]).push({ type: "image", source: { type: "base64", media_type: "image/png", data: options.regionCrop.toString("base64") } });
  }

  if (options.extractedTexts?.length) {
    const text = options.extractedTexts.filter(t => t.text.trim()).map(t => `[Slide ${t.slideNumber}]: ${t.text}`).join("\n\n");
    if (text) (contentBlocks as unknown[]).push({ type: "text", text: `Extracted text:\n${text}` });
  }

  if (options.examContext) {
    for (const exam of options.examContext) {
      (contentBlocks as unknown[]).push({ type: "text", text: `--- Past Exam: "${exam.examTitle}" ---` });
      for (const p of exam.pageImages.slice(0, 10)) {
        const base64 = await readAssetBase64(p);
        if (base64) (contentBlocks as unknown[]).push({ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } });
      }
    }
  }

  const apiMessages: AnthropicMessageParam[] = [];
  for (let i = 0; i < options.messages.length - 1; i++) {
    apiMessages.push({ role: options.messages[i].role, content: options.messages[i].content });
  }
  const last = options.messages[options.messages.length - 1];
  if (last) (contentBlocks as unknown[]).push({ type: "text", text: last.content });
  apiMessages.push({ role: "user", content: contentBlocks as AnthropicMessageParam["content"] });

  const stream = client.messages.stream({ model, max_tokens: 4096, system: systemContent, messages: apiMessages });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAI(
  options: AIChatOptions,
  apiKey: string,
  model: string,
  systemContent: string
): AsyncGenerator<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  // Build messages array for OpenAI
  const apiMessages: import("openai").OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
  ];

  // Add history (without images for token efficiency)
  for (let i = 0; i < options.messages.length - 1; i++) {
    apiMessages.push({ role: options.messages[i].role, content: options.messages[i].content });
  }

  // Build multimodal content for the current message
  const userContent: import("openai").OpenAI.ChatCompletionContentPart[] = [];

  for (const slide of options.slideImages) {
    const base64 = await readAssetBase64(slide.imagePath);
    if (base64) {
      userContent.push({ type: "text", text: `--- Slide ${slide.slideNumber} ---` });
      userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "high" } });
    }
  }

  if (options.regionCrop) {
    userContent.push({ type: "text", text: "--- Selected Region ---" });
    userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${options.regionCrop.toString("base64")}`, detail: "high" } });
  }

  if (options.extractedTexts?.length) {
    const text = options.extractedTexts.filter(t => t.text.trim()).map(t => `[Slide ${t.slideNumber}]: ${t.text}`).join("\n\n");
    if (text) userContent.push({ type: "text", text: `Extracted text:\n${text}` });
  }

  if (options.examContext) {
    for (const exam of options.examContext) {
      userContent.push({ type: "text", text: `--- Past Exam: "${exam.examTitle}" ---` });
      for (const p of exam.pageImages.slice(0, 10)) {
        const base64 = await readAssetBase64(p);
        if (base64) userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } });
      }
    }
  }

  const last = options.messages[options.messages.length - 1];
  if (last) userContent.push({ type: "text", text: last.content });

  apiMessages.push({ role: "user", content: userContent });

  {
    const stream = await client.chat.completions.create({ model, messages: apiMessages, max_completion_tokens: 4096, stream: true });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

export async function generateQuizWithProvider(options: {
  slideImages: { slideNumber: number; imagePath: string }[];
  extractedTexts?: { slideNumber: number; text: string }[];
  examContext?: { examTitle: string; pageImages: string[] }[];
  difficulty: DifficultyMode;
  questionCount: number;
  questionTypes: string[];
  scope: string;
  deckTitle?: string;
  providerConfig?: ProviderConfig;
}): Promise<string> {
  const config = options.providerConfig;
  const provider: AIProvider = config?.provider ?? "anthropic";
  const apiKey = config?.apiKey || (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || "";
  const model = config?.model || (provider === "anthropic" ? (process.env.AI_MODEL || "claude-sonnet-4-20250514") : "gpt-4o");

  const prompt = `Generate exactly ${options.questionCount} quiz questions based on the provided slide content.\n\nDifficulty: ${options.difficulty}\nQuestion types: ${options.questionTypes.join(", ")}\nScope: ${options.scope}\n${options.deckTitle ? `Deck: "${options.deckTitle}"` : ""}\n\nReturn ONLY a JSON array where each object has: "type", "question", "options" (array of 4 for MC only), "answer", "hint" (optional), "explanation" (optional).`;

  if (provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const blocks: unknown[] = [];
    for (const slide of options.slideImages) {
      const base64 = await readAssetBase64(slide.imagePath);
      if (base64) {
        blocks.push({ type: "text", text: `--- Slide ${slide.slideNumber} ---` });
        blocks.push({ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } });
      }
    }
    blocks.push({ type: "text", text: prompt });
    const resp = await client.messages.create({ model, max_tokens: 4096, system: "You are a quiz generator. Return only valid JSON.", messages: [{ role: "user", content: blocks as AnthropicMessageParam["content"] }] });
    return (resp.content.find(b => b.type === "text") as { type: "text"; text: string } | undefined)?.text ?? "[]";
  } else {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const userContent: import("openai").OpenAI.ChatCompletionContentPart[] = [];
    for (const slide of options.slideImages) {
      const base64 = await readAssetBase64(slide.imagePath);
      if (base64) {
        userContent.push({ type: "text", text: `--- Slide ${slide.slideNumber} ---` });
        userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "high" } });
      }
    }
    userContent.push({ type: "text", text: prompt });
    const resp = await client.chat.completions.create({ model, messages: [{ role: "system", content: "You are a quiz generator. Return only valid JSON." }, { role: "user", content: userContent }], max_completion_tokens: 4096 });
    return resp.choices[0]?.message?.content ?? "[]";
  }
}

export async function analyzeExamRelevanceWithProvider(options: {
  slideImages: { slideNumber: number; imagePath: string }[];
  examImages: { examTitle: string; pageImages: string[] }[];
  deckTitle: string;
  providerConfig?: ProviderConfig;
}): Promise<string> {
  const config = options.providerConfig;
  const provider: AIProvider = config?.provider ?? "anthropic";
  const apiKey = config?.apiKey || (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || "";
  const model = config?.model || (provider === "anthropic" ? (process.env.AI_MODEL || "claude-sonnet-4-20250514") : "gpt-4o");

  const analysisPrompt = `Analyze the relationship between the lecture slides and past exam papers.\n\nProvide a JSON response with: { "summary": string, "recurring_topics": string[], "question_styles": string[], "high_priority_slides": [{ "range": string, "reason": string, "score": number }], "recommendations": string[] }\n\nReturn ONLY valid JSON.`;

  const slidesSample = options.slideImages.slice(0, 30);

  if (provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const blocks: unknown[] = [];
    for (const slide of slidesSample) {
      const base64 = await readAssetBase64(slide.imagePath);
      if (base64) {
        blocks.push({ type: "text", text: `--- Slide ${slide.slideNumber} ---` });
        blocks.push({ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } });
      }
    }
    for (const exam of options.examImages) {
      blocks.push({ type: "text", text: `--- Past Exam: "${exam.examTitle}" ---` });
      for (const p of exam.pageImages.slice(0, 10)) {
        const base64 = await readAssetBase64(p);
        if (base64) blocks.push({ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } });
      }
    }
    blocks.push({ type: "text", text: analysisPrompt });
    const resp = await client.messages.create({ model, max_tokens: 4096, system: "You are an exam preparation analyst. Return only valid JSON.", messages: [{ role: "user", content: blocks as AnthropicMessageParam["content"] }] });
    return (resp.content.find(b => b.type === "text") as { type: "text"; text: string } | undefined)?.text ?? "{}";
  } else {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const userContent: import("openai").OpenAI.ChatCompletionContentPart[] = [];
    for (const slide of slidesSample) {
      const base64 = await readAssetBase64(slide.imagePath);
      if (base64) {
        userContent.push({ type: "text", text: `--- Slide ${slide.slideNumber} ---` });
        userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}`, detail: "high" } });
      }
    }
    for (const exam of options.examImages) {
      userContent.push({ type: "text", text: `--- Past Exam: "${exam.examTitle}" ---` });
      for (const p of exam.pageImages.slice(0, 5)) {
        const base64 = await readAssetBase64(p);
        if (base64) userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } });
      }
    }
    userContent.push({ type: "text", text: analysisPrompt });
    const resp = await client.chat.completions.create({ model, messages: [{ role: "system", content: "You are an exam prep analyst. Return only valid JSON." }, { role: "user", content: userContent }], max_completion_tokens: 4096 });
    return resp.choices[0]?.message?.content ?? "{}";
  }
}
