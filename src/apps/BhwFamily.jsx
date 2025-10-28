// src/apps/BhwFamily.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { dateOnly } from "../lib/utils";
import { supabase } from "../lib/supabase";
import "./BhwFamily.css";

export default function BhwFamily() {
  const { familyNumber } = useParams();
  const nav = useNavigate();

  const [mode, setMode] = useState("members"); // "members" | "patient" | "new"
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // field-level errors for the New Record form
  const [errors, setErrors] = useState({});

  // Family members
  const [members, setMembers] = useState([]);

  // Selected patient + past records
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);

  // past-record subviews
  const [pastView, setPastView] = useState("list"); // 'list' | 'detail' | 'chart' | 'docs'
  const [selectedPast, setSelectedPast] = useState(null);

  // Helper: Manila "today" (YYYY-MM-DD)
  const manilaTodayDate = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === "year").value;
    const m = parts.find(p => p.type === "month").value;
    const d = parts.find(p => p.type === "day").value;
    return `${y}-${m}-${d}`;
  };

  // --- New-record form state (now includes emergency contact fields) ---
  const [form, setForm] = useState({
    heightCm: "", weightKg: "", bloodPressure: "", temperatureC: "",
    chiefComplaint: "",
    // NEW (snapshot for this record):
    emergencyName: "",
    emergencyRelation: "",
    emergencyNumber: "",
    proceedToQueue: true // QUEUE BY DEFAULT
  });

  // === validation (original + emergency fields) ===
  const validate = useCallback((f) => {
    const errs = {};
    const trimmedCC = (f.chiefComplaint || "").trim();

    // Required vitals
    if (!f.heightCm) errs.heightCm = "Required.";
    if (!f.weightKg) errs.weightKg = "Required.";
    if (!f.bloodPressure) errs.bloodPressure = "Required.";
    if (!f.temperatureC) errs.temperatureC = "Required.";
    if (!trimmedCC) errs.chiefComplaint = "Required.";

    const toNum = (v) => (v === "" || v == null ? null : Number(v));
    const onlyDigits = (s) => (s || "").replace(/\D/g, "");
    const lettersOnlyBad = (s) => /[^A-Za-z\s]/.test(s || "");

    // Height: up to 5 digits total; 1 decimal
    if (f.heightCm) {
      const hTxt = String(f.heightCm);
      const hDigits = onlyDigits(hTxt);
      const hasOneDot = (hTxt.match(/\./g) || []).length <= 1;
      const decOk = /^\d+(\.\d)?$/.test(hTxt) || /^\d+\.$/.test(hTxt);
      if (hDigits.length === 0 || hDigits.length > 5 || !hasOneDot || !decOk) {
        errs.heightCm = "Height must be up to 5 digits, optional 1 decimal (e.g., 163.6).";
      }
      const h = toNum(hTxt.endsWith(".") ? hTxt.slice(0, -1) : hTxt);
      if (h == null || isNaN(h)) errs.heightCm = errs.heightCm || "Invalid number.";
      else if (h < 30 || h > 300) errs.heightCm = "Height must be 30–300 cm.";
    }

    // Weight: up to 4 digits total; up to 2 decimals
    if (f.weightKg) {
      const wTxt = String(f.weightKg);
      const wDigits = onlyDigits(wTxt);
      const hasOneDot = (wTxt.match(/\./g) || []).length <= 1;
      const decOk = /^\d+(\.\d{0,2})?$/.test(wTxt) || /^\d+\.$/.test(wTxt);
      if (wDigits.length === 0 || wDigits.length > 4 || !hasOneDot || !decOk) {
        errs.weightKg = "Weight must be up to 4 digits total; up to 2 decimals (e.g., 53.7 or 53.72).";
      }
      const w = toNum(wTxt.endsWith(".") ? wTxt.slice(0, -1) : wTxt);
      if (w == null || isNaN(w)) errs.weightKg = errs.weightKg || "Invalid number.";
      else if (w <= 0 || w > 500) errs.weightKg = "Weight must be 1–500 kg.";
    }

    // Blood pressure
    if (f.bloodPressure) {
      const bp = String(f.bloodPressure).trim();
      const m = bp.match(/^(\d{1,4})\/(\d{1,4})$/);
      if (!m) {
        errs.bloodPressure = "BP must look like 120/80.";
      } else {
        const left = m[1], right = m[2];
        if (left.length >= 4 || right.length >= 4) {
          errs.bloodPressure = "4 digits in blood pressure is not possible. Please make sure you input the correct BP.";
        } else {
          const sys = Number(left), dia = Number(right);
          if (isNaN(sys) || isNaN(dia)) {
            errs.bloodPressure = "BP must be numbers like 120/80.";
          } else if (sys < dia) {
            errs.bloodPressure = "Systolic should be ≥ diastolic.";
          }
          if (!errs.bloodPressure && (sys < 70 || sys > 260 || dia < 40 || dia > 160)) {
            errs.bloodPressure = "BP values look out of range.";
          }
        }
      }
    }

    // Temperature: up to 4 digits total; up to 2 decimals
    if (f.temperatureC) {
      const tTxt = String(f.temperatureC);
      const tDigits = onlyDigits(tTxt);
      const hasOneDot = (tTxt.match(/\./g) || []).length <= 1;
      const decOk = /^\d+(\.\d{0,2})?$/.test(tTxt) || /^\d+\.$/.test(tTxt);
      if (tDigits.length === 0 || tDigits.length > 4 || !hasOneDot || !decOk) {
        errs.temperatureC = "Temperature must be up to 4 digits total; up to 2 decimals (e.g., 43.7 or 43.68).";
      }
      const t = Number(tTxt.endsWith(".") ? tTxt.slice(0, -1) : tTxt);
      if (t == null || isNaN(t)) errs.temperatureC = errs.temperatureC || "Invalid number.";
      else if (t < 30 || t > 45) errs.temperatureC = "Temperature must be 30–45 °C.";
    }

    if (trimmedCC.length > 1000) errs.chiefComplaint = "Keep under 1000 characters.";

    // --- NEW: Emergency contact required + masks (match Dashboard) ---
    if (!f.emergencyName || !f.emergencyName.trim()) {
      errs.emergencyName = "Required.";
    } else if (lettersOnlyBad(f.emergencyName)) {
      errs.emergencyName = "Letters and spaces only.";
    }
    if (!f.emergencyRelation || !f.emergencyRelation.trim()) {
      errs.emergencyRelation = "Required.";
    } else if (lettersOnlyBad(f.emergencyRelation)) {
      errs.emergencyRelation = "Letters and spaces only.";
    }
    const num = onlyDigits(f.emergencyNumber);
    if (!num || num.length !== 11) {
      errs.emergencyNumber = "Must be exactly 11 digits.";
    }

    if (Object.keys(errs).length) errs._form = "Please fix the highlighted fields.";
    return errs;
  }, []);

  // Realtime validation while typing
  const setField = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    setErrors(validate(next));
    setErr("");
  };

  const canSubmit = useMemo(() => Object.keys(validate(form)).length === 0, [form, validate]);

  // Role guard + initial family load
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { nav("/login", { replace: true }); return; }

      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("role").eq("id", uid).single();

      if (profErr || !prof || String(prof.role).toUpperCase() !== "BHW") {
        await supabase.auth.signOut().catch(()=>{});
        nav("/login", { replace: true }); return;
      }

      try {
        setLoading(true); setErr("");
        const { data, error } = await supabase
          .from("patients")
          .select("id, first_name, middle_name, surname, sex, age, birthdate, family_number, created_at, contact_number, contact_person, emergency_contact_name, emergency_relation")
          .eq("family_number", familyNumber)
          .order("created_at", { ascending: false });

        if (!mounted) return;
        if (error) throw error;

        setMembers(Array.isArray(data) ? data : []);
        setMode("members");
      } catch (e) {
        console.error(e);
        setErr(e.message || "Failed to load family");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [familyNumber, nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(()=>{});
    nav("/login", { replace: true });
  };

  // Load one patient + past records
  const openPatient = async (patientId) => {
    try {
      setLoading(true); setErr("");

      const [{ data: p, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).single(),
        supabase.from("patient_records")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;

      setPatient(p);
      setRecords(Array.isArray(recs) ? recs : []);
      setMode("patient");
      setPastView("list");
      setSelectedPast(null);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load patient");
    } finally {
      setLoading(false);
    }
  };

  // New record submit
  const [saving, setSaving] = useState(false);
  const submitNewRecord = async (e) => {
    e.preventDefault();
    if (!patient || saving) return;

    const localErrs = validate(form);
    setErrors(localErrs);
    if (Object.keys(localErrs).length) {
      setErr(localErrs._form || "Please fix the highlighted fields.");
      return;
    }

    try {
      setSaving(true);

      // who is inserting (for RLS visibility)?
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id || null;

      const num = (v) => (v === "" || v == null ? null : Number(v));
      const trim = (s) => (s || "").trim();
      const onlyDigits = (s) => (s || "").replace(/\D/g, "");
      const willQueue = !!form.proceedToQueue;

      const payload = {
        patient_id: patient.id,

        // vitals
        height_cm: num(form.heightCm.endsWith(".") ? form.heightCm.slice(0, -1) : form.heightCm),
        weight_kg: num(form.weightKg.endsWith(".") ? form.weightKg.slice(0, -1) : form.weightKg),
        blood_pressure: trim(form.bloodPressure) || null,
        temperature_c: num(form.temperatureC.endsWith(".") ? form.temperatureC.slice(0, -1) : form.temperatureC),
        chief_complaint: trim(form.chiefComplaint) || null,

        // snapshot emergency contact (NEW)
        emergency_contact_name: trim(form.emergencyName) || null,
        emergency_relation: trim(form.emergencyRelation) || null,
        emergency_contact_number: onlyDigits(form.emergencyNumber) || null,

        // queue flags
        visit_date: manilaTodayDate(),
        queued: true,
        status: "queued",
        queued_at: new Date().toISOString(),

        created_by: uid,
      };

      const { error } = await supabase
        .from("patient_records")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // also flag the PATIENT as queued now
      if (willQueue) {
        await supabase
          .from("patients")
          .update({ queued: true, queued_at: new Date().toISOString() })
          .eq("id", patient.id);
      }

      // reload patient’s records
      const { data: recs } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false });

      setRecords(Array.isArray(recs) ? recs : []);

      // reset form
      setForm({
        heightCm: "", weightKg: "", bloodPressure: "", temperatureC: "",
        chiefComplaint: "",
        emergencyName: patient?.emergency_contact_name || "",
        emergencyRelation: patient?.emergency_relation || "",
        emergencyNumber: patient?.contact_person || "",
        proceedToQueue: true
      });
      setErrors({});
      setMode("patient");
      setPastView("list");
    } catch (e) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // compute age
  const computedAge = useMemo(() => {
    const bd = patient?.birthdate;
    if (!bd) return patient?.age ?? "";
    const d = new Date(bd);
    if (isNaN(d)) return patient?.age ?? "";
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
    return age;
  }, [patient]);

  // Prefill emergency fields when switching to "new"
  useEffect(() => {
    if (mode === "new" && patient) {
      setForm((prev) => ({
        ...prev,
        emergencyName: patient.emergency_contact_name || "",
        emergencyRelation: patient.emergency_relation || "",
        emergencyNumber: patient.contact_person || "",
      }));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, patient?.id]);

  return (
    <div className="family-page">
      {/* top bar: back and logout */}
      <div className="topbar">
        <Link to="/bhw" className="link link--small">← Back to Records</Link>
        <button onClick={logout} className="link link--small">Log Out</button>
      </div>

      <h2 className="page-title page-title--family">Family: {familyNumber}</h2>

      {loading && <div className="status status--loading">Loading…</div>}
      {err && <div className="error-text text-center">{err}</div>}

      {!loading && !err && (
        <>
          {mode === "members" && (
            <div className="member-list">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openPatient(m.id)}
                  className="member-card"
                >
                  <div className="member-card__row">
                    <div className="member-card__main">
                      <span className="member-card__name">
                        {m.first_name} {m.middle_name ? `${m.middle_name} ` : ""}{m.surname}
                      </span>
                      <span className="member-card__meta">
                        {" "}• {m.sex} • {m.age} Years Old
                      </span>
                    </div>
                    <div className="member-card__date">{dateOnly(m.birthdate)}</div>
                  </div>
                </button>
              ))}

              {members.length === 0 && (
                <div className="empty">No members found.</div>
              )}
            </div>
          )}

          {mode === "patient" && patient && (
            <div className="patient-wrap">
              {/* header with + New Record */}
              <div className="patient-head">
                <div className="patient-name">
                  {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}
                </div>
                <button
                  onClick={() => { setMode("new"); setErrors({}); setErr(""); }}
                  className="btn btn--accent"
                >
                  + New Record
                </button>
              </div>

              {/* Meta summary (now shows emergency details like screenshot) */}
              <div className="patient-meta">
                <div><strong>Birthdate:</strong> {dateOnly(patient.birthdate) || "—"}</div>
                <div><strong>Age:</strong> {computedAge || "—"} yrs old</div>
                <div><strong>Sex:</strong> {patient.sex || "—"}</div>
                <div><strong>Contact Number:</strong> {patient.contact_number || "—"}</div>
                <div className="patient-emergency">
                  <strong>Contact Person:</strong> {patient.emergency_contact_name || "—"}
                  {" "} | <strong>Contact Number:</strong> {patient.contact_person || "—"}
                  {" "} | <strong>Relation:</strong> {patient.emergency_relation || "—"}
                </div>
                <div className="patient-right">
                  <strong>Fam {patient.family_number || "—"}</strong>
                </div>
              </div>

              {/* Past Records */}
              {pastView === "list" && (
                <>
                  <div className="subhead">Past Records</div>
                  <div className="record-list">
                    {records.length === 0 && (
                      <div className="empty">No past records found.</div>
                    )}
                    {records.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedPast(r); setPastView("detail"); }}
                        className="record-item"
                      >
                        <div className="record-item__title">
                          {dateOnly(r.completed_at || r.visit_date || r.created_at)}
                        </div>
                        <div className="record-item__meta">
                          H: {r.height_cm ?? "—"} cm • W: {r.weight_kg ?? "—"} kg • BP: {r.blood_pressure ?? "—"} •
                          Temp: {r.temperature_c ?? "—"} °C • CC: {r.chief_complaint || "—"}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="actions actions--back">
                    <button
                      onClick={() => setMode("members")}
                      className="btn btn--primary"
                    >
                      Back
                    </button>
                  </div>
                </>
              )}

              {pastView === "detail" && selectedPast && (
                <PastDetail
                  rec={selectedPast}
                  patient={patient}
                  onBack={() => { setPastView("list"); setSelectedPast(null); }}
                  onViewChart={() => setPastView("chart")}
                  onViewDocs={() => setPastView("docs")}
                />
              )}

              {pastView === "chart" && selectedPast && (
                <PastChartViewLite
                  rec={selectedPast}
                  patient={patient}
                  onBack={() => setPastView("detail")}
                />
              )}

              {pastView === "docs" && selectedPast && (
                <PastDocumentsViewLite
                  rec={selectedPast}
                  onBack={() => setPastView("detail")}
                />
              )}
            </div>
          )}

          {mode === "new" && patient && (
            <div className="new-record">
              <h3 className="page-title page-title--sub">
                New Record for {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}
              </h3>

              <form onSubmit={submitNewRecord} className="form form--new-record">
                {/* ===== Card: Patient Record (summary + emergency fields) ===== */}
                <div className="card">
                  <div className="card__title">Patient Record</div>
                  <div className="row row--two">
                    <div className="field">
                      <label className="label">Patient Name:</label>
                      <input
                        className="input input--readonly"
                        readOnly
                        value={`${patient.first_name} ${patient.middle_name ? patient.middle_name + " " : ""}${patient.surname}`}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Family Number:</label>
                      <input
                        className="input input--readonly"
                        readOnly
                        value={patient.family_number || ""}
                      />
                    </div>
                  </div>

                  <div className="row row--two">
                    <div className="field">
                      <label className="label">Age:</label>
                      <input
                        className="input input--readonly"
                        readOnly
                        value={computedAge || ""}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Birthdate:</label>
                      <input
                        className="input input--readonly"
                        readOnly
                        value={dateOnly(patient.birthdate) || ""}
                      />
                    </div>
                  </div>

                  <div className="subsection">
                    <div className="subsection__title">In case of Emergency</div>
                    <div className="row row--two">
                      <TextField
                        label="Contact Person"
                        value={form.emergencyName}
                        onChange={(v)=>setField("emergencyName", v)}
                        placeholder="Enter full name"
                        error={errors.emergencyName}
                      />
                      <TextField
                        label="Relation"
                        value={form.emergencyRelation}
                        onChange={(v)=>setField("emergencyRelation", v)}
                        placeholder="e.g., Wife"
                        error={errors.emergencyRelation}
                      />
                    </div>
                    <DigitsField
                      label="Contact Number"
                      value={form.emergencyNumber}
                      onChange={(v)=>setField("emergencyNumber", v)}
                      exactLen={11}
                      placeholder="09123456789"
                      error={errors.emergencyNumber}
                    />
                  </div>
                </div>

                {/* ===== Card: Nurse’s Notes (stacked like screenshot) ===== */}
                <div className="card">
                  <div className="card__title">Nurse’s Notes</div>

                  <div className="stack">
                    <Field label="Height (cm)" value={form.heightCm} onChange={v => setField("heightCm", v)} mode="height" placeholder="e.g. 163.6" error={errors.heightCm} />
                    <Field label="Weight (kg)" value={form.weightKg} onChange={v => setField("weightKg", v)} mode="weight" placeholder="e.g. 53.72" error={errors.weightKg} />
                    <Field label="Blood Pressure" value={form.bloodPressure} onChange={v => setField("bloodPressure", v)} mode="bp" placeholder="e.g. 120/80" error={errors.bloodPressure} />
                    <Field label="Temperature (°C)" value={form.temperatureC} onChange={v => setField("temperatureC", v)} mode="temp" placeholder="e.g. 36.8" error={errors.temperatureC} />
                  </div>

                  <div className="field">
                    <label className="label">Chief Complaint:</label>
                    <textarea
                      className={`textarea ${errors.chiefComplaint ? 'has-error' : ''}`}
                      value={form.chiefComplaint}
                      onChange={e => setField("chiefComplaint", e.target.value)}
                    />
                    {errors.chiefComplaint && (
                      <div className="error-text">{errors.chiefComplaint}</div>
                    )}
                  </div>
                </div>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={form.proceedToQueue}
                    onChange={e => setField("proceedToQueue", e.target.checked)}
                  />
                  <span className="checkbox-label">Proceed to Queuing</span>
                </label>

                {errors._form && (
                  <div className="error-text">{errors._form}</div>
                )}

                {/* STICKY submit bar */}
                <div className="actions actions--sticky">
                  <button
                    onClick={() => setMode("patient")}
                    type="button"
                    className="btn btn--secondary"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !canSubmit}
                    className="btn btn--primary btn--full"
                  >
                    {saving ? "Saving..." : "Submit"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Small subviews for past record ---------- */

function PastDetail({ rec, patient, onBack, onViewChart, onViewDocs }) {
  return (
    <div className="past past--detail">
      <div className="past-head">
        <h3 className="subhead">{dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</h3>
        <button onClick={onBack} className="btn btn--light">Back</button>
      </div>

      <div className="past-meta">
        <div><strong>Patient Name:</strong> {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}</div>
        <div><strong>Doctor in Charge:</strong> {rec.doctor_full_name || "—"}</div>
        <div><strong>Date:</strong> {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</div>
      </div>

      <div className="past-actions">
        <button onClick={onViewChart} className="btn btn--accent-block">View Chart</button>
        <button onClick={onViewDocs} className="btn btn--accent-block">View Documents</button>
      </div>
    </div>
  );
}

function PastChartViewLite({ rec, patient, onBack }) {
  return (
    <div className="past past--chart">
      <div className="past-head">
        <h3 className="subhead">Chart – {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</h3>
        <button onClick={onBack} className="btn btn--light">Back</button>
      </div>

      <div className="grid grid--two">
        <div className="card">
          <div className="card__title">Nurse Vitals</div>
          <div>Height: {rec.height_cm ?? "—"} cm</div>
          <div>Weight: {rec.weight_kg ?? "—"} kg</div>
          <div>BP: {rec.blood_pressure ?? "—"}</div>
          <div>Temperature: {rec.temperature_c ?? "—"} °C</div>
          <div>Chief Complaint: {rec.chief_complaint || "—"}</div>
        </div>
        <div className="card">
          <div className="card__title">Doctor’s Notes</div>
          <div className="prewrap">{rec.doctor_notes || "—"}</div>
          <div className="muted small">Doctor: {rec.doctor_full_name || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function PastDocumentsViewLite({ rec, onBack }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true); setErr("");
        const { data, error } = await supabase
          .from("record_documents")
          .select("*")
          .eq("record_id", rec.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (mounted) setDocs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mounted) setErr(e.message || "Failed to load documents");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [rec.id]);

  return (
    <div className="past past--docs">
      <div className="past-head">
        <h3 className="subhead">Document Request</h3>
        <button onClick={onBack} className="btn btn--light">Back</button>
      </div>

      <div className="docs-panel">
        {loading && <div className="status status--loading">Loading…</div>}
        {err && <div className="error-text">{err}</div>}
        {!loading && !err && (
          <div className="docs-list">
            {docs.length === 0 && <div className="muted">No documents saved for this record.</div>}
            {docs.map(d => (
              <div key={d.id} className="doc-row">
                <div className="doc-row__title">
                  {d.type} <span className="doc-row__meta">• {new Date(d.created_at).toLocaleString()}</span>
                </div>
                <div className="doc-row__link">
                  {d.url ? <a className="link" href={d.url} target="_blank" rel="noreferrer">open file</a> : "no file URL"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Input helpers ---------- */

/* Vitals/BP/Temp input with decimal and slash handling (unchanged) */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  step,
  mode,            // "height" | "weight" | "bp" | "temp" | undefined
  error,
}) {
  const handleChange = (e) => {
    let raw = e.target.value ?? "";

    if (mode === "bp") {
      raw = raw.replace(/[^\d/]/g, "");
      const firstSlash = raw.indexOf("/");
      if (firstSlash !== -1) {
        raw = raw.slice(0, firstSlash + 1) + raw.slice(firstSlash + 1).replace(/\//g, "");
      }
      const [a = "", b = ""] = raw.split("/");
      const left = a.replace(/\D/g, "").slice(0, 4);
      const right = b.replace(/\D/g, "").slice(0, 4);
      raw = b === undefined ? left : `${left}/${right}`;
      onChange(raw);
      return;
    }

    const clampDecimal = (txt, maxDigitsTotal, maxDecimals) => {
      if (txt === ".") return "0.";
      txt = txt.replace(/[^0-9.]/g, "");
      const firstDot = txt.indexOf(".");
      if (firstDot !== -1) {
        txt = txt.slice(0, firstDot + 1) + txt.slice(firstDot + 1).replace(/\./g, "");
      }
      if (firstDot !== -1) {
        let [intPart, decPartRaw] = txt.split(".");
        if (intPart === "") intPart = "0";
        const trailingDotOnly = decPartRaw === "" || decPartRaw == null;
        let decPart = (decPartRaw ?? "").slice(0, maxDecimals);

        let totalDigits = (intPart + decPart).length;
        if (totalDigits > maxDigitsTotal) {
          const overflow = totalDigits - maxDigitsTotal;
          if (decPart.length >= overflow) {
            decPart = decPart.slice(0, decPart.length - overflow);
          } else {
            const still = overflow - decPart.length;
            decPart = "";
            intPart = intPart.slice(0, Math.max(0, intPart.length - still));
          }
        }
        if (trailingDotOnly) return `${intPart}.`;
        return decPart.length ? `${intPart}.${decPart}` : intPart;
      } else {
        const digits = txt.replace(/\D/g, "");
        if (digits.length > maxDigitsTotal) return digits.slice(0, maxDigitsTotal);
        return digits;
      }
    };

    if (mode === "height") { onChange(clampDecimal(raw, 5, 1)); return; }
    if (mode === "weight") { onChange(clampDecimal(raw, 4, 2)); return; }
    if (mode === "temp")   { onChange(clampDecimal(raw, 4, 2)); return; }

    onChange(raw);
  };

  const inputMode =
    mode === "bp" ? "numeric" :
    (mode ? "decimal" : undefined);

  return (
    <div className="field">
      <label className="label">{label}:</label>
      <input
        className={`input ${error ? 'has-error' : ''}`}
        value={value}
        onChange={handleChange}
        type={mode ? "text" : type}
        inputMode={inputMode}
        step={step}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

/* Simple text field (letters/spaces are validated in validate()) */
function TextField({ label, value, onChange, placeholder, error }) {
  return (
    <div className="field">
      <label className="label">{label}:</label>
      <input
        className={`input ${error ? 'has-error' : ''}`}
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
      />
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

/* Digits-only field with exact length (for the 11-digit emergency number) */
function DigitsField({ label, value, onChange, exactLen = 11, placeholder, error }) {
  const handle = (e) => {
    const digits = (e.target.value || "").replace(/\D/g, "").slice(0, exactLen);
    onChange(digits);
  };
  const showLenError = value && String(value).length > 0 && String(value).length !== exactLen;
  return (
    <div className="field">
      <label className="label">{label}:</label>
      <input
        className={`input ${(error || showLenError) ? 'has-error' : ''}`}
        value={value}
        onChange={handle}
        inputMode="numeric"
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={exactLen}
        title={`Must be exactly ${exactLen} digits`}
      />
      {(error || showLenError) && (
        <div className="error-text">{error || `Must be exactly ${exactLen} digits.`}</div>
      )}
    </div>
  );
}
