"use client";

import { useReducer, useEffect, useCallback, useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
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
  X,
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
  const [uploadMode, setUploadMode] = useState<"blob" | "server" | "unsupported">("server");
  const [workspace, setWorkspace] = useState<{
    workspaceId: string;
    hasPersonalData: boolean;
  } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchDecks();
    fetchExams();
    fetchRuntimeSettings();
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
      if (Array.isArray(data)) {
        dispatch({ type: "SET_DECKS", decks: data });
      }
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

  const fetchRuntimeSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();

      if (data.uploadMode === "blob" || data.uploadMode === "server" || data.uploadMode === "unsupported") {
        setUploadMode(data.uploadMode);
      }

      if (typeof data.workspaceId === "string") {
        const nextWorkspace = {
          workspaceId: data.workspaceId,
          hasPersonalData: Boolean(data.hasPersonalData),
        };
        setWorkspace(nextWorkspace);
        return nextWorkspace;
      }

      return null;
    } catch (err) {
      console.error("Failed to fetch runtime settings:", err);
      return null;
    }
  };

  const consumeProcessingStream = async (response: Response, type: "deck" | "exam") => {
    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(errText || "Upload failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let completedData: { id: string; type: string } | null = null;
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.message) {
            dispatch({ type: "SET_UPLOADING", isUploading: true, progress: payload.message });
          }
          if (payload.id) {
            completedData = payload;
          }
          if (payload.error) {
            throw new Error(payload.error);
          }
        } catch (e) {
          if ((e as Error).message !== "Unexpected end of JSON input") {
            throw e;
          }
        }
      }
    }

    if (completedData) {
      if (type === "deck") {
        await fetchDecks();
        dispatch({ type: "SET_ACTIVE_DECK", deckId: completedData.id });
      } else {
        await fetchExams();
      }
    }
  };

  const handleCancelUpload = useCallback(() => {
    uploadAbortRef.current?.abort();
    dispatch({ type: "SET_UPLOADING", isUploading: false });
  }, []);

  const handleUpload = useCallback(async (file: File, type: "deck" | "exam") => {
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    dispatch({ type: "SET_UPLOADING", isUploading: true, progress: `Uploading ${file.name}...` });

    try {
      let workspaceId = workspace?.workspaceId;
      if (!workspaceId) {
        const runtimeSettings = await fetchRuntimeSettings();
        workspaceId = runtimeSettings?.workspaceId;
      }

      if (uploadMode === "blob") {
        if (!workspaceId) {
          throw new Error("Workspace is not ready yet. Please try again.");
        }

        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const pathname = `incoming/${workspaceId}/${type}/${crypto.randomUUID()}-${safeName}`;

        const blob = await upload(pathname, file, {
          access: "private",
          handleUploadUrl: "/api/upload",
          multipart: file.size > 8 * 1024 * 1024,
          contentType: file.type || undefined,
          abortSignal: controller.signal,
          onUploadProgress: ({ percentage }) => {
            dispatch({
              type: "SET_UPLOADING",
              isUploading: true,
              progress: `Uploading ${file.name} (${Math.round(percentage)}%)...`,
            });
          },
        });

        dispatch({ type: "SET_UPLOADING", isUploading: true, progress: `Processing ${file.name}...` });
        const processResponse = await fetch("/api/process-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pathname: blob.pathname,
            originalFilename: file.name,
            type,
          }),
          signal: controller.signal,
        });
        await consumeProcessingStream(processResponse, type);
      } else if (uploadMode === "server") {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        await consumeProcessingStream(res, type);
      } else {
        throw new Error("Hosted uploads require Vercel Blob. Configure BLOB_READ_WRITE_TOKEN in Vercel first.");
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        console.error("Upload failed:", err);
      }
    } finally {
      uploadAbortRef.current = null;
      dispatch({ type: "SET_UPLOADING", isUploading: false });
    }
  }, [uploadMode, workspace]);

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
            onGoHome={() => dispatch({ type: "SET_ACTIVE_DECK", deckId: null })}
            onUpload={handleUpload}
            examsCount={state.exams.length}
            onOpenExams={() => dispatch({ type: "SET_EXAM_PANEL_OPEN", open: true })}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-2xl w-full space-y-12">
              <div className="text-center space-y-6">
                <div className="inline-flex items-baseline gap-1">
                  <h1 className="text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Slide</h1>
                  <h1 className="text-5xl font-black tracking-tight text-zinc-400 dark:text-zinc-600">Sage</h1>
                </div>
                <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
                  Study assistant for lecture PDFs. Upload slides, ask questions about specific regions, and get AI help with exam prep.
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Your uploads and settings stay inside your own browser workspace.
                </p>
              </div>
              <UploadDropzone onUpload={handleUpload} />
              {state.isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>{state.uploadProgress}</span>
                    <button
                      onClick={handleCancelUpload}
                      className="p-0.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
                      title="Cancel upload"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <UploadProgressBar progress={state.uploadProgress} />
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
          onGoHome={() => dispatch({ type: "SET_ACTIVE_DECK", deckId: null })}
          onUpload={handleUpload}
          examsCount={state.exams.length}
          onOpenExams={() => dispatch({ type: "SET_EXAM_PANEL_OPEN", open: true })}
          onOpenQuiz={() => dispatch({ type: "SET_QUIZ_MODAL_OPEN", open: true })}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isUploading={state.isUploading}
          uploadProgress={state.uploadProgress}
          onCancelUpload={handleCancelUpload}
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
                  className="w-[94vw] max-w-6xl h-[88vh] bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
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
  onGoHome,
  onUpload,
  examsCount,
  onOpenExams,
  onOpenQuiz,
  onOpenSettings,
  isUploading,
  uploadProgress,
  onCancelUpload,
}: {
  decks: Deck[];
  activeDeck: Deck | null;
  onSelectDeck: (id: string) => void;
  onDeleteDeck: (id: string) => void;
  onGoHome: () => void;
  onUpload: (file: File, type: "deck" | "exam") => Promise<void>;
  examsCount: number;
  onOpenExams: () => void;
  onOpenQuiz?: () => void;
  onOpenSettings?: () => void;
  isUploading?: boolean;
  uploadProgress?: string;
  onCancelUpload?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 flex-shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onGoHome}
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          title="Back to home"
        >
          <span className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">Slide</span>
          <span className="text-sm font-black tracking-tight text-zinc-400 dark:text-zinc-600">Sage</span>
        </button>

        {decks.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="max-w-[200px] truncate">{activeDeck?.title || "Select deck"}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>
            <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[200]">
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
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 max-w-[260px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
            <span className="truncate">{uploadProgress}</span>
            {onCancelUpload && (
              <button
                onClick={onCancelUpload}
                className="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors flex-shrink-0"
                title="Cancel upload"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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

function UploadProgressBar({ progress }: { progress: string }) {
  const ratioMatch = progress.match(/\((\d+)\/(\d+)\)/);
  const percentMatch = progress.match(/\((\d+)%\)/);
  const pct = ratioMatch
    ? Math.round((parseInt(ratioMatch[1]) / parseInt(ratioMatch[2])) * 100)
    : percentMatch
      ? parseInt(percentMatch[1])
      : null;

  // Indeterminate during uploading/converting stages
  if (pct === null) {
    return (
      <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full animate-pulse w-1/3" />
      </div>
    );
  }

  return (
    <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-500 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
