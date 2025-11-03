// src/apps/nurse/NurseDayHistory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom"; // ✅ ADD

/* ----------------- helpers ----------------- */
const todayPH = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const toTitle = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, g1) => g1.toUpperCase());

const fullName = (p) =>
  [toTitle(p?.first_name), toTitle(p?.middle_name), toTitle(p?.surname)]
    .filter(Boolean)
    .join(" ");

const computeAge = (p) => {
  if (Number.isInteger(p?.age)) return p.age;
  if (!p?.birthdate) return "—";
  try {
    const b = new Date(p.birthdate);
    const tznow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
    );
    let a = tznow.getFullYear() - b.getFullYear();
    const m = tznow.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && tznow.getDate() < b.getDate())) a--;
    return a;
  } catch {
    return "—";
  }
};

const formatHumanDate = (yyyyMMdd) =>
  new Date(yyyyMMdd + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/* medicine summary like: Amoxicillin (5, tablet), Doxycycline (6) */
const summarizeMeds = (txns) => {
  if (!Array.isArray(txns) || txns.length === 0) return "None";
  const map = new Map();
  txns.forEach((t) => {
    const key = `${t.medicine_name}¦${t.dosage_form || ""}`;
    map.set(key, (map.get(key) || 0) + (t.quantity || 0));
  });
  return Array.from(map.entries())
    .map(([k, qty]) => {
      const [name, form] = k.split("¦");
      return `${name} (${qty}${form ? `, ${form}` : ""})`;
    })
    .join(", ");
};

/* ----------------- component ----------------- */
export default function NurseDayHistory() {
  const [selectedDate, setSelectedDate] = useState(todayPH);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [records, setRecords] = useState([]); // [{record, patient, meds[]}]
  const nav = useNavigate(); // ✅ ADD

  const dateFilter = useMemo(() => {
    if (!selectedDate) return todayPH();
    if (typeof selectedDate === "string") return selectedDate;
    try {
      return selectedDate.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    } catch {
      return todayPH();
    }
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // 1) Fetch patient records for the day (this is your "chart saved" count)
        const { data: recs, error: recErr } = await supabase
          .from("patient_records")
          .select(
            `
            id,
            patient_id,
            visit_date,
            patients:patient_id (
              id,
              first_name,
              middle_name,
              surname,
              family_number,
              age,
              birthdate
            )
          `
          )
          .eq("visit_date", dateFilter)
          .eq("status", "completed")   // ✅ show only saved/completed charts
          .order("created_at", { ascending: true });

        if (recErr) throw recErr;
        const recordIds = (recs || []).map((r) => r.id);
        let medByRecord = new Map();

        if (recordIds.length > 0) {
          // 2) Fetch medicine "out" transactions for those records (same date window)
          const { data: meds, error: medErr } = await supabase
            .from("medicine_transactions")
            .select("record_id, medicine_name, dosage_form, quantity, direction, created_at")
            .in("record_id", recordIds)
            .eq("direction", "out");
          if (medErr) throw medErr;

          meds.forEach((m) => {
            const arr = medByRecord.get(m.record_id) || [];
            arr.push(m);
            medByRecord.set(m.record_id, arr);
          });
        }

        const merged = (recs || []).map((r) => ({
          record: r,
          patient: r.patients,
          meds: medByRecord.get(r.id) || [],
        }));

        if (!cancelled) setRecords(merged);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFilter]);

  const totalPatients = records.length;

  return (
    <section className="max-w-5xl mx-auto">
      {/* Header + Date Picker */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold text-orange-800">
          Day History: <span className="text-gray-700">{formatHumanDate(dateFilter)}</span>
        </h2>

        <label className="inline-flex items-center gap-2">
          <span className="text-sm text-gray-600">Select Date</span>
          <input
            type="date"
            className="border rounded-md px-3 py-1.5 text-sm bg-white"
            value={dateFilter}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={todayPH()}
          />
        </label>
      </header>

      {/* Stat: Total Number of Patients (Chart saved) */}
      <div className="border rounded-lg px-4 py-3 bg-orange-50 border-orange-200 mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-orange-900">
          Total Number of Patients (Chart saved)
        </span>
        <span className="text-2xl font-bold text-orange-900">
          {loading ? "…" : totalPatients}
        </span>
      </div>

      {/* Error */}
      {err && (
        <div className="border rounded-lg p-3 bg-red-50 border-red-200 text-red-700 mb-4 text-sm">
          {err}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {loading && (
          <div className="text-sm text-gray-600">Loading patients…</div>
        )}

        {!loading && records.length === 0 && (
          <div className="text-sm text-gray-600">
            No patient charts saved for {formatHumanDate(dateFilter)}.
          </div>
        )}

        {records.map(({ record, patient, meds }) => {
          const medLine = summarizeMeds(meds);
          const age = computeAge(patient);
          return (
            <div
              key={record.id}
              className="border rounded-xl p-4 bg-white border-slate-200 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {fullName(patient)}
                  </div>
                  <div className="text-xs text-slate-600">
                    {patient?.family_number ? `FAM ${patient.family_number}` : "No Fam #"}{" "}
                    | {Number.isInteger(age) ? `${age} yrs old` : `${age}`}
                  </div>

                  <div className="mt-2 text-sm text-slate-800">
                    <span className="font-medium">Medicine Distributed:</span>{" "}
                    {medLine}
                  </div>
                </div>

                {/* View Chart (enabled) */}
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm border rounded-md border-orange-300 text-orange-700 hover:bg-orange-50"
                  title="View this saved chart"
                  onClick={() =>
   nav(`/nurse/history/view/${record.id}`, { state: { from: "/nurse/history" } })
 }
                >
                  View Chart
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
