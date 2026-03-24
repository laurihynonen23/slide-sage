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
- An Anthropic API key
- `pdftoppm` (recommended, from poppler) for high-quality PDF rendering, or `sips` (macOS built-in) as fallback

### Install pdftoppm (recommended)

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install poppler-utils
```

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Add your Anthropic API key to .env.local
# ANTHROPIC_API_KEY=sk-ant-...

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `AI_MODEL` | No | Model to use (default: `claude-sonnet-4-20250514`) |

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── upload/          # File upload (PDF, PNG, JPG)
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
    ├── ai.ts                # Anthropic API integration
    ├── db.ts                # SQLite database
    ├── pdf-processor.ts     # PDF splitting and image conversion
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
- **SQLite** (better-sqlite3) for data storage
- **Sharp** for image processing
- **Anthropic Claude** for multimodal AI (understands both text and images)
- **Lucide React** for icons

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` / `↑` | Previous slide |
| `→` / `↓` | Next slide |
| `Escape` | Clear region selection |

## How It Works

1. **Upload** a PDF — pages are split into individual slide images and thumbnails
2. **Browse** slides using the thumbnail rail or keyboard shortcuts
3. **Ask** the AI about the current slide — it receives the actual slide image for visual understanding
4. **Select a region** by clicking the Select button and dragging over part of the slide
5. **Adjust difficulty** and context to control how the AI responds
6. **Upload exams** to get AI-powered study priority analysis
7. **Generate quizzes** from any slide range with customizable difficulty and question types

## License

MIT
