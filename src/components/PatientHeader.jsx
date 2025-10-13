// src/components/PatientHeader.jsx
import React from "react";
import { fullName } from "../lib/utils";
import { dateOnly } from "../lib/utils";
export default function PatientHeader({ patient }) {
  if (!patient) return null;
  const p = patient;
  return (
    <div className="border rounded p-3 bg-white">
      <div className="text-xs font-semibold mb-1">Patient Chart</div>
      <div className="text-sm grid md:grid-cols-2 gap-x-6 gap-y-1">
        <div><b>Family Number:</b> {p.family_number}</div>
        <div><b>Name:</b> {fullName(p)}</div>
        <div><b>Sex:</b> {p.sex || "—"}</div>
        <div><span className="font-semibold">Birthdate:</span> {dateOnly(patient.birthdate)}</div>
        <div><b>Age:</b> {p.age ?? "—"}</div>
        <div><b>Contact Number:</b> {p.contact_number || "—"}</div>
        <div><b>Contact Person:</b> {p.contact_person || "—"}</div>
      </div>
    </div>
  );
}
