// NurseQueueChartView.jsx — DROP-IN REPLACEMENT
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

  // NEW: role + edit state + form
  const [isNurse, setIsNurse] = useState(false);
  const [editNurse, setEditNurse] = useState(false);
  const [nurseForm, setNurseForm] = useState({
    height_cm: "",
    weight_kg: "",
    blood_pressure: "",
    temperature_c: "",
    chief_complaint: "",
  });

  // fetch role (profiles.role === 'NURSE')
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsNurse((prof?.role || "").toUpperCase() === "NURSE");
    })();
  }, []);

  const loadRecord = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("patient_records")
        .select(`
          *,
          patients:patient_id (
            id, first_name, middle_name, surname, family_number,
            sex, age, birthdate, contact_number, contact_person,
            emergency_contact_name, emergency_relation, address
          )
        `)
        .eq("id", recordId)
        .single();
      if (error) throw error;

      const next = {
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
        contact_person_number: data.patients?.contact_person ?? "",
        contact_person_name: data.patients?.emergency_contact_name ?? "",
        relation: data.patients?.emergency_relation ?? "",
        address: data.patients?.address ?? "",
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        blood_pressure: data.blood_pressure,
        temperature_c: data.temperature_c,
        chief_complaint: data.chief_complaint,
        doctor_assessment: data.doctor_assessment ?? "",
        doctor_management: data.doctor_management ?? "",
        created_at: data.created_at,
        completed_at: data.completed_at,
      };
      setRec(next);

      // seed nurse form
      setNurseForm({
        height_cm: next.height_cm ?? "",
        weight_kg: next.weight_kg ?? "",
        blood_pressure: next.blood_pressure ?? "",
        temperature_c: next.temperature_c ?? "",
        chief_complaint: next.chief_complaint ?? "",
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

  // realtime—patients row updated elsewhere
  useEffect(() => {
    if (!rec?.patient_id) return;
    const ch = supabase
      .channel(`patients-${rec.patient_id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "patients", filter: `id=eq.${rec.patient_id}` },
        () => loadRecord()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [rec?.patient_id, loadRecord]);

  // realtime—this record updated/bumped elsewhere
  useEffect(() => {
    if (!rec?.record_id) return;
    const ch = supabase
      .channel(`patient_records-${rec.record_id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "patient_records", filter: `id=eq.${rec.record_id}` },
        () => loadRecord()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [rec?.record_id, loadRecord]);

  // realtime—med transactions table for this record
  useEffect(() => {
    if (!rec?.record_id) return;
    const ch = supabase
      .channel(`medtx-${rec.record_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_transactions", filter: `record_id=eq.${rec.record_id}` },
        () => loadDispensedForRecord()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [rec?.record_id, loadDispensedForRecord]);

  const activeWithDisplays = useMemo(
    () =>
      rec
        ? { ...rec, age_display: ageDisplayFromBirthdate(rec.birthdate, rec.age), sex_display: sexDisplay(rec.sex) }
        : null,
    [rec]
  );

  // SAVE nurse notes
  const saveNurseNotes = async () => {
    try {
      setBanner(null);

      // light cleanup
      const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
      const cleaned = {
        height_cm: num(String(nurseForm.height_cm).endsWith(".") ? String(nurseForm.height_cm).slice(0, -1) : nurseForm.height_cm),
        weight_kg: num(String(nurseForm.weight_kg).endsWith(".") ? String(nurseForm.weight_kg).slice(0, -1) : nurseForm.weight_kg),
        temperature_c: num(String(nurseForm.temperature_c).endsWith(".") ? String(nurseForm.temperature_c).slice(0, -1) : nurseForm.temperature_c),
        blood_pressure: String(nurseForm.blood_pressure || "").trim() || null, // keep 120/80 string
        chief_complaint: String(nurseForm.chief_complaint || "").trim() || null,
      };

      const { error } = await supabase
        .from("patient_records")
        .update({ ...cleaned, updated_at: new Date().toISOString() })
        .eq("id", rec.record_id);

      if (error) throw error;

      // reflect locally
      setRec((r) => ({ ...r, ...cleaned }));
      setEditNurse(false);
      setBanner({ type: "ok", msg: "Nurse’s notes updated." });
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to update nurse’s notes" });
    }
  };

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

      {/* Patient header */}
      <PatientHeader patient={activeWithDisplays} />

      {/* Two-column layout */}
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

        {/* Right: Nurse’s Notes (editable for nurses) */}
        <div className="panel">
          <div className="panel__title">
            Nurse’s Notes
            {isNurse && !editNurse && (
              <button className="btn btn--primary" style={{ float: "right" }} onClick={() => setEditNurse(true)}>
                Edit
              </button>
            )}
          </div>

          {!isNurse || !editNurse ? (
            <>
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
            </>
          ) : (
            <>
              <div className="grid-2">
                <label className="field">
                  <div className="field__label">Height (cm)</div>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={nurseForm.height_cm}
                    onChange={(e)=> setNurseForm((f)=> ({ ...f, height_cm: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <div className="field__label">Weight (kg)</div>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={nurseForm.weight_kg}
                    onChange={(e)=> setNurseForm((f)=> ({ ...f, weight_kg: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <div className="field__label">Blood Pressure</div>
                  <input
                    className="input"
                    placeholder="e.g., 120/80"
                    value={nurseForm.blood_pressure}
                    onChange={(e)=> setNurseForm((f)=> ({ ...f, blood_pressure: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <div className="field__label">Temperature (°C)</div>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={nurseForm.temperature_c}
                    onChange={(e)=> setNurseForm((f)=> ({ ...f, temperature_c: e.target.value }))}
                  />
                </label>
              </div>

              <label className="field" style={{ marginTop: 8 }}>
                <div className="field__label">Chief Complaint</div>
                <textarea
                  className="textarea"
                  rows={3}
                  value={nurseForm.chief_complaint}
                  onChange={(e)=> setNurseForm((f)=> ({ ...f, chief_complaint: e.target.value }))}
                />
              </label>

              <div className="row gap-8" style={{ marginTop: 12 }}>
                <button className="btn btn--primary" onClick={saveNurseNotes}>Save</button>
                <button
                  className="btn btn--outline"
                  onClick={() => {
                    setEditNurse(false);
                    setNurseForm({
                      height_cm: rec.height_cm ?? "",
                      weight_kg: rec.weight_kg ?? "",
                      blood_pressure: rec.blood_pressure ?? "",
                      temperature_c: rec.temperature_c ?? "",
                      chief_complaint: rec.chief_complaint ?? "",
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
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
