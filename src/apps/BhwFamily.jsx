// src/apps/BhwFamily.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { dateOnly } from "../lib/utils";
import { supabase } from "../lib/supabase";

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
    <div className="min-h-screen p-6">
      {/* top bar: back and logout */}
      <div className="flex items-center justify-between mb-4">
        <Link to="/bhw" className="text-sm underline">← Back to Records</Link>
        <button onClick={logout} className="text-sm underline">Log Out</button>
      </div>

      <h2 className="text-center text-orange-600 font-semibold mb-4">
        Family: {familyNumber}
      </h2>

      {loading && <div className="text-center text-sm">Loading…</div>}
      {err && <div className="text-center text-sm text-red-600">{err}</div>}

      {!loading && !err && (
        <>
          {mode === "members" && (
            <div className="w-full space-y-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openPatient(m.id)}
                  className="block mx-auto w-[420px] sm:w-[460px] border border-gray-600 rounded px-3 py-2 hover:bg-orange-50 text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <span className="font-semibold">
                        {m.first_name} {m.middle_name ? `${m.middle_name} ` : ""}{m.surname}
                      </span>
                      <span className="text-xs text-gray-600">
                        {" "}• {m.sex} • {m.age} Years Old
                      </span>
                    </div>
                    <div className="text-xs text-gray-700">{dateOnly(m.birthdate)}</div>
                  </div>
                </button>
              ))}

              {members.length === 0 && (
                <div className="text-center text-sm text-gray-500">No members found.</div>
              )}
            </div>
          )}

          {mode === "patient" && patient && (
            <div className="max-w-5xl mx-auto">
              {/* header with + New Record */}
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">
                  {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}
                </div>
                <button
                  onClick={() => { setMode("new"); setErrors({}); setErr(""); }}
                  className="px-3 py-1 rounded bg-green-200 hover:bg-green-300 text-sm"
                >
                  + New Record
                </button>
              </div>

              <div className="text-sm space-y-1 mb-4">
                <div><strong>Family Number:</strong> {patient.family_number}</div>
                <div><strong>Sex:</strong> {patient.sex || "-"}</div>
                <div className="text-sm"><span className="font-semibold">Birthdate:</span> {dateOnly(patient.birthdate)}</div>
                <div><strong>Age:</strong> {computedAge || "-"}</div>
                <div><strong>Contacts:</strong> {patient.contact_number || "-"}</div>
              </div>

              {/* ---------- Past Records (clickable) ---------- */}
              {pastView === "list" && (
                <>
                  <div className="text-sm font-semibold mb-1">Past Records</div>
                  <div className="space-y-2">
                    {records.length === 0 && (
                      <div className="text-gray-500 text-sm">No past records found.</div>
                    )}
                    {records.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedPast(r); setPastView("detail"); }}
                        className="w-full text-left border rounded px-3 py-2 hover:bg-orange-50"
                      >
                        <div className="font-medium">
                          {dateOnly(r.completed_at || r.visit_date || r.created_at)}
                        </div>
                        <div className="text-xs text-gray-600">
                          H: {r.height_cm ?? "—"} cm • W: {r.weight_kg ?? "—"} kg • BP: {r.blood_pressure ?? "—"} •
                          Temp: {r.temperature_c ?? "—"} °C • CC: {r.chief_complaint || "—"}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={() => setMode("members")}
                      className="px-4 py-2 rounded bg-orange-500 text-white hover:bg-orange-600"
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
            <div className="max-w-4xl mx-auto">
              <h3 className="text-center text-2xl font-semibold mb-4">
                New Record for {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}
              </h3>

              <form onSubmit={submitNewRecord} className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                {/* Prefilled read-only fields */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">Patient Name:</label>
                    <input className="w-full border rounded px-3 py-2 bg-gray-100" readOnly
                      value={`${patient.first_name} ${patient.middle_name ? patient.middle_name + " " : ""}${patient.surname}`} />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Family Number:</label>
                    <input className="w-full border rounded px-3 py-2 bg-gray-100" readOnly
                      value={patient.family_number || ""} />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm mb-1">Age:</label>
                  <input className="w-full md:w-1/3 border rounded px-3 py-2 bg-gray-100" readOnly
                    value={computedAge || ""} />
                </div>

                <hr className="my-4 border-orange-200" />

                {/* Editable vitals */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Height (cm)" value={form.heightCm} onChange={v => setField("heightCm", v)} digitsOnly error={errors.heightCm} />
                  <Field label="Weight (kg)" value={form.weightKg} onChange={v => setField("weightKg", v)} oneDecimal placeholder="e.g. 42.7" error={errors.weightKg} />
                </div>
                <div className="grid md:grid-cols-2 gap-4 mt-3">
                  <Field label="Blood Pressure" value={form.bloodPressure} onChange={v => setField("bloodPressure", v)} placeholder="e.g. 120/80" error={errors.bloodPressure} />
                  <Field label="Temperature (°C)" value={form.temperatureC} onChange={v => setField("temperatureC", v)} oneDecimal placeholder="e.g. 37.5" error={errors.temperatureC} />
                </div>
                <div className="mt-3">
                  <label className="block text-sm mb-1">Chief Complaint:</label>
                  <textarea className={`w-full border rounded px-3 py-2 min-h-[120px] bg-white ${errors.chiefComplaint ? 'border-red-400' : ''}`}
                    value={form.chiefComplaint} onChange={e => setField("chiefComplaint", e.target.value)} />
                  {errors.chiefComplaint && (
                    <div className="text-xs text-red-600 mt-1">{errors.chiefComplaint}</div>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm mt-2">
                  <input type="checkbox" className="accent-orange-500"
                    checked={form.proceedToQueue}
                    onChange={e => setField("proceedToQueue", e.target.checked)} />
                  Proceed to Queuing
                </label>

                {errors._form && (
                  <div className="mt-3 text-sm text-red-700">{errors._form}</div>
                )}

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setMode("patient")}
                    type="button"
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !canSubmit}
                    className="px-4 py-2 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60"
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
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</h3>
        <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">Back</button>
      </div>

      <div className="mt-3 text-sm space-y-1">
        <div><strong>Patient Name:</strong> {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}</div>
        <div><strong>Doctor in Charge:</strong> {rec.doctor_full_name || "—"}</div>
        <div><strong>Date:</strong> {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</div>
      </div>

      <div className="mt-6 space-y-3">
        <button onClick={onViewChart} className="w-full rounded py-2 bg-orange-300 text-white hover:bg-orange-400">View Chart</button>
        <button onClick={onViewDocs} className="w-full rounded py-2 bg-orange-300 text-white hover:bg-orange-400">View Documents</button>
      </div>
    </div>
  );
}

function PastChartViewLite({ rec, patient, onBack }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Chart – {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</h3>
        <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">Back</button>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
        <div className="border rounded p-3 bg-white">
          <div className="font-semibold mb-2">Nurse Vitals</div>
          <div>Height: {rec.height_cm ?? "—"} cm</div>
          <div>Weight: {rec.weight_kg ?? "—"} kg</div>
          <div>BP: {rec.blood_pressure ?? "—"}</div>
          <div>Temperature: {rec.temperature_c ?? "—"} °C</div>
          <div>Chief Complaint: {rec.chief_complaint || "—"}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="font-semibold mb-2">Doctor’s Notes</div>
          <div className="whitespace-pre-wrap">{rec.doctor_notes || "—"}</div>
          <div className="mt-2 text-xs text-gray-600">Doctor: {rec.doctor_full_name || "—"}</div>
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
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Document Request</h3>
        <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">Back</button>
      </div>

      <div className="mt-3 border rounded p-4 bg-orange-50">
        {loading && <div className="text-sm text-gray-600">Loading…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!loading && !err && (
          <div className="space-y-3">
            {docs.length === 0 && <div className="text-sm text-gray-600">No documents saved for this record.</div>}
            {docs.map(d => (
              <div key={d.id} className="border rounded px-3 py-2 bg-white flex items-center justify-between">
                <div className="font-semibold uppercase">
                  {d.type} <span className="normal-case text-gray-600 text-xs">• {new Date(d.created_at).toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-600">
                  {d.url ? <a className="underline" href={d.url} target="_blank" rel="noreferrer">open file</a> : "no file URL"}
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
    <div>
      <label className="block text-sm mb-1">{label}:</label>
      <input
        className={`w-full border rounded px-3 py-2 bg-white ${error ? 'border-red-400' : ''}`}
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
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
