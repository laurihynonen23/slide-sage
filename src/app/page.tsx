"use client";

import { useReducer, useEffect, useCallback, useState } from "react";
import {
  BookOpen,
  FileText,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Trash2,
  Loader2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appReducer, initialState, AppContext } from "@/lib/store";
import type { ExamAnalysis } from "@/lib/store";
import type { Deck } from "@/lib/types";
import { SlideViewer } from "@/components/SlideViewer";
import { SlideThumbnailRail } from "@/components/SlideThumbnailRail";
import { AIChatPanel } from "@/components/AIChatPanel";
import { UploadDropzone } from "@/components/UploadDropzone";
import { QuizModal } from "@/components/QuizModal";
import { ExamPanel } from "@/components/ExamPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    fetchDecks();
    fetchExams();
  }, []);

  useEffect(() => {
    if (state.activeDeckId) {
      fetchSlides(state.activeDeckId);
    }
  }, [state.activeDeckId]);

  const fetchDecks = async () => {
    try {
      const res = await fetch("/api/decks");
      const data = await res.json();
      dispatch({ type: "SET_DECKS", decks: data });
    } catch (err) {
      console.error("Failed to fetch decks:", err);
    }
  };

  const fetchSlides = async (deckId: string) => {
    try {
      const res = await fetch(`/api/slides/${deckId}`);
      const data = await res.json();
      dispatch({ type: "SET_SLIDES", slides: data });
    } catch (err) {
      console.error("Failed to fetch slides:", err);
    }
  };

  const fetchExams = async () => {
    try {
      const res = await fetch("/api/exams");
      const data = await res.json();
      dispatch({ type: "SET_EXAMS", exams: data });
    } catch (err) {
      console.error("Failed to fetch exams:", err);
    }
  };

  const handleUpload = useCallback(async (file: File, type: "deck" | "exam") => {
    dispatch({ type: "SET_UPLOADING", isUploading: true, progress: `Processing ${file.name}...` });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Upload failed");

      if (type === "deck") {
        await fetchDecks();
        dispatch({ type: "SET_ACTIVE_DECK", deckId: data.id });
      } else {
        await fetchExams();
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      dispatch({ type: "SET_UPLOADING", isUploading: false });
    }
  }, []);

  const handleDeleteDeck = async (deckId: string) => {
    try {
      await fetch(`/api/decks?id=${deckId}`, { method: "DELETE" });
      if (state.activeDeckId === deckId) {
        dispatch({ type: "SET_ACTIVE_DECK", deckId: null });
        dispatch({ type: "SET_SLIDES", slides: [] });
      }
      await fetchDecks();
    } catch (err) {
      console.error("Failed to delete deck:", err);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    try {
      await fetch(`/api/exams?id=${examId}`, { method: "DELETE" });
      await fetchExams();
    } catch (err) {
      console.error("Failed to delete exam:", err);
    }
  };

  const handleSendMessage = useCallback(async (message: string) => {
    const currentSlide = state.slides[state.currentSlideIndex];
    if (!currentSlide || !state.activeDeckId) return;

    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { role: "user", content: message, slideNumber: currentSlide.slide_number },
    });
    dispatch({ type: "ADD_CHAT_MESSAGE", message: { role: "assistant", content: "" } });
    dispatch({ type: "SET_STREAMING", isStreaming: true });

    try {
      const slideNumbers = [currentSlide.slide_number];

      if (state.contextMode === "neighboring_slides") {
        if (state.currentSlideIndex > 0) slideNumbers.unshift(state.slides[state.currentSlideIndex - 1].slide_number);
        if (state.currentSlideIndex < state.slides.length - 1) slideNumbers.push(state.slides[state.currentSlideIndex + 1].slide_number);
      }

      const body: Record<string, unknown> = {
        messages: [...state.chatMessages.filter(m => m.content), { role: "user", content: message }],
        deckId: state.activeDeckId,
        slideNumbers,
        difficulty: state.difficulty,
        contextMode: state.contextMode,
        style: state.style,
        language: state.language,
      };

      if (state.selectedRegion) {
        body.regionData = state.selectedRegion;
      }

      if (state.slideRange && state.contextMode === "slide_range") {
        body.slideRange = state.slideRange;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`Chat request failed (${res.status}): ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        dispatch({ type: "UPDATE_LAST_ASSISTANT_MESSAGE", content: accumulated });
      }
    } catch (err) {
      console.error("Chat failed:", err);
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      dispatch({
        type: "UPDATE_LAST_ASSISTANT_MESSAGE",
        content: `Sorry, I encountered an error: ${errMsg}`,
      });
    } finally {
      dispatch({ type: "SET_STREAMING", isStreaming: false });
    }
  }, [state.slides, state.currentSlideIndex, state.activeDeckId, state.chatMessages, state.difficulty, state.contextMode, state.style, state.selectedRegion, state.slideRange]);

  const handleAnalyzeExams = useCallback(async () => {
    if (!state.activeDeckId) return;
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analyze-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: state.activeDeckId }),
      });

      if (!res.ok) throw new Error("Analysis request failed");

      const data = await res.json();

      // Validate the response has the expected shape
      const insights: ExamAnalysis = {
        summary: data.summary || "Analysis complete.",
        recurring_topics: Array.isArray(data.recurring_topics) ? data.recurring_topics : [],
        question_styles: Array.isArray(data.question_styles) ? data.question_styles : [],
        high_priority_slides: Array.isArray(data.high_priority_slides) ? data.high_priority_slides : [],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      };

      dispatch({ type: "SET_EXAM_INSIGHTS", insights });
    } catch (err) {
      console.error("Exam analysis failed:", err);
      dispatch({
        type: "SET_EXAM_INSIGHTS",
        insights: {
          summary: "Analysis failed. Please check your API key and try again.",
          recurring_topics: [],
          question_styles: [],
          high_priority_slides: [],
          recommendations: [],
        },
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [state.activeDeckId]);

  const currentSlide = state.slides[state.currentSlideIndex] || null;
  const activeDeck = state.decks.find(d => d.id === state.activeDeckId);

  // No deck selected — show welcome
  if (!state.activeDeckId) {
    return (
      <AppContext.Provider value={{ state, dispatch }}>
        <div className="h-screen flex flex-col bg-white dark:bg-zinc-950">
          <TopBar
            decks={state.decks}
            activeDeck={null}
            onSelectDeck={(id) => dispatch({ type: "SET_ACTIVE_DECK", deckId: id })}
            onDeleteDeck={handleDeleteDeck}
            onUpload={handleUpload}
            examsCount={state.exams.length}
            onOpenExams={() => dispatch({ type: "SET_EXAM_PANEL_OPEN", open: true })}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-lg w-full space-y-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">SlideSage</h1>
                <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                  Upload your lecture slides and study smarter with AI-powered explanations, region-based Q&A, and exam preparation.
                </p>
              </div>
              <UploadDropzone onUpload={handleUpload} />
              {state.isUploading && (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {state.uploadProgress}
                </div>
              )}
            </div>
          </div>
          <ExamPanel
            isOpen={state.isExamPanelOpen}
            onClose={() => dispatch({ type: "SET_EXAM_PANEL_OPEN", open: false })}
            exams={state.exams}
            deckId={state.activeDeckId}
            insights={state.examInsights}
            onUpload={handleUpload}
            onDelete={handleDeleteExam}
            onAnalyze={handleAnalyzeExams}
          />
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div className="h-screen flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
        <TopBar
          decks={state.decks}
          activeDeck={activeDeck || null}
          onSelectDeck={(id) => dispatch({ type: "SET_ACTIVE_DECK", deckId: id })}
          onDeleteDeck={handleDeleteDeck}
          onUpload={handleUpload}
          examsCount={state.exams.length}
          onOpenExams={() => dispatch({ type: "SET_EXAM_PANEL_OPEN", open: true })}
          onOpenQuiz={() => dispatch({ type: "SET_QUIZ_MODAL_OPEN", open: true })}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isUploading={state.isUploading}
          uploadProgress={state.uploadProgress}
        />

        <div className="flex-1 flex min-h-0">
          {/* Thumbnail sidebar */}
          <AnimatePresence>
            {state.isSidebarOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 160, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-r border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 overflow-hidden flex-shrink-0"
              >
                <SlideThumbnailRail
                  slides={state.slides}
                  currentIndex={state.currentSlideIndex}
                  onSelect={(index) => dispatch({ type: "SET_CURRENT_SLIDE", index })}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sidebar toggle */}
          <button
            onClick={() => dispatch({ type: "SET_SIDEBAR_OPEN", open: !state.isSidebarOpen })}
            className="flex-shrink-0 w-5 flex items-center justify-center border-r border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-400 transition-colors"
          >
            {state.isSidebarOpen ? (
              <PanelLeftClose className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Slide viewer */}
          <SlideViewer
            slide={currentSlide}
            slideIndex={state.currentSlideIndex}
            totalSlides={state.slides.length}
            onPrevious={() => dispatch({ type: "SET_CURRENT_SLIDE", index: Math.max(0, state.currentSlideIndex - 1) })}
            onNext={() => dispatch({ type: "SET_CURRENT_SLIDE", index: Math.min(state.slides.length - 1, state.currentSlideIndex + 1) })}
            onRegionSelect={(region) => dispatch({ type: "SET_REGION", region })}
            selectedRegion={state.selectedRegion}
          />

          {/* Chat sidebar (normal mode) */}
          {!state.chatExpanded && (
            <div className="w-[380px] flex-shrink-0 border-l border-zinc-200/60 dark:border-zinc-800/60">
              <AIChatPanel
                messages={state.chatMessages}
                isStreaming={state.isStreaming}
                difficulty={state.difficulty}
                contextMode={state.contextMode}
                style={state.style}
                selectedRegion={state.selectedRegion}
                currentSlideNumber={currentSlide?.slide_number || 1}
                hasExams={state.exams.length > 0}
                isExpanded={false}
                language={state.language}
                onSend={handleSendMessage}
                onClear={() => dispatch({ type: "CLEAR_CHAT" })}
                onDifficultyChange={(d) => dispatch({ type: "SET_DIFFICULTY", difficulty: d })}
                onContextChange={(c) => dispatch({ type: "SET_CONTEXT_MODE", contextMode: c })}
                onStyleChange={(s) => dispatch({ type: "SET_STYLE", style: s })}
                onToggleExpand={() => dispatch({ type: "SET_CHAT_EXPANDED", expanded: true })}
                onLanguageChange={(lang) => dispatch({ type: "SET_LANGUAGE", language: lang })}
              />
            </div>
          )}

          {/* Chat expanded overlay */}
          <AnimatePresence>
            {state.chatExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) dispatch({ type: "SET_CHAT_EXPANDED", expanded: false }); }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="w-[90vw] max-w-4xl h-[85vh] bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                >
                  <AIChatPanel
                    messages={state.chatMessages}
                    isStreaming={state.isStreaming}
                    difficulty={state.difficulty}
                    contextMode={state.contextMode}
                    style={state.style}
                    selectedRegion={state.selectedRegion}
                    currentSlideNumber={currentSlide?.slide_number || 1}
                    hasExams={state.exams.length > 0}
                    isExpanded={true}
                    language={state.language}
                    onSend={handleSendMessage}
                    onClear={() => dispatch({ type: "CLEAR_CHAT" })}
                    onDifficultyChange={(d) => dispatch({ type: "SET_DIFFICULTY", difficulty: d })}
                    onContextChange={(c) => dispatch({ type: "SET_CONTEXT_MODE", contextMode: c })}
                    onStyleChange={(s) => dispatch({ type: "SET_STYLE", style: s })}
                    onToggleExpand={() => dispatch({ type: "SET_CHAT_EXPANDED", expanded: false })}
                    onLanguageChange={(lang) => dispatch({ type: "SET_LANGUAGE", language: lang })}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Modals */}
        <QuizModal
          isOpen={state.isQuizModalOpen}
          onClose={() => dispatch({ type: "SET_QUIZ_MODAL_OPEN", open: false })}
          deckId={state.activeDeckId}
          totalSlides={state.slides.length}
          hasExams={state.exams.length > 0}
        />
        <ExamPanel
          isOpen={state.isExamPanelOpen}
          onClose={() => dispatch({ type: "SET_EXAM_PANEL_OPEN", open: false })}
          exams={state.exams}
          deckId={state.activeDeckId}
          insights={state.examInsights}
          onUpload={handleUpload}
          onDelete={handleDeleteExam}
          onAnalyze={handleAnalyzeExams}
          isAnalyzing={isAnalyzing}
        />
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </div>
    </AppContext.Provider>
  );
}

function TopBar({
  decks,
  activeDeck,
  onSelectDeck,
  onDeleteDeck,
  onUpload,
  examsCount,
  onOpenExams,
  onOpenQuiz,
  onOpenSettings,
  isUploading,
  uploadProgress,
}: {
  decks: Deck[];
  activeDeck: Deck | null;
  onSelectDeck: (id: string) => void;
  onDeleteDeck: (id: string) => void;
  onUpload: (file: File, type: "deck" | "exam") => Promise<void>;
  examsCount: number;
  onOpenExams: () => void;
  onOpenQuiz?: () => void;
  onOpenSettings?: () => void;
  isUploading?: boolean;
  uploadProgress?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-sm flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">SlideSage</span>
        </div>

        {decks.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="max-w-[200px] truncate">{activeDeck?.title || "Select deck"}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>
            <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="p-1.5 max-h-64 overflow-y-auto">
                {decks.map(deck => (
                  <div
                    key={deck.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group/item transition-colors",
                      deck.id === activeDeck?.id
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    )}
                    onClick={() => onSelectDeck(deck.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{deck.title}</p>
                      <p className="text-[10px] text-zinc-400">{deck.page_count} slides</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteDeck(deck.id); }}
                      className="p-1 rounded opacity-0 group-hover/item:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isUploading && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{uploadProgress}</span>
          </div>
        )}

        <UploadDropzone onUpload={onUpload} compact />

        <button
          onClick={onOpenExams}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors",
            examsCount > 0
              ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          )}
        >
          <FileText className="w-4 h-4" />
          <span>Exams{examsCount > 0 ? ` (${examsCount})` : ""}</span>
        </button>

        {activeDeck && onOpenQuiz && (
          <button
            onClick={onOpenQuiz}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Quiz</span>
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="AI Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
