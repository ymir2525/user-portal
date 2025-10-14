// src/components/signaturePad/SignatureDialog.jsx
import React from "react";
import SignaturePad from "./SignaturePad";

export default function SignatureDialog({
  open,
  title = "Draw Signature",
  initialValue,
  onClose,
  onDone,          // receives (png)
  heightClass = "h-48",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Modal */}
      <div className="absolute left-1/2 top-1/2 w-[min(96vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-slate-100">Close</button>
        </div>

        <div className="p-4">
          <div className={heightClass}>
            <SignaturePad
              className="h-full"
              penColor="#111"
              penWidth={2}
              backgroundColor="#fff"
              onDone={(png) => {
                onDone?.(png);
                onClose?.();
              }}
            />
          </div>

          {initialValue && (
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">Current signature:</div>
              <img src={initialValue} alt="Current signature" className="max-h-20 border rounded bg-white" />
            </div>
          )}

          <div className="mt-3 text-xs text-slate-500">
            Tip: Use a touch screen or mouse. Use “Undo” for mistakes.
          </div>
        </div>
      </div>
    </div>
  );
}
