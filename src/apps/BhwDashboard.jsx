// src/apps/BhwDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useFormPersist from "../hooks/useFormPersist";
import { supabase } from "../lib/supabase";
import "./BHWDashboard.css";
/* ----------------------------------------------------------
   BHW DASHBOARD (Supabase)
   NOTE FOR CSS:
   - Add your styles in an external stylesheet.
   - Classnames here are semantic and stable for styling.
   - Keep error text ('.error-text') red.
---------------------------------------------------------- */

export default function BhwDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState("Patient Registration");
  const [loadingRole, setLoadingRole] = useState(true);

  // Role guard via Supabase Auth + profiles (UNCHANGED)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.user?.id) { nav("/login", { replace: true }); return; }

      const { data: prof, error } = await supabase
        .from("profiles").select("role").eq("id", session.user.id).single();

      if (!mounted) return;
      if (error || !prof || String(prof.role).toUpperCase() !== "BHW") {
        await supabase.auth.signOut().catch(()=>{});
        nav("/login", { replace: true }); return;
      }
      setLoadingRole(false);
    })();
    return () => { mounted = false; };
  }, [nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    nav("/login", { replace: true });
  };

  if (loadingRole) return null;

  return (
    <div className="app app--bhw"> {/* CSS: page root layout container */}
      <header className="app-header">
        {/* CSS: .app-header -> fixed top bar; brand left, action right */}
        <div className="brand">Caybiga Health Center</div>
        <button onClick={logout} className="btn btn--link btn--logout">
          {/* CSS NAME for this button: .btn--logout */}
          Log Out
        </button>
      </header>

      <aside className="sidebar">
        {/* CSS: vertical nav; padded top to account for fixed header */}
        <nav className="sidebar-nav">
          {["Patient Registration", "Patient Records"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`tab-btn ${tab === item ? "tab-btn--active" : ""}`}
              /* CSS:
                 .tab-btn          -> base style for nav buttons
                 .tab-btn--active  -> highlights active tab
              */
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {/* CSS: main content area with top padding for fixed header */}
        {tab === "Patient Registration" ? <PatientRegistration /> : <PatientRecords />}
      </main>
    </div>
  );
}

/* ---------------- Patient Registration ---------------- */
function PatientRegistration() {
  const initialForm = {
    familyNumber:"", surname:"", firstName:"", middleName:"",
    sex:"", birthdate:"", age:"", contactNumber:"", contactPerson:"",
    heightCm:"", weightKg:"", bloodPressure:"", temperatureC:"",
    chiefComplaint:"", proceedToQueue:false
  };
  const [form, _setForm, setField, clearForm] = useFormPersist(
    "bhw:patientRegistration",
    initialForm
  );
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null); // {type:'success'|'error', msg:string}

  // Cap date inputs to today
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ---------- LIVE VALIDATIONS (UNCHANGED LOGIC) ----------
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
    today.setHours(0,0,0,0);
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

  const [famLockSurname, setFamLockSurname] = useState(null);
  const [famLookupLoading, setFamLookupLoading] = useState(false);
  const norm = (s = "") => s.trim().toUpperCase();

  const set = (k, v) => setField(k, v);

  // ----- VALIDATION (submit-time) (UNCHANGED LOGIC) -----
  const validate = () => {
    if (!form.familyNumber.trim()) return "Family Number is required.";
    if (!form.surname.trim()) return "Surname is required.";
    if (!form.firstName.trim()) return "First Name is required.";
    if (!form.sex) return "Sex is required.";
    if (!form.birthdate) return "Birthdate is required.";
    if (!form.age) return "Age is required.";

    if (/[^0-9]/.test(form.familyNumber)) return "Family Number must contain numbers only.";
    if (lettersOnlyBad(form.surname)) return "Surname must contain letters and spaces only.";
    if (lettersOnlyBad(form.firstName)) return "First Name must contain letters and spaces only.";
    if (form.middleName && lettersOnlyBad(form.middleName)) return "Middle Name must contain letters and spaces only.";

    const bd = new Date(form.birthdate);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";

    if (Number(form.age) > 120) return "Age must not exceed 120.";
    if (birthdateYears !== null && birthdateYears > 120) return "Birthdate implies age over 120.";

    if (famLockSurname && norm(form.surname) !== norm(famLockSurname)) {
      return `Family Number is already assigned to surname "${famLockSurname}". Please use that surname or choose a different Family Number.`;
    }

    if (form.contactNumber && String(form.contactNumber).length !== 11)
      return "Contact Number must be exactly 11 digits.";
    if (form.contactPerson && String(form.contactPerson).length !== 11)
      return "Contact Person must be exactly 11 digits.";

    const oneDec = /^\d+(\.\d)?$/;
    if (form.heightCm && !oneDec.test(form.heightCm)) return "Height must have at most 1 decimal place.";
    if (form.weightKg && !oneDec.test(form.weightKg)) return "Weight must have at most 1 decimal place.";
    if (form.temperatureC && !oneDec.test(form.temperatureC)) return "Temperature must have at most 1 decimal place.";

    if (form.bloodPressure) {
      const s = String(form.bloodPressure);
      const slashCount = (s.match(/\//g) || []).length;
      if (/[^\d/]/.test(s)) return 'Blood Pressure may only contain numbers and "/".';
      if (slashCount > 1) return 'Blood Pressure may contain only one "/".';
      if (!/^\d{1,3}(?:\/\d{1,3})?$/.test(s)) return 'Blood Pressure must look like "120/80".';
    }

    return null;
  };

  const canSubmit = useMemo(() => !validate(), [form, famLockSurname, birthdateYears, bpError]);

  const handleSubmitClick = async (e) => {
    e.preventDefault();
    if (saving) return;

    const err = validate();
    if (err) { alert(err); return; }

    if (!form.middleName.trim()) {
      const okMiddle = window.confirm(
        "Are you sure this patient does not have any middle name?"
      );
      if (!okMiddle) return;
    }

    const ok = window.confirm(
      "Finalize this registration? Make sure all required fields are complete. Click OK to submit or Cancel to review."
    );
    if (!ok) return;

    await submit();
  };

  // Insert into public.patients (UNCHANGED)
  const submit = async () => {
    if (saving) return;
    const err = validate();
    if (err) { setNote({ type:"error", msg: err }); return; }

    setSaving(true);
    setNote(null);

    try {
      const sexForDb =
        form.sex === "MALE" ? "MEN" :
        form.sex === "FEMALE" ? "WOMEN" :
        form.sex;

      const payload = {
        family_number: form.familyNumber.trim(),
        surname: form.surname.trim(),
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim() || null,
        sex: sexForDb,
        birthdate: form.birthdate || null,
        age: form.age ? Number(form.age) : null,
        contact_number: form.contactNumber.trim() || null,
        contact_person: form.contactPerson.trim() || null,
        height_cm: form.heightCm ? Number(form.heightCm) : null,
        weight_kg: form.weightKg ? Number(form.weightKg) : null,
        blood_pressure: form.bloodPressure.trim() || null,
        temperature_c: form.temperatureC ? Number(form.temperatureC) : null,
        chief_complaint: form.chiefComplaint.trim() || null,
      };

      const { data, error } = await supabase
        .from("patients")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

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
              queued: true,
              status: "queued",
            });

          if (recErr) {
            console.error("patient_records insert error", {
              code: recErr.code,
              message: recErr.message,
              details: recErr.details,
              hint: recErr.hint,
            });
            throw recErr;
          }
        }
      }

      setNote({ type:"success", msg:"Patient saved successfully." });
      clearForm();
      setFamLockSurname(null);
    } catch (err) {
      console.error("submit error", {
        code: err?.code,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
      });
      setNote({ type:"error", msg: err?.message || "Insert failed." });
    } finally {
      setSaving(false);
    }
  };

  // Auto-age from birthdate (UNCHANGED)
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

  // Family number -> surname lock (UNCHANGED)
  useEffect(() => {
    const fn = form.familyNumber.trim();
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
    <section className="section section--registration">
      {/* CSS: center section width, vertical spacing */}
      <h2 className="section-title">Patient Registration</h2>

      <form
        onSubmit={handleSubmitClick}
        className="form form--patient-registration"
        autoComplete="off"
        aria-busy={saving}
      >
        {/* CSS: .form--patient-registration is the name of this form */}

        <Row two>
          <Field
            label="Family Number"
            value={form.familyNumber}
            setValue={v=>set("familyNumber",v)}
            required
            hideAsterisk
            error={familyNumberError}
            digitsOnly
          />
          <div>
            <Field
              label="Surname"
              value={form.surname}
              setValue={v=>set("surname",v)}
              required
              hideAsterisk
              disabled={!!famLockSurname}
              error={surnameError}
            />
            {famLockSurname && (
              <div className="hint hint--lock">
                {/* CSS: subtle info text */}
                This Family Number is linked to <span className="hint-strong">"{famLockSurname}"</span>. Surname is locked.
              </div>
            )}
            {!famLockSurname && famLookupLoading && (
              <div className="hint">Checking family mapping...</div>
            )}
          </div>
        </Row>

        <Row two>
          <Field
            label="First Name"
            value={form.firstName}
            setValue={v=>set("firstName",v)}
            required
            hideAsterisk
            error={firstNameError}
          />
          <Field
            label="Middle Name"
            value={form.middleName}
            setValue={v=>set("middleName",v)}
            error={middleNameError}
          />
        </Row>
        <Row two>
          <Select
            label="Sex"
            value={form.sex}
            onChange={v=>set("sex",v)}
            options={["MALE","FEMALE","OTHER"]}
            required
            hideAsterisk
          />
          <Field
            label="Birthdate"
            type="date"
            value={form.birthdate}
            setValue={v=>set("birthdate",v)}
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
            setValue={v=>set("age",v)}
            required
            hideAsterisk
            min={0}
            max={120}
            error={ageError}
          />
          <Field
            label="Contact Number"
            value={form.contactNumber}
            setValue={v=>set("contactNumber",v)}
            digitsOnly
            digitsOnlyExact={11}
          />
        </Row>

        {isInfant && (
          <div className="note note--info note--compact">
            {/* CSS: small muted text */}
            Age based on birthdate: {infantMonths} month{infantMonths === 1 ? "" : "s"}
          </div>
        )}

        <Field
          label="Contact Person"
          value={form.contactPerson}
          setValue={v=>set("contactPerson",v)}
          digitsOnly
          digitsOnlyExact={11}
        />

        <div className="separator" /> {/* CSS: horizontal rule substitute */}

        <Row two>
          <Field
            label="Height (cm)"
            value={form.heightCm}
            setValue={v=>set("heightCm",v)}
            oneDecimal
            placeholder="e.g. 172.4"
          />
          <Field
            label="Weight (kg)"
            value={form.weightKg}
            setValue={v=>set("weightKg",v)}
            oneDecimal
            placeholder="e.g. 83.0"
          />
        </Row>
        <Row two>
          <Field
            label="Blood Pressure"
            value={form.bloodPressure}
            setValue={v=>set("bloodPressure",v)}
            placeholder="e.g. 120/80"
            error={bpError}
          />
          <Field
            label="Temperature (°C)"
            value={form.temperatureC}
            setValue={v=>set("temperatureC",v)}
            oneDecimal
            placeholder="e.g. 37.5"
          />
        </Row>

        <div className="field-group">
          {/* CSS: block for textarea */}
          <label className="label">Chief Complaint:</label>
          <textarea
            className="textarea"
            value={form.chiefComplaint}
            onChange={e=>set("chiefComplaint", e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={form.proceedToQueue}
            onChange={e=>set("proceedToQueue", e.target.checked)}
            required
          />
          <span className="checkbox-label">Proceed to Queuing</span>
          {/* CSS: this checkbox must be visibly required */}
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--submit"
          disabled={saving || !canSubmit}
          title={!canSubmit ? "Complete required fields to enable submit" : ""}
        >
          {saving ? "Saving..." : "Submit"}
        </button>

        {note && (
          <div className={`note ${note.type === "success" ? "note--success" : "note--error"}`}>
            {/* Keep error text red via .note--error */}
            {note.msg}
          </div>
        )}
      </form>
    </section>
  );
}

/* ---------------- LAYOUT HELPERS (STRUCTURE ONLY) ---------------- */

const Row = ({two=false, children}) => (
  <div className={`row ${two ? "row--two" : ""}`}>
    {/* CSS:
       .row         -> vertical spacing between fields
       .row--two    -> 2-column grid on wider screens, 1-col on mobile
    */}
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
      {/* CSS: .field is the container; stack label + input + messages */}
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
        <div className="error-text">
          {/* CSS: keep this red */}
          Must be exactly {exactLen} digits.
        </div>
      )}
      {!!error && (
        <div className="error-text">
          {/* CSS: keep this red */}
          {error}
        </div>
      )}
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
        {/* CSS: style the wrapper; add custom arrow using .select-caret if desired */}
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
        {/* CSS: position this caret on the right inside select */}
      </div>
    </div>
  );
}

/* ---------------- Patient Records ---------------- */
function PatientRecords() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]); // <-- fixed (was "the [items, setItems]")
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(false);

  useEffect(() => {
    if (firstRun.current) return;
    firstRun.current = true;
    void load();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const like = q.trim();
      let query = supabase
        .from("patients")
        .select("family_number,surname")
        .order("family_number", { ascending: true });

      if (like) {
        query = query.or(
          `family_number.ilike.%${like}%,surname.ilike.%${like}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const map = new Map();
      (data || []).forEach(r => {
        const key = `${r.family_number}||${r.surname}`;
        if (!map.has(key)) map.set(key, r);
      });

      setItems(Array.from(map.values()));
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load records");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section section--records">
      {/* CSS: center section width */}
      <h2 className="section-title">Patient Records</h2>

      <div className="toolbar">
        {/* CSS: horizontal layout for search + button */}
        <input
          className="input input--search"
          placeholder="Search by Family No. or Surname..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <button
          className="btn btn--secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          {/* CSS NAME for this button: .btn--secondary */}
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {err && (
        <div className="alert alert--error">{err}</div>
        /* CSS: .alert--error should be red background with red/dark text */
      )}

      <div className="family-list">
        {/* CSS: vertical list; center items on narrow screens */}
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`/bhw/family/${encodeURIComponent(row.family_number)}`}
            className="family-list__item"
            /* CSS NAME for these items: .family-list__item */
          >
            {row.family_number} - {row.surname}
          </Link>
        ))}

        {items.length === 0 && !loading && (
          <div className="empty">No families found.</div>
          /* CSS: muted, centered small text */
        )}
      </div>
    </section>
  );
}