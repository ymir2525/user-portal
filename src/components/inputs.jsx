// src/components/inputs.js
import React from "react";

export function FormField({ label, value, onChange }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold mb-1">{label}</div>
      <input
        className="w-full border rounded px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function FormArea({ label, value, onChange }) {
  return (
    <label className="block mt-4">
      <div className="text-xs font-semibold mb-1">{label}</div>
      <textarea
        className="w-full border rounded px-2 py-1 min-h-[80px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
