"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Slide } from "@/lib/types";

interface SlideThumbnailRailProps {
  slides: Slide[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function SlideThumbnailRail({ slides, currentIndex, onSelect }: SlideThumbnailRailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentIndex]);

  if (slides.length === 0) return null;

  return (
    <div ref={containerRef} className="flex flex-col gap-2 overflow-y-auto h-full p-3 scrollbar-thin">
      {slides.map((slide, index) => (
        <button
          key={slide.id}
          ref={index === currentIndex ? activeRef : null}
          onClick={() => onSelect(index)}
          className={cn(
            "relative group flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200",
            "border-2 hover:shadow-md",
            index === currentIndex
              ? "border-blue-500 shadow-sm shadow-blue-500/20"
              : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
          )}
        >
          <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
            {slide.thumbnail_path && (
              <img
                src={`/api/slides/thumbnail/${slide.id}`}
                alt={`Slide ${slide.slide_number}`}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            )}
          </div>
          <div className={cn(
            "absolute bottom-0 left-0 right-0 py-0.5 text-center text-[10px] font-medium transition-colors",
            index === currentIndex
              ? "bg-blue-500 text-white"
              : "bg-zinc-900/60 text-zinc-300 group-hover:bg-zinc-900/80"
          )}>
            {slide.slide_number}
          </div>
        </button>
      ))}
    </div>
  );
}
