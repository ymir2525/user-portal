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

  // ---------- NEW: past-record subviews ----------
  // When user clicks a row in “Past Records”, we open a tiny sub-router.
  const [pastView, setPastView] = useState("list"); // 'list' | 'detail' | 'chart' | 'docs'
  const [selectedPast, setSelectedPast] = useState(null);

  // New-record form state
  const [form, setForm] = useState({
    heightCm: "", weightKg: "", bloodPressure: "", temperatureC: "",
    chiefComplaint: "", proceedToQueue: false
  });
  const setField = (k, v) => {
    setForm(s => ({ ...s, [k]: v }));
    setErrors(prev => ({ ...prev, [k]: undefined, _form: undefined }));
    setErr("");
  };

  // === validation helpers ===
  const validate = useCallback((f) => {
    const errs = {};
    const trimmedCC = (f.chiefComplaint || "").trim();

    // All fields required before adding a new record
    if (!f.heightCm) errs.heightCm = "Required.";
    if (!f.weightKg) errs.weightKg = "Required.";
    if (!f.bloodPressure) errs.bloodPressure = "Required.";
    if (!f.temperatureC) errs.temperatureC = "Required.";
    if (!trimmedCC) errs.chiefComplaint = "Required.";

    const numIn = (v) => (v === "" || v == null ? null : Number(v));
    const h = numIn(f.heightCm);
    const w = numIn(f.weightKg);
    const t = numIn(f.temperatureC);

    const oneDec = /^\d+(\.\d)?$/;

    if (h == null || isNaN(h)) errs.heightCm = errs.heightCm || "Invalid number.";
    if (w == null || isNaN(w)) errs.weightKg = errs.weightKg || "Invalid number.";
    if (t == null || isNaN(t)) errs.temperatureC = errs.temperatureC || "Invalid number.";

    if (h != null && (h < 30 || h > 300)) errs.heightCm = "Height must be 30–300 cm.";

    if (f.weightKg && !oneDec.test(f.weightKg)) errs.weightKg = "Use at most 1 decimal (e.g., 42.7).";
    if (w != null && (w <= 0 || w > 500)) errs.weightKg = "Weight must be 1–500 kg.";

    if (f.temperatureC && !oneDec.test(f.temperatureC)) errs.temperatureC = "Use at most 1 decimal (e.g., 37.5).";
    if (t != null && (t < 30 || t > 45)) errs.temperatureC = "Temperature must be 30–45 °C.";

    if (f.bloodPressure) {
      const m = f.bloodPressure.trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})(\s*(mmHg)?)?$/i);
      if (!m) {
        errs.bloodPressure = errs.bloodPressure || "BP must be like 120/80.";
      } else {
        const sys = Number(m[1]), dia = Number(m[2]);
        if (sys < dia) errs.bloodPressure = "Systolic should be ≥ diastolic.";
        if (sys < 70 || sys > 260 || dia < 40 || dia > 160)
          errs.bloodPressure = "BP values look out of range.";
      }
    }

    if (trimmedCC.length > 1000)
      errs.chiefComplaint = "Keep under 1000 characters.";

    if (Object.keys(errs).length) errs._form = "Please fill in all fields correctly before submitting.";
    return errs;
  }, []);

  const canSubmit = useMemo(() => Object.keys(validate(form)).length === 0, [form, validate]);

  // Role guard + initial family load
  useEffect(() => {
    let mounted = true;
    (async () => {
      // auth guard
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

        // load family members from patients table
        const { data, error } = await supabase
          .from("patients")
          .select("*")
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

      const num = (v) => (v === "" || v == null ? null : Number(v));
      const payload = {
        patient_id: patient.id,
        height_cm: num(form.heightCm),
        weight_kg: num(form.weightKg),
        blood_pressure: form.bloodPressure || null,
        temperature_c: num(form.temperatureC),
        chief_complaint: (form.chiefComplaint || "").trim() || null,
        queued: !!form.proceedToQueue,
      };

      const { data, error } = await supabase
        .from("patient_records")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // reload past records quickly
      const { data: recs } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false });

      setRecords(Array.isArray(recs) ? recs : []);

      setForm({
        heightCm: "", weightKg: "", bloodPressure: "", temperatureC: "",
        chiefComplaint: "", proceedToQueue: false
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

  // Helper: compute age if missing, from birthdate
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

  return (
    <div className="family-page"> {/* CSS: page wrapper for spacing */}
      {/* top bar: back and logout */}
      <div className="topbar">
        <Link to="/bhw" className="link link--small">← Back to Records</Link>
        <button onClick={logout} className="link link--small">Log Out</button>
      </div>

      <h2 className="page-title page-title--family">
        {/* CSS NAME of this title: .page-title--family */}
        Family: {familyNumber}
      </h2>

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
                  /* CSS NAME: .member-card (clickable row button) */
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
                  {/* CSS NAME for this button: .btn--accent */}
                  + New Record
                </button>
              </div>

              <div className="patient-meta">
                <div><strong>Family Number:</strong> {patient.family_number}</div>
                <div><strong>Sex:</strong> {patient.sex || "-"}</div>
                <div><strong>Birthdate:</strong> {dateOnly(patient.birthdate)}</div>
                <div><strong>Age:</strong> {computedAge || "-"}</div>
                <div><strong>Contacts:</strong> {patient.contact_number || "-"}</div>
              </div>

              {/* ---------- Past Records (clickable) ---------- */}
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
                        /* CSS NAME: .record-item (row button) */
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

              {/* ---------- Past Record: Detail menu ---------- */}
              {pastView === "detail" && selectedPast && (
                <PastDetail
                  rec={selectedPast}
                  patient={patient}
                  onBack={() => { setPastView("list"); setSelectedPast(null); }}
                  onViewChart={() => setPastView("chart")}
                  onViewDocs={() => setPastView("docs")}
                />
              )}

              {/* ---------- Past Record: Chart view ---------- */}
              {pastView === "chart" && selectedPast && (
                <PastChartViewLite
                  rec={selectedPast}
                  patient={patient}
                  onBack={() => setPastView("detail")}
                />
              )}

              {/* ---------- Past Record: Documents view ---------- */}
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
                {/* Prefilled read-only fields */}
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

                <div className="field field--compact">
                  <label className="label">Age:</label>
                  <input
                    className="input input--readonly input--one-third"
                    readOnly
                    value={computedAge || ""}
                  />
                </div>

                <div className="separator" />

                {/* Editable vitals */}
                <div className="row row--two">
                  <Field label="Height (cm)" value={form.heightCm} onChange={v => setField("heightCm", v)} digitsOnly error={errors.heightCm} />
                  <Field label="Weight (kg)" value={form.weightKg} onChange={v => setField("weightKg", v)} oneDecimal placeholder="e.g. 42.7" error={errors.weightKg} />
                </div>
                <div className="row row--two">
                  <Field label="Blood Pressure" value={form.bloodPressure} onChange={v => setField("bloodPressure", v)} placeholder="e.g. 120/80" error={errors.bloodPressure} />
                  <Field label="Temperature (°C)" value={form.temperatureC} onChange={v => setField("temperatureC", v)} oneDecimal placeholder="e.g. 37.5" error={errors.temperatureC} />
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

                <div className="actions">
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
                    className="btn btn--primary"
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

/* Small input helper (with digits-only support + one-decimal support + error display) */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  step,
  digitsOnly = false,   // integers only
  oneDecimal = false,   // allow at most 1 decimal
  error,
}) {
  const handleChange = (e) => {
    let raw = e.target.value;
    if (digitsOnly) {
      const next = raw.replace(/\D+/g, "");
      onChange(next);
      return;
    }
    if (oneDecimal) {
      let txt = raw.replace(/[^0-9.]/g, "");
      const firstDot = txt.indexOf(".");
      if (firstDot !== -1) {
        txt = txt.slice(0, firstDot + 1) + txt.slice(firstDot + 1).replace(/\./g, "");
      }
      if (txt.startsWith(".")) txt = "0" + txt;
      const parts = txt.split(".");
      if (parts.length === 2) {
        txt = parts[0] + "." + parts[1].slice(0, 1);
      }
      onChange(txt);
      return;
    }
    onChange(raw);
  };

  return (
    <div className="field">
      <label className="label">{label}:</label>
      <input
        className={`input ${error ? 'has-error' : ''}`}
        value={value}
        onChange={handleChange}
        type={(digitsOnly || oneDecimal) ? "text" : type}
        inputMode={oneDecimal ? "decimal" : (digitsOnly ? "numeric" : undefined)}
        pattern={oneDecimal ? "^\\d+(\\.\\d)?$" : (digitsOnly ? "[0-9]*" : undefined)}
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
