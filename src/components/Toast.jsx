import React from "react";

export default function Toast({ toast, className = "" }) {
  if (!toast) return null;
  return (
    <div
      className={`text-sm p-2 rounded ${className} ${
        toast.type === "error"
          ? "bg-red-100 text-red-700"
          : toast.type === "success"
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {toast.msg}
    </div>
  );
}
