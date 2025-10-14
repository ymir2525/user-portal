// src/components/signaturePad/SignaturePad.jsx
import React, { useEffect, useRef, useState } from "react";

export default function SignaturePad({
  className = "",
  penColor = "#111",
  penWidth = 2,
  backgroundColor = "#fff",
  onChange,
  onDone, // returns PNG data URL
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const currentStroke = useRef([]);
  const dpr = Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio : 1);

  useEffect(() => {
    const resize = () => {
      if (!canvasRef.current || !wrapperRef.current) return;
      const canvas = canvasRef.current;
      const rect = wrapperRef.current.getBoundingClientRect();

      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;   // backticks are important
      canvas.style.height = `${rect.height}px`;

      redraw();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    return { x, y };
  };

  const start = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    currentStroke.current = [getPos(e)];
  };

  const move = (e) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current.getContext("2d");
    const pt = getPos(e);
    const last = currentStroke.current[currentStroke.current.length - 1];
    currentStroke.current.push(pt);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth * dpr;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const end = (e) => {
    if (!isDrawing) return;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    setIsDrawing(false);

    if (currentStroke.current.length > 1) {
      const finalized = currentStroke.current.map((p) => ({ x: p.x, y: p.y }));
      setStrokes((prev) => {
        const next = [...prev, finalized];
        onChange && onChange(next.length === 0);
        return next;
      });
    }
    currentStroke.current = [];
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = penColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = penWidth * dpr;

    strokes.forEach((stroke) => {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });
  };

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, penColor, penWidth, backgroundColor]);

  const undo = () => {
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      onChange && onChange(next.length === 0);
      return next;
    });
  };

  const toDataURL = (type = "image/png", quality) => canvasRef.current.toDataURL(type, quality);

  return (
    <div className={`select-none ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-black/60 bg-white p-2 border-b border-slate-300">
        <button type="button" onClick={undo} className="rounded-md border px-3 py-1 hover:bg-slate-50">Undo</button>
        <button type="button" onClick={() => onDone?.(toDataURL("image/png"))} className="ml-auto rounded-md border px-3 py-1 hover:bg-slate-50">Done</button>
      </div>
      <div ref={wrapperRef} className="h-full w-full rounded-md border border-slate-300 bg-white touch-manipulation">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
      </div>
    </div>
  );
}
