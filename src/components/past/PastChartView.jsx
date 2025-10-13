// src/components/past/PastChartView.jsx
import React from "react";
import { fmtDate } from "../../lib/utils";
import PatientHeader from "../PatientHeader";

export default function PastChartView({ rec, active, onBack }) {
  if (!rec || !active) return null;
  const dateStr = fmtDate(rec.completed_at || rec.visit_date || rec.created_at);
  const doctorName = rec.doctor_full_name || rec.doctor_name || "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{dateStr}</div>
        <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">Back</button>
      </div>

      <div className="text-sm mb-1"><b>Doctor in Charge:</b> {doctorName}</div>

      <PatientHeader patient={active} />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded p-3 bg-white">
          <div className="font-semibold mb-2">Doctor’s Notes:</div>
          <div className="text-sm whitespace-pre-wrap min-h-[140px] border rounded px-3 py-2 bg-gray-50">
            {rec.doctor_notes || "—"}
          </div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="font-semibold mb-2">Nurse Notes:</div>
          <div className="text-sm space-y-1">
            <div>Height: {rec.height_cm ?? "—"} cm</div>
            <div>Weight: {rec.weight_kg ?? "—"} kg</div>
            <div>Blood Pressure: {rec.blood_pressure ?? "—"}</div>
            <div>Temperature: {rec.temperature_c ?? "—"} °C</div>
            <div className="mt-2">Chief Complaint: {rec.chief_complaint || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
