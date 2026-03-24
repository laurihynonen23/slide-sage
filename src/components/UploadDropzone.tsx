"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, Image } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  onUpload: (file: File, type: "deck" | "exam") => Promise<void>;
  type?: "deck" | "exam";
  compact?: boolean;
  className?: string;
}

export function UploadDropzone({ onUpload, type = "deck", compact = false, className }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) await onUpload(file, type);
    },
    [onUpload, type]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await onUpload(file, type);
      e.target.value = "";
    },
    [onUpload, type]
  );

  if (compact) {
    return (
      <label
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
          "text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100",
          "dark:hover:text-zinc-200 dark:hover:bg-zinc-800",
          className
        )}
      >
        <Upload className="w-4 h-4" />
        <span>Upload {type === "exam" ? "Exam" : "Slides"}</span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
        />
      </label>
    );
  }

  return (
    <label
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 p-12 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer",
        isDragging
          ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
          : "border-zinc-200 hover:border-zinc-300 bg-zinc-50/50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:bg-zinc-900/50",
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
        isDragging ? "bg-blue-100 dark:bg-blue-900/30" : "bg-zinc-100 dark:bg-zinc-800"
      )}>
        {type === "exam" ? (
          <FileText className={cn("w-6 h-6", isDragging ? "text-blue-500" : "text-zinc-400")} />
        ) : (
          <Image className={cn("w-6 h-6", isDragging ? "text-blue-500" : "text-zinc-400")} />
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {isDragging ? "Drop to upload" : `Upload ${type === "exam" ? "exam paper" : "lecture slides"}`}
        </p>
        <p className="text-xs text-zinc-400 mt-1">PDF, PNG, or JPG</p>
      </div>
      <input
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleFileSelect}
      />
    </label>
  );
}
