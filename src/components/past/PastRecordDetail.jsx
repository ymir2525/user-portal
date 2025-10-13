// src/components/past/PastRecordDetail.jsx
import React from "react";
import { fmtDate, fullName } from "../../lib/utils";

export default function PastRecordDetail({ rec, active, onBack, onViewChart, onViewDocs }) {
  if (!rec || !active) return null;
  const dateStr = fmtDate(rec.completed_at || rec.visit_date || rec.created_at);

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">{dateStr}</div>
        <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">Back</button>
      </div>

      <div className="text-sm mb-4">
        <div><b>Patient Name:</b> {fullName(active)}</div>
        <div><b>Doctor in Charge:</b> {rec.doctor_full_name || rec.doctor_name || "—"}</div>
        <div><b>Date:</b> {dateStr}</div>
      </div>

      <div className="flex flex-col items-center gap-3 py-2">
        <button className="w-64 rounded bg-orange-300 hover:bg-orange-400 text-white py-2" onClick={onViewChart}>
          View Chart
        </button>
        <button className="w-64 rounded bg-orange-300 hover:bg-orange-400 text-white py-2" onClick={onViewDocs}>
          View Documents
        </button>
      </div>
    </div>
  );
}
