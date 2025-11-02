import React, { useEffect, useMemo, useState } from "react";
import useFormPersist from "../../hooks/useFormPersist";
import { supabase } from "../../lib/supabase";

/* ---------- SHARED HELPERS (in-file to keep this self-contained) ---------- */
// (If you prefer, move these to src/lib/validation.js and import.)
const onlyDigits = (s = "") => String(s).replace(/\D/g, "");
const lettersSpacesOnly = (s = "") => /^[A-Za-z\s]+$/.test(String(s).trim());
const padFam = (numStr, width = 3) => onlyDigits(numStr || "0").padStart(width, "0");

// nurse-style validations
const validateBP = (bp) => {
  const v = String(bp || "").trim();
  if (!v) return ""; // keep your semantics: optional in Registration
  const m = v.match(/^(\d{1,4})\/(\d{1,4})$/);
  if (!m) return 'Blood Pressure must look like "120/80".';
  const [, L, R] = m;
  if (L.length >= 4 || R.length >= 4) return "4 digits is invalid for BP.";
  const sys = Number(L), dia = Number(R);
  if (isNaN(sys) || isNaN(dia)) return "Blood Pressure may only contain numbers and '/'.";
  if (sys < dia) return "Systolic should be ≥ diastolic.";
  if (sys < 70 || sys > 260 || dia < 40 || dia > 160) return "Blood pressure values look out of range.";
  return "";
};
const validateHeightCm = (txt) => {
  const str = String(txt || "");
  if (!str) return ""; // optional here
  const hasOneDot = (str.match(/\./g) || []).length <= 1;
  const decOk = /^\d+(\.\d)?$/.test(str) || /^\d+\.$/.test(str);
  const digits = onlyDigits(str);
  if (!digits.length || digits.length > 5 || !hasOneDot || !decOk) return "Height must be up to 5 digits, 1 decimal (e.g., 163.6).";
  const n = Number(str.endsWith(".") ? str.slice(0, -1) : str);
  if (isNaN(n)) return "Height is not a number.";
  if (n < 30 || n > 300) return "Height must be 30–300 cm.";
  return "";
};
const validateWeightKg = (txt) => {
  const str = String(txt || "");
  if (!str) return ""; // optional here
  const hasOneDot = (str.match(/\./g) || []).length <= 1;
  const decOk = /^\d+(\.\d{0,2})?$/.test(str) || /^\d+\.$/.test(str);
  const digits = onlyDigits(str);
  if (!digits.length || digits.length > 4 || !hasOneDot || !decOk) return "Weight must be up to 4 digits; up to 2 decimals (e.g., 53.72).";
  const n = Number(str.endsWith(".") ? str.slice(0, -1) : str);
  if (isNaN(n)) return "Weight is not a number.";
  if (n <= 0 || n > 500) return "Weight must be 1–500 kg.";
  return "";
};
const validateTemperatureC = (txt) => {
  const str = String(txt || "");
  if (!str) return ""; // optional here
  const hasOneDot = (str.match(/\./g) || []).length <= 1;
  const decOk = /^\d+(\.\d{0,2})?$/.test(str) || /^\d+\.$/.test(str);
  const digits = onlyDigits(str);
  if (!digits.length || digits.length > 4 || !hasOneDot || !decOk) return "Temperature must be up to 4 digits; up to 2 decimals.";
  const n = Number(str.endsWith(".") ? str.slice(0, -1) : str);
  if (isNaN(n)) return "Temperature is not a number.";
  if (n < 30 || n > 45) return "Temperature must be 30–45 °C.";
  return "";
};

// +63 phone: UI collects 10 digits, we can save either E.164 or local 11.
// Here we keep saving the local 11 to match your existing DB.
const validatePhone10 = (digits) => {
  const d = onlyDigits(digits).slice(0, 10);
  if (d.length !== 10) return { error: "Must be 10 digits after +63.", e164: null, local11: null };
  return { error: "", e164: `+63${d}`, local11: `0${d}` };
};
/* ------------------------------------------------------------------------ */

/* ---------------- Patient Registration ---------------- */
function PatientRegistration({ onDone, showHeader = true }) {
  const initialForm = {
    familyNumber: "", surname: "", firstName: "", middleName: "",
    sex: "", birthdate: "", age: "", contactNumber: "",
    contactPerson: "", // (your existing column used for Emergency Number)
    emergencyPersonName: "", emergencyRelation: "",
    heightCm: "", weightKg: "", bloodPressure: "", temperatureC: "",
    chiefComplaint: "", proceedToQueue: false
  };
  const [form, _setForm, setField, clearForm] = useFormPersist(
    "bhw:patientRegistration",
    initialForm
  );
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);

  // SAFE string helper
  const sv = (v) => (v ?? "").toString().trim();

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /* ---------- LIVE VALIDATIONS (kept + boosted where helpful) ---------- */
  const lettersOnlyBad = (s) => /[^A-Za-z\s]/.test(s || "");

  // CHANGED: digits-only live error + we’ll auto-suggest next value on mount
  const familyNumberError = useMemo(() => {
    if (!form.familyNumber) return "";
    return /[^0-9]/.test(form.familyNumber) ? "Numbers only." : "";
  }, [form.familyNumber]);

  const surnameError = useMemo(() => !form.surname ? "" : (lettersOnlyBad(form.surname) ? "Letters and spaces only." : ""), [form.surname]);
  const firstNameError = useMemo(() => !form.firstName ? "" : (lettersOnlyBad(form.firstName) ? "Letters and spaces only." : ""), [form.firstName]);
  const middleNameError = useMemo(() => !form.middleName ? "" : (lettersOnlyBad(form.middleName) ? "Letters and spaces only." : ""), [form.middleName]);

  const birthdateError = useMemo(() => {
    if (!form.birthdate) return "";
    const bd = new Date(form.birthdate);
    const today = new Date(); today.setHours(0,0,0,0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";
    return "";
  }, [form.birthdate]);

  const { infantMonths, isInfant, birthdateYears } = useMemo(() => {
    if (!form.birthdate) return { infantMonths: 0, isInfant: false, birthdateYears: null };
    const bd = new Date(form.birthdate); if (isNaN(bd)) return { infantMonths: 0, isInfant: false, birthdateYears: null };
    const t = new Date();
    let years = t.getFullYear() - bd.getFullYear();
    const mDelta = t.getMonth() - bd.getMonth();
    if (mDelta < 0 || (mDelta === 0 && t.getDate() < bd.getDate())) years--;
    let months = (t.getFullYear() - bd.getFullYear()) * 12 + (t.getMonth() - bd.getMonth());
    if (t.getDate() < bd.getDate()) months--;
    months = Math.max(0, months);
    return { infantMonths: months, isInfant: months < 12, birthdateYears: Math.max(0, years) };
  }, [form.birthdate]);

  const ageError = useMemo(() => {
    if (form.age === "" || form.age == null) return "";
    const n = Number(form.age);
    if (!Number.isFinite(n)) return "Age must be a number.";
    if (n < 0) return "Age cannot be negative.";
    if (n > 120) return "Age must not exceed 120.";
    return "";
  }, [form.age]);

  // CHANGED: BP, Height, Weight, Temp reflect nurse’s stricter rules (still optional here)
  const bpError = useMemo(() => validateBP(form.bloodPressure), [form.bloodPressure]);
  const heightErr = useMemo(() => validateHeightCm(form.heightCm), [form.heightCm]);
  const weightErr = useMemo(() => validateWeightKg(form.weightKg), [form.weightKg]);
  const tempErr   = useMemo(() => validateTemperatureC(form.temperatureC), [form.temperatureC]);

  // NEW: live checks for emergency name / relation
  const emergencyNameError = useMemo(() => {
    if (!form.emergencyPersonName) return "";
    return lettersSpacesOnly(form.emergencyPersonName) ? "" : "Letters and spaces only.";
  }, [form.emergencyPersonName]);
  const emergencyRelationError = useMemo(() => {
    if (!form.emergencyRelation) return "";
    return lettersSpacesOnly(form.emergencyRelation) ? "" : "Letters and spaces only.";
  }, [form.emergencyRelation]);

  // NEW: phone UI keeps 10 digits; we store 11 on submit
  const [uiContact10, setUiContact10] = useState("");            // for Contact Number (+63)
  const [uiEmergency10, setUiEmergency10] = useState("");        // for Emergency Number (+63)
  const [contactErr, setContactErr] = useState("");
  const [emergencyNumErr, setEmergencyNumErr] = useState("");

  // hydrate UI phones from persisted 11-digit on initial load (optional)
  useEffect(() => {
    if (form.contactNumber && !uiContact10) {
      const d = onlyDigits(form.contactNumber);
      if (d.length === 11 && d.startsWith("0")) setUiContact10(d.slice(1));
    }
    if (form.contactPerson && !uiEmergency10) {
      const d = onlyDigits(form.contactPerson);
      if (d.length === 11 && d.startsWith("0")) setUiEmergency10(d.slice(1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [famLockSurname, setFamLockSurname] = useState(null);
  const [famLookupLoading, setFamLookupLoading] = useState(false);
  const norm = (s = "") => s.trim().toUpperCase();
  const set = (k, v) => setField(k, v);

  /* ---------- NEW: Auto-suggest next Family Number on mount ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (sv(form.familyNumber)) return; // user already typed/persisted one
        const { data, error } = await supabase
          .from("patients")
          .select("family_number")
          .order("family_number", { ascending: false })
          .limit(1);
        if (error) throw error;
        const max = data?.[0]?.family_number || "000";
        const next = String(Number(onlyDigits(max)) + 1);
        if (mounted) set("familyNumber", padFam(next, 3)); // e.g., "004"
      } catch (e) {
        // keep editable; no toast needed
        console.warn("family_number lookup failed:", e?.message || e);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----- VALIDATION (submit-time): keep yours, add phone + nurse rules ----- */
  const validate = () => {
    if (!sv(form.familyNumber)) return "Family Number is required.";
    if (!sv(form.surname)) return "Surname is required.";
    if (!sv(form.firstName)) return "First Name is required.";
    if (!form.sex) return "Sex is required.";
    if (!form.birthdate) return "Birthdate is required.";
    if (!form.age) return "Age is required.";

    if (/[^0-9]/.test(form.familyNumber)) return "Family Number must contain numbers only.";
    if (lettersOnlyBad(sv(form.surname))) return "Surname must contain letters and spaces only.";
    if (lettersOnlyBad(sv(form.firstName))) return "First Name must contain letters and spaces only.";
    if (sv(form.middleName) && lettersOnlyBad(sv(form.middleName))) return "Middle Name must contain letters and spaces only.";

    const bd = new Date(sv(form.birthdate));
    const today = new Date(); today.setHours(0,0,0,0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";
    if (Number(form.age) > 120) return "Age must not exceed 120.";
    if (birthdateYears !== null && birthdateYears > 120) return "Birthdate implies age over 120.";

    if (famLockSurname && norm(form.surname) !== norm(famLockSurname)) {
      return `Family Number is already assigned to surname "${famLockSurname}". Please use that surname or choose a different Family Number.`;
    }

    // CHANGED: phones (+63 UI with 10 digits)
    if (uiContact10) {
      const { error } = validatePhone10(uiContact10);
      if (error) return `Contact Number: ${error}`;
    }
    {
      const { error } = validatePhone10(uiEmergency10);
      if (error) return `Emergency Contact Number: ${error}`;
    }

    // nurse-style detail checks (optional fields but if present must be valid)
    if (validateBP(form.bloodPressure)) return validateBP(form.bloodPressure);
    if (validateHeightCm(form.heightCm)) return validateHeightCm(form.heightCm);
    if (validateWeightKg(form.weightKg)) return validateWeightKg(form.weightKg);
    if (validateTemperatureC(form.temperatureC)) return validateTemperatureC(form.temperatureC);

    // Emergency names/relations required
    if (!sv(form.emergencyPersonName)) return "Emergency Contact Person is required.";
    if (!lettersSpacesOnly(sv(form.emergencyPersonName))) return "Emergency Contact Person must contain letters and spaces only.";
    if (!sv(form.emergencyRelation)) return "Emergency Relation is required.";
    if (!lettersSpacesOnly(sv(form.emergencyRelation))) return "Emergency Relation must contain letters and spaces only.";

    return null;
  };

  const canSubmit = useMemo(() => {
    try { return !validate(); } catch { return false; }
  }, [form, famLockSurname, birthdateYears, bpError, heightErr, weightErr, tempErr, uiContact10, uiEmergency10]);

  const handleSubmitClick = async (e) => {
    e.preventDefault();
    if (saving) return;

    const err = validate();
    if (err) { alert(err); return; }

    if (!sv(form.middleName)) {
      const okMiddle = window.confirm("Are you sure this patient does not have any middle name?");
      if (!okMiddle) return;
    }

    const ok = window.confirm("Finalize this registration? Make sure all required fields are complete. Click OK to submit or Cancel to review.");
    if (!ok) return;

    await submit();
  };

  // Insert into public.patients (extended payload)
  const submit = async () => {
    if (saving) return;
    const err = validate();
    if (err) { setNote({ type: "error", msg: err }); return; }

    setSaving(true);
    setNote(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;

      const sexForDb =
        form.sex === "MALE" ? "MEN" :
        form.sex === "FEMALE" ? "WOMEN" : form.sex;

      // map +63 UI (10 digits) -> local 11 with leading 0
      const cn = uiContact10 ? validatePhone10(uiContact10) : { local11: null };
      const em = validatePhone10(uiEmergency10); // required

      const payload = {
        family_number: padFam(sv(form.familyNumber), 3), // store as padded 3 digits
        surname: sv(form.surname),
        first_name: sv(form.firstName),
        middle_name: sv(form.middleName) || null,
        sex: sexForDb,
        birthdate: form.birthdate || null,
        age: form.age ? Number(form.age) : null,

        contact_number: cn.local11 || null,          // "09xxxxxxxxx"
        contact_person: em.local11 || null,          // (existing emergency number column)

        emergency_contact_name: sv(form.emergencyPersonName) || null,
        emergency_relation: sv(form.emergencyRelation) || null,

        height_cm: form.heightCm ? Number(form.heightCm) : null,
        weight_kg: form.weightKg ? Number(form.weightKg) : null,
        blood_pressure: sv(form.bloodPressure) || null,
        temperature_c: form.temperatureC ? Number(form.temperatureC) : null,
        chief_complaint: sv(form.chiefComplaint) || null,
        created_by: uid || null,
        queued: !!form.proceedToQueue,
        queued_at: form.proceedToQueue ? new Date().toISOString() : null,
      };

      const { data, error } = await supabase
        .from("patients")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // Create queued record if requested (kept)
      if (form.proceedToQueue && data?.id) {
        const { data: existing, error: existErr } = await supabase
          .from("patient_records")
          .select("id,status")
          .eq("patient_id", data.id)
          .eq("status", "queued")
          .maybeSingle();
        if (existErr) throw existErr;

        if (!existing) {
          const { error: recErr } = await supabase
            .from("patient_records")
            .insert({
              patient_id: data.id,
              height_cm: payload.height_cm,
              weight_kg: payload.weight_kg,
              blood_pressure: payload.blood_pressure,
              temperature_c: payload.temperature_c,
              chief_complaint: payload.chief_complaint,
              emergency_contact_name: payload.emergency_contact_name || null,
              emergency_relation: payload.emergency_relation || null,
              emergency_contact_number: payload.contact_person || null,
              queued: true,
              status: "queued",
              created_by: uid || null,
              queued_at: new Date().toISOString()
            });
          if (recErr) throw recErr;
        }
      }

      setNote({ type: "success", msg: "Patient saved successfully." });
      clearForm();
      setFamLockSurname(null);
      setUiContact10("");
      setUiEmergency10("");
      if (typeof onDone === "function") onDone();
    } catch (err) {
      console.error("submit error", {
        code: err?.code, message: err?.message, details: err?.details, hint: err?.hint,
      });
      setNote({ type: "error", msg: err?.message || "Insert failed." });
    } finally {
      setSaving(false);
    }
  };

  // Auto-age from birthdate (kept)
  useEffect(() => {
    if (!form.birthdate) return;
    const b = new Date(form.birthdate);
    if (isNaN(b)) return;
    const t = new Date();
    let age = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
    set("age", String(Math.max(0, age)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.birthdate]);

  // Family number -> surname lock (kept)
  useEffect(() => {
    const fn = sv(form.familyNumber);
    if (!fn) { setFamLockSurname(null); return; }
    const t = setTimeout(async () => {
      try {
        setFamLookupLoading(true);
        const { data, error } = await supabase
          .from("patients")
          .select("family_number,surname")
          .eq("family_number", fn)
          .limit(1);
        if (error) throw error;
        const hit = Array.isArray(data) && data[0] ? data[0] : null;
        if (hit?.surname) {
          const canonical = String(hit.surname).trim();
          setFamLockSurname(canonical);
          if (norm(form.surname) !== norm(canonical)) {
            set("surname", canonical);
          }
        } else {
          setFamLockSurname(null);
        }
      } catch {
        setFamLockSurname(null);
      } finally {
        setFamLookupLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.familyNumber]);

  /* -------------------- RENDER -------------------- */
  return (
    <section
      className="section section--registration"
      style={showHeader ? undefined : { margin: 0 }}
    >
      {showHeader && <h2 className="section-title">Patient Registration</h2>}

      <form
        onSubmit={handleSubmitClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target && e.target.tagName !== "TEXTAREA") e.preventDefault();
        }}
        className="form form--patient-registration"
        autoComplete="off"
        aria-busy={saving}
      >
        {/* ===== Card: Patient Record ===== */}
        <div className="card card--patient">
          <div className="card__header">
            <span className="card__title">Patient Record</span>
          </div>
          <div className="card__body">
            <Row two>
              <Field
                label="Family Number"
                value={form.familyNumber}
                setValue={(v) => set("familyNumber", onlyDigits(v).slice(0,3))}  // NEW: hard digits clamp
                required
                hideAsterisk
                error={familyNumberError}
                digitsOnly
              />
              <Field
                label="Surname"
                value={form.surname}
                setValue={(v) => set("surname", v)}
                required
                hideAsterisk
                disabled={!!famLockSurname}
                error={surnameError}
              />
            </Row>

            {famLockSurname && (
              <div className="hint hint--lock">
                This Family Number is linked to <span className="hint-strong">"{famLockSurname}"</span>. Surname is locked.
              </div>
            )}
            {!famLockSurname && famLookupLoading && (
              <div className="hint">Checking family mapping...</div>
            )}

            <Row two>
              <Field
                label="First Name"
                value={form.firstName}
                setValue={(v) => set("firstName", v)}
                required
                hideAsterisk
                error={firstNameError}
              />
              <Field
                label="Extension"
                value={form.middleName}
                setValue={(v) => set("middleName", v)}
                error={middleNameError}
              />
            </Row>

            <Row two>
              <Select
                label="Sex"
                value={form.sex}
                onChange={(v) => set("sex", v)}
                options={["MALE", "FEMALE", "OTHER"]}
                required
                hideAsterisk
              />
              <Field
                label="Birthdate"
                type="date"
                value={form.birthdate}
                setValue={(v) => set("birthdate", v)}
                required
                hideAsterisk
                max={todayISO}
                error={birthdateError}
              />
            </Row>

            {/* Age + Patient Contact Number (+63) */}
            <Row two>
              <Field
                label="Age"
                type="number"
                value={form.age}
                setValue={(v) => set("age", v)}
                required
                hideAsterisk
                min={0}
                max={120}
                error={ageError}
              />
              <PhoneField
                label="Contact Number (+63)"
                value10={uiContact10}
                setValue10={(v)=>{
                  const only = onlyDigits(v).slice(0,10);
                  setUiContact10(only);
                  const { error } = validatePhone10(only);
                  setContactErr(error || "");
                }}
                error={contactErr}
                // keep a hidden mirror for persistence so your local storage still has it
                mirrorTo={(local11) => set("contactNumber", local11 || "")}
              />
            </Row>

            {/* In case of Emergency */}
            <div className="subsection">
              <div className="subsection__title">In case of Emergency</div>

              {/* Contact Person name + Emergency Contact Number (+63) side by side */}
              <Row two>
                <Field
                  label="Contact Person"
                  value={form.emergencyPersonName}
                  setValue={(v) => set("emergencyPersonName", v)}
                  required
                  hideAsterisk
                  error={emergencyNameError}
                />
                <PhoneField
                  label="Emergency Contact Number (+63)"
                  value10={uiEmergency10}
                  setValue10={(v)=>{
                    const only = onlyDigits(v).slice(0,10);
                    setUiEmergency10(only);
                    const { error } = validatePhone10(only);
                    setEmergencyNumErr(error || "");
                  }}
                  error={emergencyNumErr}
                  required
                  mirrorTo={(local11) => set("contactPerson", local11 || "")} // keeps your existing key
                />
              </Row>

              {/* Relation on the next row */}
              <Row two>
                <Field
                  label="Relation"
                  value={form.emergencyRelation}
                  setValue={(v) => set("emergencyRelation", v)}
                  required
                  hideAsterisk
                  error={emergencyRelationError}
                />
                <div />
              </Row>
            </div>
          </div>
        </div>

        {/* ===== Card: Nurse's Notes ===== */}
        <div className="card card--notes">
          <div className="card__header">
            <span className="card__title">Nurse’s Notes</span>
          </div>
          <div className="card__body">
            <div className="stack">
              <Field
                label="Height"
                value={form.heightCm}
                setValue={(v) => set("heightCm", v)}
                oneDecimal
                placeholder="e.g. 170.0"
                error={heightErr}
              />
              <Field
                label="Weight"
                value={form.weightKg}
                setValue={(v) => set("weightKg", v)}
                oneDecimal
                placeholder="e.g. 59.0"
                error={weightErr}
              />
              <Field
                label="Blood Pressure"
                value={form.bloodPressure}
                setValue={(v) => set("bloodPressure", v)}
                placeholder="e.g. 120/80"
                error={bpError}
              />
              <Field
                label="Temperature"
                value={form.temperatureC}
                setValue={(v) => set("temperatureC", v)}
                oneDecimal
                placeholder="e.g. 36.8"
                error={tempErr}
              />
            </div>

            <div className="field-group">
              <label className="label">Chief Complaint:</label>
              <textarea
                className="textarea textarea--complaint"
                value={form.chiefComplaint}
                onChange={(e) => set("chiefComplaint", e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={form.proceedToQueue}
            onChange={(e) => set("proceedToQueue", e.target.checked)}
            required
          />
          <span className="checkbox-label">Proceed to Queuing</span>
        </label>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clearForm}
            disabled={saving}
          >
            Discard
          </button>
          <button
            type="submit"
            className="btn btn--primary btn--submit"
            disabled={saving || !canSubmit}
            title={!canSubmit ? "Complete required fields to enable submit" : ""}
          >
            {saving ? "Saving..." : "Save Chart"}
          </button>
        </div>

        {note && (
          <div className={`note ${note.type === "success" ? "note--success" : "note--error"}`}>
            {note.msg}
          </div>
        )}
      </form>
    </section>
  );
}

/* ---------------- LAYOUT HELPERS (STRUCTURE ONLY) ---------------- */
const Row = ({ two = false, children }) => (
  <div className={`row ${two ? "row--two" : ""}`}>
    {children}
  </div>
);

function Field({
  label,
  value,
  setValue,
  type = "text",
  placeholder = "",
  step,
  required = false,
  digitsOnly = false,
  digitsOnlyExact,
  oneDecimal = false,
  disabled = false,
  min,
  max,
  error = "",
  hideAsterisk = false,
}) {
  const handleChange = (e) => {
    let raw = e.target.value;

    if (oneDecimal) {
      let txt = raw.replace(/[^0-9.]/g, "");
      const firstDot = txt.indexOf(".");
      if (firstDot !== -1) {
        txt = txt.slice(0, firstDot + 1) + txt.slice(firstDot + 1).replace(/\./g, "");
      }
      if (txt.startsWith(".")) txt = "0" + txt;
      const parts = txt.split(".");
      if (parts.length === 2) txt = parts[0] + "." + parts[1].slice(0, 1);
      setValue(txt);
      return;
    }

    if (digitsOnly) {
      raw = onlyDigits(raw);
      if (typeof digitsOnlyExact === "number") raw = raw.slice(0, digitsOnlyExact);
      setValue(raw);
      return;
    }

    setValue(raw);
  };

  const exactLen = typeof digitsOnlyExact === "number" ? digitsOnlyExact : null;
  const showLenError =
    exactLen !== null && value && String(value).length > 0 && String(value).length !== exactLen;

  const hasError = !!error || showLenError;

  return (
    <div className="field">
      <label className="label">
        {label}{required && !hideAsterisk && <span className="required-asterisk"> *</span>}:
      </label>
      <input
        className={`input ${disabled ? "is-disabled" : ""} ${hasError ? "has-error" : ""}`}
        type={(digitsOnly || oneDecimal) ? "text" : type}
        inputMode={oneDecimal ? "decimal" : (digitsOnly ? "numeric" : undefined)}
        pattern={oneDecimal ? "^\\d+(\\.\\d)?$" : (exactLen ? `\\d{${exactLen}}` : (digitsOnly ? "\\d*" : undefined))}
        maxLength={digitsOnly && exactLen ? exactLen : undefined}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        required={required}
        disabled={disabled}
        aria-invalid={hasError ? "true" : "false"}
        title={
          exactLen
            ? `Must be exactly ${exactLen} digits`
            : (oneDecimal ? "Use at most 1 decimal place" : undefined)
        }
      />
      {showLenError && (
        <div className="error-text">Must be exactly {exactLen} digits.</div>
      )}
      {!!error && <div className="error-text">{error}</div>}
    </div>
  );
}

function Select({ label, value, onChange, options, required = false, hideAsterisk = false }) {
  return (
    <div className="field">
      <label className="label">
        {label}{required && !hideAsterisk && <span className="required-asterisk"> *</span>}:
      </label>
      <div className="select">
        <select
          className="select-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        >
          <option value="" disabled>Select...</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="select-caret">v</span>
      </div>
    </div>
  );
}

/* ---------- NEW: +63 Phone Field (10-digit UI, mirrors 11-digit local for persistence) ---------- */
function PhoneField({ label, value10, setValue10, error, required = false, mirrorTo }) {
  // Whenever UI value changes, mirror 11-digit local back up so your persisted form stays coherent.
  useEffect(() => {
    const { error: e, local11 } = validatePhone10(value10);
    if (mirrorTo) mirrorTo(e ? "" : local11);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value10]);

  const hasError = !!error;

  return (
    <div className="field">
      <label className="label">
        {label}{required && <span className="required-asterisk"> *</span>}:
      </label>
      <div className="phone-field">
        <span className="phone-prefix">+63</span>
        <input
          className={`input phone-input ${hasError ? "has-error" : ""}`}
          value={value10}
          onChange={(e)=> setValue10(e.target.value)}
          inputMode="numeric"
          placeholder="9123456789"
          maxLength={10}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          required={required}
          aria-invalid={hasError ? "true" : "false"}
          title="Must be 10 digits after +63"
        />
      </div>
      {hasError && <div className="error-text">{error}</div>}
    </div>
  );
}

export default PatientRegistration;
