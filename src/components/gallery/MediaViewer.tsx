"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface MediaViewerProps {
  media: { url: string; media_type: string; caption?: string | null }[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function MediaViewer({
  media,
  currentIndex,
  onClose,
  onNavigate,
}: MediaViewerProps) {
  const current = media[currentIndex];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0)
        onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < media.length - 1)
        onNavigate(currentIndex + 1);
    }

    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [currentIndex, media.length, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:text-white/80"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      {currentIndex > 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 text-white hover:text-white/80"
          onClick={() => onNavigate(currentIndex - 1)}
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
      )}

      <div className="flex flex-col items-center max-w-[90vw] max-h-[90vh]">
        {current.media_type === "video" ? (
          <video
            src={current.url}
            controls
            className="max-h-[80vh] max-w-full rounded-lg"
          />
        ) : (
          <img
            src={current.url}
            alt={current.caption || ""}
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
          />
        )}

        {current.caption && (
          <p className="mt-3 text-white/80 text-sm text-center">
            {current.caption}
          </p>
        )}

        <p className="mt-1 text-white/50 text-xs">
          {currentIndex + 1} / {media.length}
        </p>
      </div>

      {currentIndex < media.length - 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 text-white hover:text-white/80"
          onClick={() => onNavigate(currentIndex + 1)}
        >
          <ChevronRight className="h-8 w-8" />
        </Button>
      )}
    </div>
  );
}
