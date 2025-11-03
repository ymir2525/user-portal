// src/apps/nurse/NurseQueueChartView.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fmtDate } from "../../lib/utils";

import PatientHeader from "../../components/PatientHeader";
import "../doctor/doctorDash.css"; // reuse Doctor UI

function ageDisplayFromBirthdate(birthdate, fallbackAge) {
  if (!birthdate) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const bd = new Date(birthdate);
  if (isNaN(bd)) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const now = new Date();
  let months = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
  if (now.getDate() < bd.getDate()) months -= 1;
  if (months < 12) return `${Math.max(0, months)} month${months === 1 ? "" : "s"}`;
  return String(Math.floor(months / 12));
}
const sexDisplay = (sex) =>
  (!sex ? "—" : String(sex).toUpperCase().replace("WOMEN", "FEMALE").replace("MEN", "MALE"));

export default function NurseQueueChartView() {
  const nav = useNavigate();
  const location = useLocation();
  const { recordId } = useParams();
  const backTo = location.state?.from || "/nurse/queue";

  const [banner, setBanner] = useState(null);
  const [rec, setRec] = useState(null);
  const [dispensed, setDispensed] = useState([]);
  const [loadingDispensed, setLoadingDispensed] = useState(false);

  const loadRecord = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("patient_records")
        .select(`
          *,
          patients:patient_id (
            id, first_name, middle_name, surname, family_number,
            sex, age, birthdate, contact_number, contact_person
          )
        `)
        .eq("id", recordId)
        .single();
      if (error) throw error;

      setRec({
        record_id: data.id,
        patient_id: data.patient_id,
        family_number: data.patients?.family_number ?? "",
        first_name: data.patients?.first_name ?? "",
        middle_name: data.patients?.middle_name ?? "",
        surname: data.patients?.surname ?? "",
        sex: data.patients?.sex ?? "",
        age: data.patients?.age ?? "",
        birthdate: data.patients?.birthdate ?? null,
        contact_number: data.patients?.contact_number ?? "",
        contact_person: data.patients?.contact_person ?? "",
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        blood_pressure: data.blood_pressure,
        temperature_c: data.temperature_c,
        chief_complaint: data.chief_complaint,
        // removed nurse_assessment and nurse_notes (read-only view)
        doctor_assessment: data.doctor_assessment ?? "",
        doctor_management: data.doctor_management ?? "",
        created_at: data.created_at,
        completed_at: data.completed_at,
      });
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to load chart" });
    }
  }, [recordId]);

  const loadDispensedForRecord = useCallback(async () => {
    try {
      setLoadingDispensed(true);
      const { data, error } = await supabase
        .from("medicine_transactions")
        .select("id, created_at, classification, medicine_name, dosage_form, quantity")
        .eq("direction", "out")
        .eq("record_id", recordId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDispensed(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDispensed(false);
    }
  }, [recordId]);

  useEffect(() => {
    loadRecord();
    loadDispensedForRecord();
  }, [loadRecord, loadDispensedForRecord]);

  const activeWithDisplays = useMemo(
    () =>
      rec
        ? { ...rec, age_display: ageDisplayFromBirthdate(rec.birthdate, rec.age), sex_display: sexDisplay(rec.sex) }
        : null,
    [rec]
  );

  if (!rec) {
    return (
      <div className="stack">
        {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}
        <div className="muted small">Loading…</div>
        <button className="btn btn--outline" onClick={() => nav(backTo, { replace: true })}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="stack pt-1">
      {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}
      <button
        onClick={() => nav(backTo, { replace: true })}
        style={{ color: "black", border: "1px solid black", padding: 4, width: 140 }}
      >
        Back
      </button>

      <PatientHeader patient={activeWithDisplays} />

      {/* Two-column layout, mirroring Doctor UI */}
      <div className="grid-2">
        {/* Left: Doctor’s Notes (read-only) */}
        <div className="panel">
          <div className="panel__title">Doctor’s Notes</div>

          <div className="small muted" style={{ marginBottom: 6 }}>Assessment / Diagnosis</div>
          <div className="textarea" style={{ pointerEvents: "none", background: "#fafafa" }}>
            {rec.doctor_assessment || "—"}
          </div>

          <div className="small muted" style={{ marginTop: 10, marginBottom: 6 }}>Management</div>
          <div className="textarea" style={{ pointerEvents: "none", background: "#fafafa" }}>
            {rec.doctor_management || "—"}
          </div>
        </div>

        {/* Right: Nurse’s Notes (renamed panel; just vitals + chief complaint) */}
        <div className="panel">
          <div className="panel__title">Nurse’s Notes</div>

          <div className="kv">
            <div><span>Height:</span> {rec.height_cm ?? "—"} cm</div>
            <div><span>Weight:</span> {rec.weight_kg ?? "—"} kg</div>
            <div><span>Blood Pressure:</span> {rec.blood_pressure ?? "—"}</div>
            <div><span>Temperature:</span> {rec.temperature_c ?? "—"} °C</div>
          </div>

          <div className="small muted" style={{ marginTop: 10, marginBottom: 6 }}>Chief Complaint</div>
          <div className="textarea" style={{ pointerEvents: "none", background: "#fafafa" }}>
            {rec.chief_complaint || "—"}
          </div>
        </div>
      </div>

      {/* Medicine section (read-only) */}
      <div className="panel">
        <div className="panel__title">Medicine</div>
        <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>Medicine Consumption</div>

        <div className="card card--form" style={{ marginTop: 8 }}>
          <h4 className="card__title">Medicine Distributed</h4>

          {loadingDispensed ? (
            <div className="muted small">Loading…</div>
          ) : dispensed.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Classification</th>
                    <th>Medicine</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dispensed.map((r, i) => (
                    <tr key={r.id} className={i % 2 ? "is-even" : "is-odd"}>
                      <td>{r.classification || "—"}</td>
                      <td>{r.medicine_name || "—"}</td>
                      <td>{r.dosage_form || "—"}</td>
                      <td>{r.quantity}</td>
                      <td>{r.created_at ? new Date(r.created_at).toLocaleTimeString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted small">No medicines distributed for this visit.</div>
          )}
        </div>
      </div>

      <div className="muted small" style={{ textAlign: "center" }}>
        Visit created: {fmtDate(rec.created_at)} {rec.completed_at ? `• Completed: ${fmtDate(rec.completed_at)}` : ""}
      </div>
    </div>
  );
}
