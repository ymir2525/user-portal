import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { dateOnly } from "../lib/utils";
import { supabase } from "../lib/supabase";
import "./BhwFamily.css";

/* Consistent name formatter with middle name + extension */
const formatPersonName = (p = {}) => {
  const first = p.first_name || "";
  const middle = p.middle_name ? `${p.middle_name} ` : "";
  const sur = p.surname || "";
  const ext = p.name_extension || p.extension || "";
  const extPart = ext ? `, ${ext}` : "";
  return `${first} ${middle}${sur}${extPart}`.trim();
};

export default function BhwFamily() {
  const { familyNumber } = useParams();
  const nav = useNavigate();

  const [mode, setMode] = useState("members"); // "members" | "patient"
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
  const [pastView, setPastView] = useState("list"); // 'list' | 'combined'
  const [selectedPast, setSelectedPast] = useState(null);

  // Helper: Manila "today" (YYYY-MM-DD)
  const manilaTodayDate = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year").value;
    const m = parts.find((p) => p.type === "month").value;
    const d = parts.find((p) => p.type === "day").value;
    return `${y}-${m}-${d}`;
  };

  // New-record form state (emergency fields removed from user input)
  const [form, setForm] = useState({
    heightCm: "",
    weightKg: "",
    bloodPressure: "",
    temperatureC: "",
    chiefComplaint: "",
    proceedToQueue: true,
  });

  // === validation (nurse rules for vitals + CC only) ===
  const validate = useCallback((f) => {
    const errs = {};
    const trimmedCC = (f.chiefComplaint || "").trim();

    // helpers
    const toNum = (v) => (v === "" || v == null ? null : Number(v));
    const onlyDigits = (s) => (s || "").replace(/\D/g, "");

    // required vitals
    if (!f.heightCm) errs.heightCm = "Required.";
    if (!f.weightKg) errs.weightKg = "Required.";
    if (!f.bloodPressure) errs.bloodPressure = "Required.";
    if (!f.temperatureC) errs.temperatureC = "Required.";
    if (!trimmedCC) errs.chiefComplaint = "Required.";

    // Height: up to 5 digits total; 1 decimal
    if (f.heightCm) {
      const hTxt = String(f.heightCm);
      const hDigits = onlyDigits(hTxt);
      const hasOneDot = (hTxt.match(/\./g) || []).length <= 1;
      const decOk = /^\d+(\.\d)?$/.test(hTxt) || /^\d+\.$/.test(hTxt);
      if (hDigits.length === 0 || hDigits.length > 5 || !hasOneDot || !decOk) {
        errs.heightCm = "Up to 5 digits, 1 decimal (e.g., 163.6).";
      }
      const h = toNum(hTxt.endsWith(".") ? hTxt.slice(0, -1) : hTxt);
      if (h == null || isNaN(h)) errs.heightCm = errs.heightCm || "Invalid number.";
      else if (h < 30 || h > 300) errs.heightCm = "30–300 cm.";
    }

    // Weight: up to 4 digits total; up to 2 decimals
    if (f.weightKg) {
      const wTxt = String(f.weightKg);
      const wDigits = onlyDigits(wTxt);
      const hasOneDot = (wTxt.match(/\./g) || []).length <= 1;
      const decOk = /^\d+(\.\d{0,2})?$/.test(wTxt) || /^\d+\.$/.test(wTxt);
      if (wDigits.length === 0 || wDigits.length > 4 || !hasOneDot || !decOk) {
        errs.weightKg = "Up to 4 digits; up to 2 decimals (e.g., 53.72).";
      }
      const w = toNum(wTxt.endsWith(".") ? wTxt.slice(0, -1) : wTxt);
      if (w == null || isNaN(w)) errs.weightKg = errs.weightKg || "Invalid number.";
      else if (w <= 0 || w > 500) errs.weightKg = "1–500 kg.";
    }

    // Blood pressure
    if (f.bloodPressure) {
      const bp = String(f.bloodPressure).trim();
      const m = bp.match(/^(\d{1,4})\/(\d{1,4})$/);
      if (!m) {
        errs.bloodPressure = "Use 120/80 format.";
      } else {
        const left = m[1], right = m[2];
        if (left.length >= 4 || right.length >= 4) {
          errs.bloodPressure = "4 digits is invalid for BP.";
        } else {
          const sys = Number(left), dia = Number(right);
          if (isNaN(sys) || isNaN(dia)) errs.bloodPressure = "Numbers only.";
          else if (sys < dia) errs.bloodPressure = "Systolic ≥ diastolic.";
          if (!errs.bloodPressure && (sys < 70 || sys > 260 || dia < 40 || dia > 160)) {
            errs.bloodPressure = "Out of range.";
          }
        }
      }
    }

    // Temperature
    if (f.temperatureC) {
      const tTxt = String(f.temperatureC);
      const tDigits = (tTxt || "").replace(/\D/g, "");
      const hasOneDot = (tTxt.match(/\./g) || []).length <= 1;
      const decOk = /^\d+(\.\d{0,2})?$/.test(tTxt) || /^\d+\.$/.test(tTxt);
      if (tDigits.length === 0 || tDigits.length > 4 || !hasOneDot || !decOk) {
        errs.temperatureC = "Up to 4 digits; up to 2 decimals.";
      }
      const t = Number(tTxt.endsWith(".") ? tTxt.slice(0, -1) : tTxt);
      if (t == null || isNaN(t)) errs.temperatureC = errs.temperatureC || "Invalid number.";
      else if (t < 30 || t > 45) errs.temperatureC = "30–45 °C.";
    }

    if (trimmedCC.length > 1000) errs.chiefComplaint = "Max 1000 chars.";

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
      if (!uid) {
        nav("/login", { replace: true });
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();

      if (profErr || !prof || String(prof.role).toUpperCase() !== "BHW") {
        await supabase.auth.signOut().catch(() => {});
        nav("/login", { replace: true });
        return;
      }

      try {
        setLoading(true);
        setErr("");
        const { data, error } = await supabase
          .from("patients")
          // include name_extension so we can render Jr/Sr/III
          .select(
            "id, first_name, middle_name, surname, name_extension, sex, age, birthdate, family_number, created_at, contact_number, contact_person, emergency_contact_name, emergency_relation, address"
          )
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
    return () => {
      mounted = false;
    };
  }, [familyNumber, nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    nav("/login", { replace: true });
  };

  // Load one patient + past records
  const openPatient = async (patientId) => {
    try {
      setLoading(true);
      setErr("");

      const [{ data: p, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
        // explicitly include name_extension
        supabase.from("patients").select("*, name_extension").eq("id", patientId).single(),
        supabase.from("patient_records").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;

      setPatient(p);
      setRecords(Array.isArray(recs) ? recs : []);
      setMode("patient");
      setPastView("list");
      setSelectedPast(null);

      setErrors({});
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load patient");
    } finally {
      setLoading(false);
    }
  };

  // Submit new record
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

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id || null;

      const num = (v) => (v === "" || v == null ? null : Number(v));
      const trim = (s) => (s || "").trim();

      const payload = {
        patient_id: patient.id,

        height_cm: num(form.heightCm.endsWith(".") ? form.heightCm.slice(0, -1) : form.heightCm),
        weight_kg: num(form.weightKg.endsWith(".") ? form.weightKg.slice(0, -1) : form.weightKg),
        blood_pressure: trim(form.bloodPressure) || null,
        temperature_c: num(form.temperatureC.endsWith(".") ? form.temperatureC.slice(0, -1) : form.temperatureC),
        chief_complaint: trim(form.chiefComplaint) || null,

        // Emergency snapshot (READ-ONLY in modal)
        emergency_contact_name: patient.emergency_contact_name || null,
        emergency_relation: patient.emergency_relation || null,
        emergency_contact_number: patient.contact_person || null,

        address: patient.address || null, // snapshot
        visit_date: manilaTodayDate(),
        queued: true,
        status: "queued",
        queued_at: new Date().toISOString(),
        created_by: uid,
      };

      const { error } = await supabase.from("patient_records").insert(payload).select().single();
      if (error) throw error;

      // flag the patient as queued
      if (form.proceedToQueue) {
        await supabase.from("patients").update({ queued: true, queued_at: new Date().toISOString() }).eq("id", patient.id);
      }

      // reload past records
      const { data: recs } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false });

      setRecords(Array.isArray(recs) ? recs : []);

      // reset modal + errors
      setIsModalOpen(false);
      setErrors({});
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

  // modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* top bar */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between border-b border-slate-200">
        <Link to="/bhw" className="text-indigo-700 hover:text-indigo-900 text-sm font-medium">
          ← Back to Records
        </Link>
        <h2 className="text-teal-700 font-semibold">Family: {familyNumber}</h2>
        <button
          onClick={async () => {
            await supabase.auth.signOut().catch(() => {});
            nav("/login", { replace: true });
          }}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Log Out
        </button>
      </div>

      {/* page body */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        {loading && <div className="text-center text-sm text-slate-700">Loading…</div>}
        {err && <div className="text-center text-sm text-red-600">{err}</div>}

        {!loading && !err && (
          <>
            {mode === "members" && (
              <div className="flex flex-col gap-3 items-center">
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openPatient(m.id)}
                    className="w-full max-w-2xl rounded-lg border border-slate-300 bg-white px-4 py-3 text-left hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{formatPersonName(m)}</div>
                        <div className="text-xs text-slate-500">• {m.sex} • {m.age} Years Old</div>
                      </div>
                      <div className="text-xs text-slate-600">{dateOnly(m.birthdate)}</div>
                    </div>
                  </button>
                ))}

                {members.length === 0 && (
                  <div className="text-center text-sm text-slate-500 mt-3">No members found.</div>
                )}
              </div>
            )}

            {mode === "patient" && patient && (
              <div className="max-w-5xl mx-auto">
                {/* header with + New Record */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="text-lg font-semibold">{formatPersonName(patient)}</div>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center rounded-lg border border-teal-600 text-teal-700 px-3 py-2 text-sm font-semibold hover:bg-teal-50"
                  >
                    + New Record
                  </button>
                </div>

                {/* meta */}
                <div className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
                  <div>
                    <span className="font-semibold">Birthdate:</span> {dateOnly(patient.birthdate) || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Age:</span> {computedAge || "—"} yrs old
                  </div>
                  <div>
                    <span className="font-semibold">Sex:</span> {patient.sex || "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Contact Number:</span> {patient.contact_number || "—"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold">Contact Person:</span> {patient.emergency_contact_name || "—"}{" "}
                    | <span className="font-semibold">Contact Number:</span> {patient.contact_person || "—"}{" "}
                    | <span className="font-semibold">Relation:</span> {patient.emergency_relation || "—"}
                  </div>
                  <div className="sm:col-span-3">
                    <span className="font-semibold">Address:</span> {patient.address || "—"}
                  </div>
                  <div className="justify-self-end font-semibold">Fam {patient.family_number || "—"}</div>
                </div>

                {/* Past Records */}
                {pastView === "list" && (
                  <>
                    <div className="text-sm font-semibold mb-2">Past Records</div>
                    <div className="flex flex-col gap-2">
                      {records.length === 0 && <div className="text-sm text-slate-500">No past records found.</div>}
                      {records.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSelectedPast(r);
                            setPastView("combined");
                          }}
                          className="w-full text-left rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
                        >
                          <div className="font-bold text-base">
                            {dateOnly(r.completed_at || r.visit_date || r.created_at)}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            H: {r.height_cm ?? "—"} cm • W: {r.weight_kg ?? "—"} kg • BP: {r.blood_pressure ?? "—"} •
                            Temp: {r.temperature_c ?? "—"} °C • CC: {r.chief_complaint || "—"}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="mt-4">
                      <button
                        onClick={() => setMode("members")}
                        className="inline-flex items-center rounded-md bg-teal-600 text-white px-4 py-2 text-sm font-semibold hover:bg-teal-700"
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}

                {pastView === "combined" && selectedPast && (
                  <PastCombinedView
                    rec={selectedPast}
                    patient={patient}
                    onBack={() => {
                      setPastView("list");
                      setSelectedPast(null);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* NEW RECORD MODAL */}
      {isModalOpen && (
        <Modal onClose={() => setIsModalOpen(false)} title={`New Record — ${formatPersonName(patient ?? {})}`}>
          <form onSubmit={submitNewRecord} className="space-y-5">
            {/* Patient summary */}
            <div className="grid sm:grid-cols-2 gap-4">
              <ReadOnly label="Patient Name" value={formatPersonName(patient)} />
              <ReadOnly label="Family Number" value={patient.family_number || ""} />
              <ReadOnly label="Age" value={computedAge || ""} />
              <ReadOnly label="Birthdate" value={dateOnly(patient.birthdate) || ""} />
              <div className="sm:col-span-2">
                <ReadOnly label="Address" value={patient.address || "—"} />
              </div>
            </div>

            {/* Emergency — READ-ONLY */}
            <div>
              <div className="text-sm font-semibold mb-2">In case of Emergency</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <ReadOnly label="Contact Person" value={patient.emergency_contact_name || "—"} />
                <ReadOnly label="Relation" value={patient.emergency_relation || "—"} />
              </div>
              <ReadOnly label="Contact Number" value={patient.contact_person || "—"} />
              <p className="text-xs text-slate-500 mt-1">Manage emergency details from Patient Registration. They’re snapshotted here on save.</p>
            </div>

            {/* Nurse’s Notes */}
            <div>
              <div className="text-sm font-semibold mb-2">Nurse’s Notes</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Height (cm)" value={form.heightCm} onChange={(v) => setField("heightCm", v)} mode="height" placeholder="e.g. 163.6" error={errors.heightCm} />
                <Field label="Weight (kg)" value={form.weightKg} onChange={(v) => setField("weightKg", v)} mode="weight" placeholder="e.g. 53.72" error={errors.weightKg} />
                <Field label="Blood Pressure" value={form.bloodPressure} onChange={(v) => setField("bloodPressure", v)} mode="bp" placeholder="e.g. 120/80" error={errors.bloodPressure} />
                <Field label="Temperature (°C)" value={form.temperatureC} onChange={(v) => setField("temperatureC", v)} mode="temp" placeholder="e.g. 36.8" error={errors.temperatureC} />
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Chief Complaint</label>
                <textarea
                  className={`w-full rounded-md border px-3 py-2 text-sm ${errors.chiefComplaint ? "border-red-400" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-teal-500`}
                  value={form.chiefComplaint}
                  onChange={(e) => setField("chiefComplaint", e.target.value)}
                  rows={4}
                />
                {errors.chiefComplaint && <p className="text-xs text-red-600 mt-1">{errors.chiefComplaint}</p>}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                checked={form.proceedToQueue}
                onChange={(e) => setField("proceedToQueue", e.target.checked)}
              />
              Proceed to Queuing
            </label>

            {errors._form && <div className="text-sm text-red-600">{errors._form}</div>}

            <div className="sticky bottom-0 pt-3 border-t bg-white flex flex-col-reverse sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !canSubmit}
                className="inline-flex items-center rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-teal-300"
              >
                {saving ? "Saving…" : "Submit"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Past Combined View (Tailwind) ---------- */
function PastCombinedView({ rec, patient, onBack }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
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
    return () => {
      mounted = false;
    };
  }, [rec.id]);

  const printNow = () => window.print();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-base font-semibold">Patient Record — {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</h3>
        <div className="flex gap-2">
          <button onClick={onBack} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back
          </button>
          <button onClick={printNow} className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Download Chart
          </button>
        </div>
      </div>

      {/* Patient header */}
      <div className="mt-3 rounded-lg border border-slate-200 p-4">
        <div className="font-semibold">{formatPersonName(patient)}</div>
        <div className="text-xs text-slate-600 mt-1">
          Birthdate: {dateOnly(patient.birthdate) || "—"} • Age:{" "}
          {(() => {
            const bd = patient?.birthdate ? new Date(patient.birthdate) : null;
            if (!bd || isNaN(bd)) return patient?.age ?? "—";
            const t = new Date();
            let a = t.getFullYear() - bd.getFullYear();
            const m = t.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && t.getDate() < bd.getDate())) a--;
            return a;
          })()}{" "}
          • Sex: {patient.sex || "—"}
        </div>
        <div className="text-xs text-slate-600">Contact Number: {patient.contact_number || "—"}</div>
        <div className="text-xs text-slate-600">Address: {rec.address ?? patient.address ?? "—"}</div>
        <div className="text-xs text-slate-600">
          <span className="font-semibold">Contact Person:</span> {patient.emergency_contact_name || "—"} |<span className="font-semibold"> Contact Number:</span> {patient.contact_person || "—"} |<span className="font-semibold"> Relation:</span> {patient.emergency_relation || "—"}
        </div>
      </div>

      {/* Chart */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="font-semibold mb-2">Doctor’s Notes</div>
          <div className="whitespace-pre-wrap text-sm">{rec.doctor_notes || "—"}</div>
          <div className="text-xs text-slate-500 mt-2">Doctor: {rec.doctor_full_name || "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="font-semibold mb-2">Nurse’s Notes</div>
          <div className="text-sm">Height: {rec.height_cm ?? "—"} cm</div>
          <div className="text-sm">Weight: {rec.weight_kg ?? "—"} kg</div>
          <div className="text-sm">BP: {rec.blood_pressure ?? "—"}</div>
          <div className="text-sm">Temperature: {rec.temperature_c ?? "—"} °C</div>
          <div className="text-sm">Chief Complaint: {rec.chief_complaint || "—"}</div>
        </div>
      </div>

      {/* Docs */}
      <div className="mt-4 rounded-lg border border-slate-200 p-4">
        <div className="font-semibold mb-2">Document Requests</div>
        {loading && <div className="text-sm text-slate-600">Loading…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}
        {!loading && !err && (
          <div className="flex flex-col gap-2">
            {docs.length === 0 && <div className="text-sm text-slate-500">No documents saved for this record.</div>}
            {docs.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex items-center justify-between flex-wrap gap-2">
                <div className="font-semibold uppercase">
                  {d.type} <span className="normal-case text-slate-500 text-xs ml-2">• {new Date(d.created_at).toLocaleString()}</span>
                </div>
                <div className="text-xs">
                  {d.url ? (
                    <a className="text-indigo-700 hover:underline" href={d.url} target="_blank" rel="noreferrer">
                      open file
                    </a>
                  ) : (
                    "no file URL"
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Modal + Input helpers (Tailwind) ---------- */

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-base font-semibold">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value={value} readOnly />
    </div>
  );
}

// (legacy helpers kept for parity)
function TextField({ label, value, onChange, placeholder, error }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${error ? "border-red-400" : "border-slate-300"}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function DigitsField({ label, value, onChange, exactLen = 11, placeholder, error }) {
  const handle = (e) => {
    const digits = (e.target.value || "").replace(/\D/g, "").slice(0, exactLen);
    onChange(digits);
  };
  const showLenError = value && String(value).length > 0 && String(value).length !== exactLen;
  return (
    <div className="mt-3">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${(error || showLenError) ? "border-red-400" : "border-slate-300"}`}
        value={value}
        onChange={handle}
        inputMode="numeric"
        placeholder={placeholder}
        maxLength={exactLen}
        title={`Must be exactly ${exactLen} digits`}
      />
      {(error || showLenError) && <p className="text-xs text-red-600 mt-1">{error || `Must be exactly ${exactLen} digits.`}</p>}
    </div>
  );
}

function Field({ label, value, onChange, mode, placeholder, error }) {
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
      if (firstDot !== -1) txt = txt.slice(0, firstDot + 1) + txt.slice(firstDot + 1).replace(/\./g, "");
      if (firstDot !== -1) {
        let [intPart, decPartRaw] = txt.split(".");
        if (intPart === "") intPart = "0";
        const trailingDotOnly = decPartRaw === "" || decPartRaw == null;
        let decPart = (decPartRaw ?? "").slice(0, maxDecimals);
        let totalDigits = (intPart + decPart).length;
        if (totalDigits > maxDigitsTotal) {
          const overflow = totalDigits - maxDigitsTotal;
          if (decPart.length >= overflow) decPart = decPart.slice(0, decPart.length - overflow);
          else {
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

    if (mode === "height") {
      onChange(clampDecimal(raw, 5, 1));
      return;
    }
    if (mode === "weight") {
      onChange(clampDecimal(raw, 4, 2));
      return;
    }
    if (mode === "temp") {
      onChange(clampDecimal(raw, 4, 2));
      return;
    }

    onChange(raw);
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${error ? "border-red-400" : "border-slate-300"}`}
        value={value}
        onChange={handleChange}
        type="text"
        inputMode={mode === "bp" ? "numeric" : "decimal"}
        placeholder={placeholder}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
