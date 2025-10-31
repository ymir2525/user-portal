import React, { useEffect, useMemo, useState } from "react";
import useFormPersist from "../../hooks/useFormPersist";
import { supabase } from "../../lib/supabase";

/* ---------------- Patient Registration ---------------- */
// showHeader: render the internal "Patient Registration" H2 (default true).
function PatientRegistration({ onDone, showHeader = true }) {
  const initialForm = {
    familyNumber: "", surname: "", firstName: "", middleName: "",
    sex: "", birthdate: "", age: "", contactNumber: "",
    // Existing field (kept): this will be the Emergency Contact Number
    contactPerson: "",
    // NEW fields:
    emergencyPersonName: "",   // Contact Person (name)
    emergencyRelation: "",     // Relation
    heightCm: "", weightKg: "", bloodPressure: "", temperatureC: "",
    chiefComplaint: "", proceedToQueue: false
  };
  const [form, _setForm, setField, clearForm] = useFormPersist(
    "bhw:patientRegistration",
    initialForm
  );
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null); // {type:'success'|'error', msg:string}

  // SAFE string helper (prevents .trim() on undefined)
  const sv = (v) => (v ?? "").toString().trim();

  // Cap date inputs to today
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ---------- LIVE VALIDATIONS ----------
  const lettersOnlyBad = (s) => /[^A-Za-z\s]/.test(s || "");

  const familyNumberError = useMemo(() => {
    if (!form.familyNumber) return "";
    return /[^0-9]/.test(form.familyNumber) ? "Numbers only." : "";
  }, [form.familyNumber]);

  const surnameError = useMemo(() => {
    if (!form.surname) return "";
    return lettersOnlyBad(form.surname) ? "Letters and spaces only." : "";
  }, [form.surname]);

  const firstNameError = useMemo(() => {
    if (!form.firstName) return "";
    return lettersOnlyBad(form.firstName) ? "Letters and spaces only." : "";
  }, [form.firstName]);

  const middleNameError = useMemo(() => {
    if (!form.middleName) return ""; // blank allowed
    return lettersOnlyBad(form.middleName) ? "Letters and spaces only." : "";
  }, [form.middleName]);

  const birthdateError = useMemo(() => {
    if (!form.birthdate) return "";
    const bd = new Date(form.birthdate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";
    return "";
  }, [form.birthdate]);

  const { infantMonths, isInfant, birthdateYears } = useMemo(() => {
    if (!form.birthdate) return { infantMonths: 0, isInfant: false, birthdateYears: null };
    const bd = new Date(form.birthdate);
    if (isNaN(bd)) return { infantMonths: 0, isInfant: false, birthdateYears: null };
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
    if (form.age === "" || form.age === null || form.age === undefined) return "";
    const n = Number(form.age);
    if (!Number.isFinite(n)) return "Age must be a number.";
    if (n < 0) return "Age cannot be negative.";
    if (n > 120) return "Age must not exceed 120.";
    return "";
  }, [form.age]);

  const bpError = useMemo(() => {
    if (!form.bloodPressure) return "";
    const s = String(form.bloodPressure);
    const slashCount = (s.match(/\//g) || []).length;
    if (/[^\d/]/.test(s)) return 'Only numbers and "/" are allowed.';
    if (slashCount > 1) return 'Only one "/" is allowed.';
    if (!/^\d{1,3}(?:\/\d{1,3})?$/.test(s)) return 'Format must be like "120/80".';
    return "";
  }, [form.bloodPressure]);

  // NEW: live checks for emergency name / relation (letters + spaces only)
  const emergencyNameError = useMemo(() => {
    if (!form.emergencyPersonName) return "";
    return lettersOnlyBad(form.emergencyPersonName) ? "Letters and spaces only." : "";
  }, [form.emergencyPersonName]);

  const emergencyRelationError = useMemo(() => {
    if (!form.emergencyRelation) return "";
    return lettersOnlyBad(form.emergencyRelation) ? "Letters and spaces only." : "";
  }, [form.emergencyRelation]);

  const [famLockSurname, setFamLockSurname] = useState(null);
  const [famLookupLoading, setFamLookupLoading] = useState(false);
  const norm = (s = "") => s.trim().toUpperCase();
  const set = (k, v) => setField(k, v);

  // ----- VALIDATION (submit-time) -----
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";

    if (Number(form.age) > 120) return "Age must not exceed 120.";
    if (birthdateYears !== null && birthdateYears > 120) return "Birthdate implies age over 120.";

    if (famLockSurname && norm(form.surname) !== norm(famLockSurname)) {
      return `Family Number is already assigned to surname "${famLockSurname}". Please use that surname or choose a different Family Number.`;
    }

    if (sv(form.contactNumber) && sv(form.contactNumber).length !== 11)
      return "Contact Number must be exactly 11 digits.";
    if (sv(form.contactPerson) && sv(form.contactPerson).length !== 11)
      return "Contact Person must be exactly 11 digits.";

    const oneDec = /^\d+(\.\d)?$/;
    if (sv(form.heightCm) && !oneDec.test(sv(form.heightCm))) return "Height must have at most 1 decimal place.";
    if (sv(form.weightKg) && !oneDec.test(sv(form.weightKg))) return "Weight must have at most 1 decimal place.";
    if (sv(form.temperatureC) && !oneDec.test(sv(form.temperatureC))) return "Temperature must have at most 1 decimal place.";

    if (sv(form.bloodPressure)) {
      const bp = sv(form.bloodPressure);
      const slashCount = (bp.match(/\//g) || []).length;
      if (/[^\d/]/.test(bp)) return 'Blood Pressure may only contain numbers and "/".';
      if (slashCount > 1) return 'Blood Pressure may contain only one "/".';
      if (!/^\d{1,3}(?:\/\d{1,3})?$/.test(bp)) return 'Blood Pressure must look like "120/80".';
    }

    // NEW required checks for Emergency section
    if (!sv(form.emergencyPersonName)) return "Emergency Contact Person is required.";
    if (lettersOnlyBad(sv(form.emergencyPersonName))) return "Emergency Contact Person must contain letters and spaces only.";
    if (!sv(form.emergencyRelation)) return "Emergency Relation is required.";
    if (lettersOnlyBad(sv(form.emergencyRelation))) return "Emergency Relation must contain letters and spaces only.";
    if (!sv(form.contactPerson) || sv(form.contactPerson).length !== 11)
      return "Emergency Contact Number must be exactly 11 digits.";

    return null;
  };

  const canSubmit = useMemo(() => {
    try { return !validate(); } catch { return false; }
  }, [form, famLockSurname, birthdateYears, bpError]);

  const handleSubmitClick = async (e) => {
    e.preventDefault();
    if (saving) return;

    const err = validate();
    if (err) { alert(err); return; }

    if (!sv(form.middleName)) {
      const okMiddle = window.confirm("Are you sure this patient does not have any middle name?");
      if (!okMiddle) return;
    }

    const ok = window.confirm(
      "Finalize this registration? Make sure all required fields are complete. Click OK to submit or Cancel to review."
    );
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
          form.sex === "FEMALE" ? "WOMEN" :
            form.sex;

      const payload = {
        family_number: sv(form.familyNumber),
        surname: sv(form.surname),
        first_name: sv(form.firstName),
        middle_name: sv(form.middleName) || null,
        sex: sexForDb,
        birthdate: form.birthdate || null,
        age: form.age ? Number(form.age) : null,
        contact_number: sv(form.contactNumber) || null,

        // Existing column preserved: this remains the NUMBER used in emergency section
        contact_person: sv(form.contactPerson) || null,

        // NEW columns
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

      // Create a queued record if requested, snapshot emergency fields
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

              // NEW: emergency contact snapshot
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
      if (typeof onDone === "function") onDone();
    } catch (err) {
      console.error("submit error", {
        code: err?.code,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
      });
      setNote({ type: "error", msg: err?.message || "Insert failed." });
    } finally {
      setSaving(false);
    }
  };

  // Auto-age from birthdate
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

  // Family number -> surname lock
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
  }, [form.familyNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section
      className="section section--registration"
      style={showHeader ? undefined : { margin: 0 }} // remove extra outer margin in modal
    >
      {showHeader && <h2 className="section-title">Patient Registration</h2>}

      <form
        onSubmit={handleSubmitClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
          }
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
                setValue={(v) => set("familyNumber", v)}
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
              <Field
                label="Contact Number"
                value={form.contactNumber}
                setValue={(v) => set("contactNumber", v)}
                digitsOnly
                digitsOnlyExact={11}
              />
            </Row>

            {isInfant && (
              <div className="note note--info note--compact">
                Age based on birthdate: {infantMonths} month{infantMonths === 1 ? "" : "s"}
              </div>
            )}

            <div className="subsection">
              <div className="subsection__title">In case of Emergency</div>
              <Row two>
                <Field
                  label="Contact Person"
                  value={form.emergencyPersonName}
                  setValue={(v) => set("emergencyPersonName", v)}
                  required
                  hideAsterisk
                  error={emergencyNameError}
                />
                <Field
                  label="Relation"
                  value={form.emergencyRelation}
                  setValue={(v) => set("emergencyRelation", v)}
                  required
                  hideAsterisk
                  error={emergencyRelationError}
                />
              </Row>
              <Field
                label="Contact Number"
                value={form.contactPerson}          // existing key, kept (NUMBER)
                setValue={(v) => set("contactPerson", v)}
                digitsOnly
                digitsOnlyExact={11}
                required
                hideAsterisk
              />
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
              />
              <Field
                label="Weight"
                value={form.weightKg}
                setValue={(v) => set("weightKg", v)}
                oneDecimal
                placeholder="e.g. 59.0"
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
  const onlyDigits = (s) => s.replace(/\D+/g, "");

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
      if (typeof digitsOnlyExact === "number") {
        raw = raw.slice(0, digitsOnlyExact);
      }
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

export default PatientRegistration;
