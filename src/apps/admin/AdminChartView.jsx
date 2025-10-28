// src/apps/admin/AdminChartView.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

function ageDisplayFromBirthdate(birthdate, fallbackAge) {
  if (!birthdate) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const bd = new Date(birthdate);
  if (isNaN(bd)) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const now = new Date();
  if (bd > now) return "0 months";
  let months =
    (now.getFullYear() - bd.getFullYear()) * 12 +
    (now.getMonth() - bd.getMonth());
  if (now.getDate() < bd.getDate()) months -= 1;
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  return String(Math.floor(months / 12));
}

const fullName = (p) =>
  [p?.first_name, p?.middle_name, p?.surname].filter(Boolean).join(" ");

export default function AdminChartView() {
  const { patientId } = useParams();
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        // === FETCH DIRECTLY FROM patients ===
        const { data, error } = await supabase
          .from("patients")
          .select(`
            id,
            family_number,
            first_name,
            middle_name,
            surname,
            sex,
            age,
            birthdate,
            contact_number,
            contact_person,
            height_cm,
            weight_kg,
            blood_pressure,
            temperature_c,
            chief_complaint
          `)
          .eq("id", patientId)
          .single();

        if (error) throw error;
        const merged = {
          ...data,
          age_display: ageDisplayFromBirthdate(data.birthdate, data.age),
          // doctor_notes do not exist on patients — show blank read-only box
          doctor_notes: "",
        };
        if (alive) setRec(merged);
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load chart");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [patientId]);

  return (
    <section className="max-w-5xl mx-auto">
      {/* Top tabs bar (visual only) */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <button className="h-9 rounded-md text-white font-medium" style={{ backgroundColor: "#f97316" }}>
          Day Chart
        </button>
        <button className="h-9 rounded-md font-medium" style={{ backgroundColor: "#fdebdc", color: "#7c3e10" }}>
          Past Records
        </button>
      </div>

      {/* Patient Chart header */}
      <div className="border rounded-md p-4 mb-4 bg-white">
        {loading && <div className="text-sm text-slate-600">Loading…</div>}
        {err && <div className="text-sm text-red-700">{err}</div>}
        {!loading && !err && rec && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-2">
              <div className="font-semibold">Patient Chart</div>
              <div><span className="font-semibold">Family Number:</span> {rec.family_number || "—"}</div>
              <div><span className="font-semibold">Sex:</span> {String(rec.sex || "—").toUpperCase()}</div>
              <div><span className="font-semibold">Age:</span> {rec.age_display}</div>
              <div><span className="font-semibold">Contact Person:</span> {rec.contact_person || "—"}</div>
            </div>
            <div className="space-y-2">
              <div><span className="font-semibold">Name:</span> {fullName(rec) || "—"}</div>
              <div><span className="font-semibold">Birthdate:</span> {rec.birthdate || "—"}</div>
              <div><span className="font-semibold">Contact Number:</span> {rec.contact_number || "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Doctor's Notes & Nurse Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-md p-3 bg-white">
          <div className="font-semibold mb-2">Doctor’s Notes:</div>
          <textarea
            className="w-full min-h-[180px] border rounded p-2 text-sm"
            placeholder="Enter findings, assessment, and plan here…"
            value={rec?.doctor_notes || ""}
            readOnly
          />
        </div>

        <div className="border rounded-md p-3 bg-white text-sm">
          <div className="font-semibold mb-2">Nurse Notes:</div>
          <div>Height: {rec?.height_cm ?? "—"} cm</div>
          <div>Weight: {rec?.weight_kg ?? "—"} kg</div>
          <div>Blood Pressure: {rec?.blood_pressure || "—"}</div>
          <div>Temperature: {rec?.temperature_c ?? "—"} °C</div>
          <div className="mt-2">Chief Complaint: {rec?.chief_complaint || "—"}</div>
        </div>
      </div>

      {/* Links row (visual only) */}
      <div className="flex flex-wrap gap-6 text-sm mt-4">
        <span className="underline text-blue-700 cursor-default">Referral Form</span>
        <span className="underline text-blue-700 cursor-default">Prescription Sheet</span>
        <span className="underline text-blue-700 cursor-default">Laboratory Request</span>
        <span className="underline text-blue-700 cursor-default">Medical Certificate</span>
      </div>
    </section>
  );
}
