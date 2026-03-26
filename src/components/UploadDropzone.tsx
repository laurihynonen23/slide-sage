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
        "relative flex flex-col items-center justify-center gap-3 p-16 rounded-xl border-2 border-dashed transition-colors cursor-pointer",
        isDragging
          ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600",
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <Upload className="w-8 h-8 text-zinc-400" />
      <div className="text-center">
        <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
          {isDragging ? "Drop PDF here" : "Drop PDF or click to browse"}
        </p>
        <p className="text-sm text-zinc-500 mt-1">Accepts PDF, PNG, JPG</p>
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
