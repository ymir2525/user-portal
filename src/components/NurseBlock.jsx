// src/components/NurseBlock.jsx
import React from "react";

export default function NurseBlock({ record }) {
  if (!record) return <div className="text-sm text-gray-500">Pick a patient on the left.</div>;
  const n = record;
  return (
    <div className="border rounded p-3 bg-white">
      <div className="font-semibold mb-2">Nurse Notes:</div>
      <div className="text-sm space-y-1">
        <div>Height: {n.height_cm ?? "—"} cm</div>
        <div>Weight: {n.weight_kg ?? "—"} kg</div>
        <div>Blood Pressure: {n.blood_pressure ?? "—"}</div>
        <div>Temperature: {n.temperature_c ?? "—"} °C</div>
        <div className="mt-2">Chief Complaint: {n.chief_complaint || "—"}</div>
      </div>
    </div>
  );
}
