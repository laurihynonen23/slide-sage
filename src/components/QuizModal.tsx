"use client";

import { useState } from "react";
import { X, Loader2, Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DifficultyMode, QuizQuestion } from "@/lib/types";
import { DIFFICULTY_OPTIONS } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: string;
  totalSlides: number;
  hasExams: boolean;
}

export function QuizModal({ isOpen, onClose, deckId, totalSlides, hasExams }: QuizModalProps) {
  const [difficulty, setDifficulty] = useState<DifficultyMode>("normal");
  const [questionCount, setQuestionCount] = useState(5);
  const [fromSlide, setFromSlide] = useState(1);
  const [toSlide, setToSlide] = useState(totalSlides);
  const [useExams, setUseExams] = useState(false);
  const [types, setTypes] = useState<string[]>(["multiple_choice", "short_answer", "concept_check"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());
  const [selectedAnswers, setSelectedAnswers] = useState<Map<number, string>>(new Map());

  const toggleType = (type: string) => {
    setTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const generate = async () => {
    setIsGenerating(true);
    setQuiz(null);
    setRevealedAnswers(new Set());
    setSelectedAnswers(new Map());

    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId,
          slideRange: { from: fromSlide, to: toSlide },
          difficulty,
          questionCount,
          questionTypes: types,
          useExams,
        }),
      });
      const data = await res.json();
      setQuiz(data.questions || []);
    } catch (err) {
      console.error("Quiz generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleReveal = (index: number) => {
    setRevealedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Generate Quiz</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!quiz ? (
            <>
              {/* Slide range */}
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2 block">Slide Range</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={totalSlides}
                    value={fromSlide}
                    onChange={e => setFromSlide(Number(e.target.value))}
                    className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"
                  />
                  <span className="text-zinc-400 text-sm">to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalSlides}
                    value={toSlide}
                    onChange={e => setToSlide(Number(e.target.value))}
                    className="w-20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"
                  />
                  <span className="text-xs text-zinc-400">of {totalSlides}</span>
                </div>
              </div>

              {/* Question count */}
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2 block">Number of Questions</label>
                <div className="flex gap-2">
                  {[3, 5, 10, 15].map(n => (
                    <button
                      key={n}
                      onClick={() => setQuestionCount(n)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        questionCount === n
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2 block">Difficulty</label>
                <div className="flex gap-2">
                  {DIFFICULTY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDifficulty(opt.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        difficulty === opt.value
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question types */}
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2 block">Question Types</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "multiple_choice", label: "Multiple Choice" },
                    { value: "short_answer", label: "Short Answer" },
                    { value: "concept_check", label: "Concept Check" },
                    { value: "calculation", label: "Calculation" },
                  ].map(t => (
                    <button
                      key={t.value}
                      onClick={() => toggleType(t.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        types.includes(t.value)
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Use exams toggle */}
              {hasExams && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    useExams ? "bg-blue-500" : "bg-zinc-200 dark:bg-zinc-700"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                      useExams ? "translate-x-4" : "translate-x-0.5"
                    )} />
                  </div>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Use past exams as guidance</span>
                </label>
              )}
            </>
          ) : (
            /* Quiz results */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{quiz.length} Questions Generated</h3>
                <button
                  onClick={() => { setQuiz(null); setRevealedAnswers(new Set()); setSelectedAnswers(new Map()); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Generate New
                </button>
              </div>
              {quiz.map((q, i) => (
                <div key={i} className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 mb-1.5">
                        {q.type.replace("_", " ")}
                      </span>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">{q.question}</p>
                    </div>
                  </div>

                  {/* Multiple choice options */}
                  {q.type === "multiple_choice" && q.options && (
                    <div className="ml-9 space-y-1.5">
                      {q.options.map((opt, j) => (
                        <button
                          key={j}
                          onClick={() => {
                            const newMap = new Map(selectedAnswers);
                            newMap.set(i, opt);
                            setSelectedAnswers(newMap);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                            selectedAnswers.get(i) === opt
                              ? revealedAnswers.has(i)
                                ? opt === q.answer
                                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700"
                                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700"
                                : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700"
                              : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Reveal answer */}
                  <div className="ml-9">
                    <button
                      onClick={() => toggleReveal(i)}
                      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
                    >
                      {revealedAnswers.has(i) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {revealedAnswers.has(i) ? "Hide" : "Show"} answer
                    </button>
                    <AnimatePresence>
                      {revealedAnswers.has(i) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/50">
                            <p className="text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
                              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <span>{q.answer}</span>
                            </p>
                            {q.explanation && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 ml-5.5">{q.explanation}</p>
                            )}
                            {q.hint && (
                              <p className="text-xs text-zinc-500 mt-1 ml-5.5 italic">Hint: {q.hint}</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!quiz && (
          <div className="px-6 py-4 border-t border-zinc-200/60 dark:border-zinc-800/60">
            <button
              onClick={generate}
              disabled={isGenerating || types.length === 0}
              className={cn(
                "w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
                isGenerating || types.length === 0
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              )}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </span>
              ) : (
                `Generate ${questionCount} Questions`
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
