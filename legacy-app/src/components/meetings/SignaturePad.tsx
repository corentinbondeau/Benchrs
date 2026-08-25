"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, PenLine, Trash2 } from "lucide-react";

export function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const down = (e: PointerEvent) => {
      drawingRef.current = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const up = () => {
      drawingRef.current = false;
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white overflow-hidden">
        <canvas ref={canvasRef} width={500} height={180} className="w-full touch-none" style={{ touchAction: "none" }} />
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <PenLine className="h-3 w-3" />
        Signe avec ton doigt ou ta souris
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={clear}>
          <Eraser className="h-3 w-3 mr-1" />
          Effacer
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs flex-1"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            onSave(canvas.toDataURL("image/png"));
          }}
        >
          Valider la signature
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>
          <Trash2 className="h-3 w-3 mr-1" />
          Annuler
        </Button>
      </div>
    </div>
  );
}
