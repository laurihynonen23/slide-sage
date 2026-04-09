# SlideSage

AI-powered study assistant for lecture slides and exam preparation. Upload your lecture PDFs, navigate slides visually, and get intelligent explanations, region-based Q&A, and exam-focused study guidance.

## Features

- **PDF slide viewer** — Upload lecture PDFs, browse slides with thumbnail navigation, keyboard shortcuts, and zoom
- **AI-powered explanations** — Ask about any slide with multimodal understanding (text + images, diagrams, formulas)
- **Region selection** — Click and drag to select a specific area on a slide, then ask the AI about just that region
- **Difficulty controls** — Switch between Beginner, Simple, Normal, Advanced, and Exam mode
- **Style controls** — Concise, Step-by-step, Intuitive, Rigorous, or Example-driven explanations
- **Context modes** — Control what the AI sees: current slide, selected region, neighboring slides, slide range, entire deck, exams, or combined
- **Quick actions** — One-click prompts for common study tasks (explain simply, key terms, explain formula, exam relevance, etc.)
- **Past exam upload** — Upload old exam papers (PDF/PNG) for AI-powered exam relevance analysis
- **Exam insights** — Identify recurring topics, high-priority slides, and study recommendations based on past exams
- **Quiz generation** — Generate multiple choice, short answer, concept check, and calculation questions from slides
- **Streaming responses** — AI responses stream in real-time for fast feedback

## Quick Start

### Prerequisites

- Node.js 18+
- An Anthropic or OpenAI API key

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Add your API key to .env.local
# ANTHROPIC_API_KEY=sk-ant-...
# or OPENAI_API_KEY=sk-...

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `AI_MODEL` | No | Model to use (default: `claude-sonnet-4-20250514` for Anthropic) |
| `BLOB_READ_WRITE_TOKEN` | Hosted persistence | Required on Vercel if you want uploaded slides/exams to persist across requests |

At least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` must be set.

### Hosted Deployments

For Vercel deployments:

1. Set your API key in Vercel project environment variables.
2. Create a Vercel Blob store and set `BLOB_READ_WRITE_TOKEN`.
3. The app will upload files directly to Blob, process them server-side, and keep decks/exams in durable storage.

The hosted app no longer stores API keys through the public settings UI. Provider/model preferences can still persist, but API keys should come from environment variables.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── upload/          # Upload mode + Vercel Blob token exchange
│   │   ├── process-upload/  # Process uploaded Blob files into slides/pages
│   │   ├── decks/           # Deck CRUD
│   │   ├── slides/          # Slide data and image serving
│   │   ├── chat/            # Streaming AI chat
│   │   ├── exams/           # Exam document management
│   │   ├── quiz/            # Quiz generation
│   │   └── analyze-exams/   # Exam relevance analysis
│   ├── layout.tsx
│   ├── page.tsx             # Main app with all panels
│   └── globals.css
├── components/
│   ├── AIChatPanel.tsx      # Chat panel with controls
│   ├── ExamPanel.tsx        # Exam upload and insights
│   ├── QuizModal.tsx        # Quiz generation and display
│   ├── SlideViewer.tsx      # Main slide display with region selection
│   ├── SlideThumbnailRail.tsx  # Thumbnail sidebar
│   └── UploadDropzone.tsx   # File upload component
└── lib/
    ├── ai.ts                # Legacy AI integration
    ├── persistence.ts       # Local/Blob-backed durable app state + asset storage
    ├── pdf-processor.ts     # PDF/image processing and page rendering
    ├── provider-settings.ts # Provider/model/env resolution
    ├── store.ts             # Client state management
    ├── types.ts             # TypeScript types and constants
    └── utils.ts             # Utility functions
```

### Data Model

- **Decks** — Uploaded lecture slide collections
- **Slides** — Individual pages with image paths, thumbnails, and extracted text
- **Exam Documents** — Uploaded past exam papers
- **Exam Pages** — Individual exam pages with images
- **Chat Messages** — Conversation history per session
- **Quizzes** — Generated quiz questions with answers
- **Slide Relevance** — AI-generated priority scores linking slides to exams

### Tech Stack

- **Next.js 16** with App Router and TypeScript
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Local JSON state or Vercel Blob** for persistence
- **Sharp** for image processing
- **PDF.js + @napi-rs/canvas** for portable PDF rendering
- **Anthropic Claude** for multimodal AI (understands both text and images)
- **OpenAI** as an alternative provider
- **Lucide React** for icons

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` / `↑` | Previous slide |
| `→` / `↓` | Next slide |
| `Escape` | Clear region selection |

## How It Works

1. **Upload** a PDF or image
2. **Process** it into per-page slide images and thumbnails
3. **Browse** slides using the thumbnail rail or keyboard shortcuts
4. **Ask** the AI about the current slide — it receives the actual slide image for visual understanding
5. **Select a region** by clicking the Select button and dragging over part of the slide
6. **Adjust difficulty** and context to control how the AI responds
7. **Upload exams** to get AI-powered study priority analysis
8. **Generate quizzes** from any slide range with customizable difficulty and question types

## License

MIT
