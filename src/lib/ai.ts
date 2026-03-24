import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { DifficultyMode, ContextMode, ExplanationStyle } from "./types";

const getClient = () => new Anthropic();

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
    case "beginner":
      return "Explain like I'm completely new to this topic. Use everyday language, analogies, and avoid jargon. If you must use a technical term, define it immediately.";
    case "simple":
      return "Explain clearly and accessibly. Use simple language but don't oversimplify. Define key terms briefly.";
    case "normal":
      return "Explain at a standard university level. Assume basic familiarity with the subject.";
    case "advanced":
      return "Explain in depth with full technical detail. Include nuances, edge cases, and theoretical foundations.";
    case "exam":
      return "Focus on what's most likely to be tested. Highlight key facts to memorize, common exam question formats, and potential traps. Be direct about what matters most.";
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
}

export async function* streamChat(options: AIChatOptions): AsyncGenerator<string> {
  const client = getClient();

  const systemParts = [
    SYSTEM_PROMPT,
    `\nDifficulty level: ${getDifficultyInstruction(options.difficulty)}`,
    getStyleInstruction(options.style),
    options.deckTitle ? `\nLecture deck: "${options.deckTitle}"` : "",
    options.currentSlideNumber ? `\nCurrently viewing: Slide ${options.currentSlideNumber}` : "",
    `\nContext mode: ${options.contextMode}`,
    options.regionCrop ? "\nThe student has selected a specific region on the slide. Focus your response on that selected area." : "",
  ].filter(Boolean).join("");

  // Build content blocks for the latest user message
  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  // Add slide images
  for (const slide of options.slideImages) {
    if (fs.existsSync(slide.imagePath)) {
      const imageData = fs.readFileSync(slide.imagePath);
      const base64 = imageData.toString("base64");
      contentBlocks.push({
        type: "text",
        text: `--- Slide ${slide.slideNumber} ---`,
      });
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: base64,
        },
      });
    }
  }

  // Add cropped region if selected
  if (options.regionCrop) {
    contentBlocks.push({
      type: "text",
      text: "--- Selected Region (cropped from slide) ---",
    });
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: options.regionCrop.toString("base64"),
      },
    });
  }

  // Add extracted text context
  if (options.extractedTexts && options.extractedTexts.length > 0) {
    const textContext = options.extractedTexts
      .filter(t => t.text.trim())
      .map(t => `[Slide ${t.slideNumber} text]: ${t.text}`)
      .join("\n\n");
    if (textContext) {
      contentBlocks.push({
        type: "text",
        text: `Extracted text from slides:\n${textContext}`,
      });
    }
  }

  // Add exam context images
  if (options.examContext) {
    for (const exam of options.examContext) {
      contentBlocks.push({
        type: "text",
        text: `--- Past Exam: "${exam.examTitle}" ---`,
      });
      for (const pagePath of exam.pageImages.slice(0, 10)) {
        if (fs.existsSync(pagePath)) {
          const imageData = fs.readFileSync(pagePath);
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageData.toString("base64"),
            },
          });
        }
      }
    }
  }

  // Build message history
  const apiMessages: Anthropic.MessageParam[] = [];

  // Add previous messages (without images for token efficiency)
  for (let i = 0; i < options.messages.length - 1; i++) {
    apiMessages.push({
      role: options.messages[i].role,
      content: options.messages[i].content,
    });
  }

  // Add current message with images
  const lastMessage = options.messages[options.messages.length - 1];
  if (lastMessage) {
    contentBlocks.push({
      type: "text",
      text: lastMessage.content,
    });
  }

  apiMessages.push({
    role: "user",
    content: contentBlocks,
  });

  const stream = client.messages.stream({
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemParts,
    messages: apiMessages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export async function generateQuiz(options: {
  slideImages: { slideNumber: number; imagePath: string }[];
  extractedTexts?: { slideNumber: number; text: string }[];
  examContext?: { examTitle: string; pageImages: string[] }[];
  difficulty: DifficultyMode;
  questionCount: number;
  questionTypes: string[];
  scope: string;
  deckTitle?: string;
}): Promise<string> {
  const client = getClient();

  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  for (const slide of options.slideImages) {
    if (fs.existsSync(slide.imagePath)) {
      const imageData = fs.readFileSync(slide.imagePath);
      contentBlocks.push({
        type: "text",
        text: `--- Slide ${slide.slideNumber} ---`,
      });
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageData.toString("base64"),
        },
      });
    }
  }

  if (options.examContext) {
    for (const exam of options.examContext) {
      contentBlocks.push({
        type: "text",
        text: `--- Past Exam: "${exam.examTitle}" ---`,
      });
      for (const pagePath of exam.pageImages.slice(0, 5)) {
        if (fs.existsSync(pagePath)) {
          const imageData = fs.readFileSync(pagePath);
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageData.toString("base64"),
            },
          });
        }
      }
    }
  }

  contentBlocks.push({
    type: "text",
    text: `Generate exactly ${options.questionCount} quiz questions based on the provided slide content.

Difficulty: ${options.difficulty}
Question types to include: ${options.questionTypes.join(", ")}
Scope: ${options.scope}
${options.deckTitle ? `Deck: "${options.deckTitle}"` : ""}

Return your response as a JSON array of question objects. Each object must have:
- "type": one of "multiple_choice", "short_answer", "concept_check", "calculation"
- "question": the question text
- "options": array of 4 options (only for multiple_choice)
- "answer": the correct answer or model answer
- "hint": an optional hint
- "explanation": brief explanation of why this is the answer

Return ONLY the JSON array, no other text.`,
  });

  const response = await client.messages.create({
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: "You are a quiz generator for university exam preparation. Generate high-quality, specific questions grounded in the provided lecture material. Return only valid JSON.",
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  return textBlock ? textBlock.text : "[]";
}

export async function analyzeExamRelevance(options: {
  slideImages: { slideNumber: number; imagePath: string }[];
  examImages: { examTitle: string; pageImages: string[] }[];
  deckTitle: string;
}): Promise<string> {
  const client = getClient();

  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  // Add a sample of slides (limit to avoid token explosion)
  const slidesSample = options.slideImages.slice(0, 30);
  for (const slide of slidesSample) {
    if (fs.existsSync(slide.imagePath)) {
      const imageData = fs.readFileSync(slide.imagePath);
      contentBlocks.push({
        type: "text",
        text: `--- Slide ${slide.slideNumber} ---`,
      });
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageData.toString("base64"),
        },
      });
    }
  }

  for (const exam of options.examImages) {
    contentBlocks.push({
      type: "text",
      text: `--- Past Exam: "${exam.examTitle}" ---`,
    });
    for (const pagePath of exam.pageImages.slice(0, 10)) {
      if (fs.existsSync(pagePath)) {
        const imageData = fs.readFileSync(pagePath);
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: imageData.toString("base64"),
          },
        });
      }
    }
  }

  contentBlocks.push({
    type: "text",
    text: `Analyze the relationship between the lecture slides and past exam papers.

Provide a JSON response with this structure:
{
  "summary": "Brief overview of what topics the exams emphasize",
  "recurring_topics": ["topic1", "topic2", ...],
  "question_styles": ["style1", "style2", ...],
  "high_priority_slides": [
    { "range": "12-18", "reason": "Why these slides are important", "score": 0.9 },
    ...
  ],
  "recommendations": [
    "Specific study recommendation 1",
    "Specific study recommendation 2",
    ...
  ]
}

Be specific — reference actual slide numbers and concrete topics from the material. Return ONLY valid JSON.`,
  });

  const response = await client.messages.create({
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: "You are an exam preparation analyst. Compare lecture slides with past exam papers to identify high-priority study areas. Be specific and grounded in the actual content. Return only valid JSON.",
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  return textBlock ? textBlock.text : "{}";
}
