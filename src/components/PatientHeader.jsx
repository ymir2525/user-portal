// src/components/PatientHeader.jsx
import React, { useMemo } from "react";
import { fullName, dateOnly } from "../lib/utils";

export default function PatientHeader({ patient }) {
  if (!patient) return null;
  const p = patient;

  const sexText = p.sex_display ?? p.sex ?? "—";
  const ageText = p.age_display ?? (p.age ?? "—");

  // Add extension without changing `fullName` util
  const displayName = useMemo(() => {
    const base = fullName(p) || "";
    const ext = p.name_extension || p.extension || "";
    return ext ? `${base}, ${ext}` : base;
  }, [p]);

  return (
    <div className="border rounded p-3 bg-white">
      <div className="text-xs font-semibold mb-1">Patient Chart</div>
      <div className="text-sm grid md:grid-cols-2 gap-x-6 gap-y-1">
        <div><b>Family Number:</b> {String(p.family_number || "").padStart(3,"0")}</div>
        <div><b>Name:</b> {displayName}</div>
        <div><b>Sex:</b> {sexText}</div>
        <div><b>Birthdate:</b> {dateOnly(p.birthdate)}</div>
        <div><b>Age:</b> {ageText}</div>
        <div><b>Patient Contact #:</b> {p.contact_number || "—"}</div>
        <div><b>Contact Person:</b> {p.contact_person_name || "—"}</div>
        <div><b>Relation:</b> {p.relation || "—"}</div>
        <div><b>Contact Person #:</b> {p.contact_person_number || "—"}</div>
        <div className="md:col-span-2"><b>Address:</b> {p.address || "—"}</div>
      </div>
    </div>
  );
}
