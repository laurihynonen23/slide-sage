"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, Sparkles, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUICK_ACTIONS, DIFFICULTY_OPTIONS, CONTEXT_OPTIONS, STYLE_OPTIONS, CATEGORY_LABELS, UI_LABELS } from "@/lib/types";
import type { DifficultyMode, ContextMode, ExplanationStyle, RegionSelection, AppLanguage } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { motion, AnimatePresence } from "framer-motion";

/** Preprocess AI output to convert LaTeX delimiters to remark-math compatible format */
function preprocessLatex(content: string): string {
  // Convert \[...\] to $$...$$ (display math)
  let result = content.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$${math}$$`);
  // Convert \(...\) to $...$ (inline math)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
  return result;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  slideNumber?: number;
}

interface AIChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  difficulty: DifficultyMode;
  contextMode: ContextMode;
  style: ExplanationStyle | null;
  selectedRegion: RegionSelection | null;
  currentSlideNumber: number;
  hasExams: boolean;
  isExpanded?: boolean;
  language?: AppLanguage;
  onSend: (message: string) => void;
  onClear: () => void;
  onDifficultyChange: (d: DifficultyMode) => void;
  onContextChange: (c: ContextMode) => void;
  onStyleChange: (s: ExplanationStyle | null) => void;
  onToggleExpand?: () => void;
  onLanguageChange?: (lang: AppLanguage) => void;
}

export function AIChatPanel({
  messages,
  isStreaming,
  difficulty,
  contextMode,
  style,
  selectedRegion,
  currentSlideNumber,
  hasExams,
  onSend,
  onClear,
  onDifficultyChange,
  onContextChange,
  onStyleChange,
  isExpanded = false,
  language = "en",
  onToggleExpand,
  onLanguageChange,
}: AIChatPanelProps) {
  const [input, setInput] = useState("");
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback((text?: string) => {
    const msg = text || input.trim();
    if (!msg || isStreaming) return;
    onSend(msg);
    setInput("");
    setShowQuickActions(false);
  }, [input, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const contextOptions = CONTEXT_OPTIONS.filter(opt => {
    if (!hasExams && ["exams_only", "slides_and_exams", "exam_relevance"].includes(opt.value)) return false;
    if (!selectedRegion && opt.value === "selected_region") return false;
    return true;
  });

  const t = UI_LABELS[language];
  const catLabels = CATEGORY_LABELS[language];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 flex-shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t.studyAssistant}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Language toggle */}
          {onLanguageChange && (
            <button
              onClick={() => onLanguageChange(language === "en" ? "fi" : "en")}
              className="px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-semibold text-zinc-400 transition-colors uppercase"
              title={language === "en" ? "Switch to Finnish" : "Vaihda englanniksi"}
            >
              {language === "en" ? "FI" : "EN"}
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
              title={isExpanded ? "Collapse chat" : "Expand chat"}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/40">
        {/* Difficulty */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5 block">{t.difficulty}</label>
          <div className="flex gap-1">
            {DIFFICULTY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onDifficultyChange(opt.value)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                  difficulty === opt.value
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
                title={opt.description}
              >
                {language === "fi" ? opt.labelFi : opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Context */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5 block">{t.context}</label>
          <div className="flex flex-wrap gap-1">
            {contextOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onContextChange(opt.value)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                  contextMode === opt.value
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
                title={opt.description}
              >
                {language === "fi" ? opt.labelFi : opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5 block">{t.style}</label>
          <div className="flex gap-1">
            {STYLE_OPTIONS.map(s => (
              <button
                key={s.value}
                onClick={() => onStyleChange(style === s.value ? null : s.value)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                  style === s.value
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                {language === "fi" ? s.labelFi : s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active context indicator */}
        {selectedRegion && (
          <div className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {t.regionSelected}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className={cn(
        "flex-1 overflow-y-auto py-5 space-y-6 scrollbar-thin",
        isExpanded ? "px-3 md:px-5 lg:px-6" : "px-4"
      )}>
        {messages.length === 0 && showQuickActions && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 text-center mt-4">
              {t.viewingSlide} {currentSlideNumber}. {t.askOrQuickAction}
            </p>
            <div className="space-y-2">
              {(["explain", "exam", "create"] as const).map(category => (
                <div key={category}>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5">
                    {catLabels[category]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ACTIONS.filter(a => a.category === category).map(action => (
                      <button
                        key={action.label}
                        onClick={() => handleSubmit(language === "fi" ? action.promptFi : action.prompt)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        {language === "fi" ? action.labelFi : action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "text-sm",
                msg.role === "user"
                  ? "flex justify-end"
                  : isExpanded
                    ? "flex justify-center"
                    : ""
              )}
            >
              {msg.role === "user" ? (
                <div className={cn(
                  "bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md",
                  isExpanded ? "max-w-[70%]" : "max-w-[85%]"
                )}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.slideNumber && (
                    <p className="text-[10px] text-blue-200 mt-1">Slide {msg.slideNumber}</p>
                  )}
                </div>
              ) : (
                <div className={cn(
                  "chat-markdown prose dark:prose-invert prose-p:leading-[1.75] prose-headings:mt-5 prose-headings:mb-2.5 prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-pre:my-3 [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto",
                  isExpanded
                    ? "chat-markdown-expanded w-full max-w-[40rem] prose-base mx-auto prose-pre:text-sm [&_.katex]:text-base"
                    : "w-full max-w-none prose-sm prose-pre:text-[12px] [&_.katex]:text-[0.95em]"
                )}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {preprocessLatex(msg.content)}
                  </ReactMarkdown>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "" && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{language === "fi" ? "Ajattelee..." : "Thinking..."}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions when chat has messages */}
      {messages.length > 0 && !isStreaming && (
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/40">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {QUICK_ACTIONS.slice(0, 6).map(action => (
              <button
                key={action.label}
                onClick={() => handleSubmit(language === "fi" ? action.promptFi : action.prompt)}
                className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                {language === "fi" ? action.labelFi : action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={language === "fi" ? `Kysy kalvosta ${currentSlideNumber}...` : `Ask about slide ${currentSlideNumber}...`}
            className="flex-1 resize-none rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={isStreaming}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isStreaming}
            className={cn(
              "p-2.5 rounded-xl transition-all",
              input.trim() && !isStreaming
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
            )}
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
