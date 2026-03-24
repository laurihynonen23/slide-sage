"use client";

import { useState } from "react";
import { X, FileText, Loader2, Trash2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadDropzone } from "./UploadDropzone";
import type { ExamDocument } from "@/lib/types";
import type { ExamAnalysis } from "@/lib/store";
import { motion } from "framer-motion";

interface ExamPanelProps {
  isOpen: boolean;
  onClose: () => void;
  exams: ExamDocument[];
  deckId: string | null;
  insights: ExamAnalysis | null;
  onUpload: (file: File, type: "deck" | "exam") => Promise<void>;
  onDelete: (examId: string) => void;
  onAnalyze: () => void;
  isAnalyzing?: boolean;
}

export function ExamPanel({
  isOpen,
  onClose,
  exams,
  deckId,
  insights,
  onUpload,
  onDelete,
  onAnalyze,
  isAnalyzing = false,
}: ExamPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Past Exams</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Upload */}
          <UploadDropzone onUpload={onUpload} type="exam" />

          {/* Exam list */}
          {exams.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Uploaded Exams</h3>
              <div className="space-y-2">
                {exams.map(exam => (
                  <div
                    key={exam.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{exam.title}</p>
                        <p className="text-xs text-zinc-400">{exam.page_count} pages</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onDelete(exam.id)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyze button */}
          {exams.length > 0 && deckId && (
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                isAnalyzing
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                  : "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" />
                  Analyze Exam Relevance
                </>
              )}
            </button>
          )}

          {/* Insights */}
          {insights && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Analysis Results</h3>

              {/* Summary */}
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30">
                <p className="text-sm text-blue-800 dark:text-blue-300">{insights.summary}</p>
              </div>

              {/* Recurring topics */}
              {insights.recurring_topics?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Recurring Topics</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.recurring_topics.map((topic, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* High priority slides */}
              {insights.high_priority_slides?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">High Priority Slides</h4>
                  <div className="space-y-2">
                    {insights.high_priority_slides.map((item, i) => (
                      <div key={i} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                            Slides {item.range}
                          </span>
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-16 rounded-full bg-amber-200 dark:bg-amber-800 overflow-hidden">
                              <div className="h-full rounded-full bg-amber-500" style={{ width: `${item.score * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">{Math.round(item.score * 100)}%</span>
                          </div>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-400">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {insights.recommendations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Recommendations</h4>
                  <ul className="space-y-1.5">
                    {insights.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="text-blue-500 mt-0.5">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {exams.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400">Upload past exam papers to get AI-powered study priority analysis.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
