"use client";

import { useRef, useState } from "react";

export function SignatureCanvas({
  onSave,
}: {
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    setDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!pos || !ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!pos || !ctx) return;
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1b3a2d";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawn(true);
  };

  const end = () => {
    setDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        className="w-full rounded-xl bg-white ring-1 ring-line touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="rounded-full bg-paper px-3 py-1 text-xs ring-1 ring-line">
          Clear
        </button>
        <button
          type="button"
          disabled={!hasDrawn}
          onClick={save}
          className="rounded-full bg-forest-800 px-4 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save Signature
        </button>
      </div>
      <p className="text-[11px] text-ink-soft">Free — signature saved as Cloudinary image, no extra cost.</p>
    </div>
  );
}
