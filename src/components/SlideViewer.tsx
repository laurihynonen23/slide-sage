"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Crop } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Slide, RegionSelection } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

interface SlideViewerProps {
  slide: Slide | null;
  slideIndex: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
  onRegionSelect: (region: RegionSelection | null) => void;
  selectedRegion: RegionSelection | null;
}

export function SlideViewer({
  slide,
  slideIndex,
  totalSlides,
  onPrevious,
  onNext,
  onRegionSelect,
  selectedRegion,
}: SlideViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onPrevious();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        onNext();
      } else if (e.key === "Escape") {
        onRegionSelect(null);
        setSelectionMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPrevious, onNext, onRegionSelect]);

  // Trackpad / scroll wheel navigation
  const lastWheelTime = useRef(0);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Only navigate when not zoomed (zoomed = let the container scroll)
    if (zoom !== 1) return;
    // Debounce: prevent rapid-fire slide changes
    const now = Date.now();
    if (now - lastWheelTime.current < 250) return;
    // Use deltaY for vertical scroll (most common)
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      if (e.deltaY > 15) {
        onNext();
        lastWheelTime.current = now;
      } else if (e.deltaY < -15) {
        onPrevious();
        lastWheelTime.current = now;
      }
    }
  }, [zoom, onNext, onPrevious]);

  const getRelativePosition = useCallback((e: React.MouseEvent) => {
    if (!imageContainerRef.current) return null;
    const rect = imageContainerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      containerWidth: rect.width,
      containerHeight: rect.height,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode) return;
    const pos = getRelativePosition(e);
    if (!pos) return;
    setIsSelecting(true);
    setDragStart({ x: pos.x, y: pos.y });
    setDragCurrent({ x: pos.x, y: pos.y });
    onRegionSelect(null);
  }, [selectionMode, getRelativePosition, onRegionSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting) return;
    const pos = getRelativePosition(e);
    if (!pos) return;
    setDragCurrent({ x: pos.x, y: pos.y });
  }, [isSelecting, getRelativePosition]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !dragStart || !dragCurrent || !imageContainerRef.current) {
      setIsSelecting(false);
      return;
    }

    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);

    if (width > 10 && height > 10) {
      onRegionSelect({
        x,
        y,
        width,
        height,
        slideWidth: rect.width,
        slideHeight: rect.height,
      });
    }

    setIsSelecting(false);
    setDragStart(null);
    setDragCurrent(null);
  }, [isSelecting, dragStart, dragCurrent, onRegionSelect]);

  const selectionRect = dragStart && dragCurrent ? {
    left: Math.min(dragStart.x, dragCurrent.x),
    top: Math.min(dragStart.y, dragCurrent.y),
    width: Math.abs(dragCurrent.x - dragStart.x),
    height: Math.abs(dragCurrent.y - dragStart.y),
  } : null;

  if (!slide) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/50">
        <p className="text-zinc-400 text-sm">No slide selected</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-900/50 min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-400 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {zoom !== 1 && (
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
              title="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <span className="text-xs font-medium text-zinc-500 tabular-nums">
          Slide {slide.slide_number} of {totalSlides}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (selectionMode) onRegionSelect(null);
            }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              selectionMode
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
            )}
            title="Select region"
          >
            <Crop className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{selectionMode ? "Selecting" : "Select"}</span>
          </button>
        </div>
      </div>

      {/* Slide display */}
      <div className="flex-1 relative overflow-auto flex items-center justify-center p-6" onWheel={handleWheel}>
        <div className="flex items-center gap-3 absolute inset-0 pointer-events-none z-10 px-2">
          <button
            onClick={onPrevious}
            disabled={slideIndex === 0}
            className={cn(
              "pointer-events-auto p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg backdrop-blur-sm transition-all",
              slideIndex === 0
                ? "opacity-0 cursor-default"
                : "opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-70 hover:scale-105"
            )}
            style={{ opacity: slideIndex === 0 ? 0 : undefined }}
            onMouseEnter={(e) => { if (slideIndex > 0) e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
          >
            <ChevronLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
          </button>
          <div className="flex-1" />
          <button
            onClick={onNext}
            disabled={slideIndex >= totalSlides - 1}
            className={cn(
              "pointer-events-auto p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg backdrop-blur-sm transition-all",
              slideIndex >= totalSlides - 1
                ? "opacity-0 cursor-default"
                : "opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-70 hover:scale-105"
            )}
            onMouseEnter={(e) => { if (slideIndex < totalSlides - 1) e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
          >
            <ChevronRight className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            ref={imageContainerRef}
            className={cn(
              "relative rounded-xl overflow-hidden shadow-2xl shadow-zinc-900/10 dark:shadow-black/30",
              selectionMode ? "cursor-crosshair" : "cursor-default"
            )}
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isSelecting) handleMouseUp(); }}
          >
            <img
              src={`/api/slides/image/${slide.id}`}
              alt={`Slide ${slide.slide_number}`}
              className="max-w-full max-h-[calc(100vh-200px)] object-contain select-none"
              draggable={false}
            />

            {/* Active selection overlay */}
            {isSelecting && selectionRect && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/10 rounded-sm pointer-events-none"
                style={selectionRect}
              />
            )}

            {/* Confirmed selection */}
            {selectedRegion && !isSelecting && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/10 rounded-sm"
                style={{
                  left: selectedRegion.x,
                  top: selectedRegion.y,
                  width: selectedRegion.width,
                  height: selectedRegion.height,
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onRegionSelect(null); }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center hover:bg-blue-600 transition-colors"
                >
                  ×
                </button>
                <span className="absolute -bottom-5 left-0 text-[10px] text-blue-500 font-medium whitespace-nowrap">
                  Selected region
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
