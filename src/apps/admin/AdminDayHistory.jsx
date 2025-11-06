// src/apps/admin/AdminDayHistory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom"; // ✅ ADD
import "./AdminDayHistory.css"; // ✅ ADD

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
export default function AdminDayHistory() {
  const [selectedDate, setSelectedDate] = useState(todayPH);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [records, setRecords] = useState([]); // [{record, patient, meds[]}]
  const nav = useNavigate(); // ✅

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
        // 1) Completed charts only (exclude queued)
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
          .eq("status", "completed") // ✅ only saved charts
          .order("created_at", { ascending: true });

        if (recErr) throw recErr;
        const recordIds = (recs || []).map((r) => r.id);
        let medByRecord = new Map();

        if (recordIds.length > 0) {
          // 2) Med transactions for those records
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
    <section className="container">
      {/* Header + Date Picker */}
      <header className="header">
        <h2 className="header-title">
          Day History: <span className="header-date">{formatHumanDate(dateFilter)}</span>
        </h2>

        <label className="date-picker">
          <span className="date-picker-label">Select Date</span>
          <input
            type="date"
            className="date-picker-input"
            value={dateFilter}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={todayPH()}
          />
        </label>
      </header>

      {/* Stat: Total Number of Patients (Chart saved) */}
      <div className="stat-box">
        <span className="stat-box-text">Total Number of Patients (Chart saved)</span>
        <span className="stat-box-number">{loading ? "…" : totalPatients}</span>
      </div>

      {/* Error */}
      {err && <div className="error-message">{err}</div>}

      {/* List */}
      <div className="record-list">
        {loading && <div className="loading-text">Loading patients…</div>}

        {!loading && records.length === 0 && (
          <div className="no-records">
            No patient charts saved for {formatHumanDate(dateFilter)}.
          </div>
        )}

        {records.map(({ record, patient, meds }) => {
          const medLine = summarizeMeds(meds);
          const age = computeAge(patient);
          return (
            <div key={record.id} className="record-item">
              <div className="record-header">
                <div>
                  <div className="record-name">{fullName(patient)}</div>
                  <div className="record-family-age">
                    {patient?.family_number ? `FAM ${patient.family_number}` : "No Fam #"} |{" "}
                    {Number.isInteger(age) ? `${age} yrs old` : `${age}`}
                  </div>

                  <div className="meds-line">
                    <span className="meds-title">Medicine Distributed:</span> {medLine}
                  </div>
                </div>

                {/* View Chart -> same read-only view as Nurse, by recordId */}
                <button
                  type="button"
                  className="view-chart-button"
                  title="View this saved chart"
                  onClick={() =>
                    nav(`/admin/record/${record.id}`, { state: { from: "/admin/day-history" } })
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
