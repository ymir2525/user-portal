// src/apps/BhwDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useFormPersist from "../hooks/useFormPersist";
import { supabase } from "../lib/supabase";

/* ---------------------------------------------------------- */
/*                  BHW DASHBOARD (Supabase)                  */
/* ---------------------------------------------------------- */

export default function BhwDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState("Patient Registration");
  const [loadingRole, setLoadingRole] = useState(true);

  // Role guard via Supabase Auth + profiles
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
    <div className="min-h-screen flex">
      <header className="fixed top-0 left-0 right-0 h-12 bg-orange-500 text-white flex items-center justify-between px-4 z-40">
        <div className="font-semibold">Caybiga Health Center</div>
        <button onClick={logout} className="text-sm hover:opacity-90">Log Out</button>
      </header>

      <aside className="w-64 bg-orange-100 border-r border-orange-200 pt-16 p-3 min-h-screen">
        <nav className="space-y-3">
          {["Patient Registration", "Patient Records"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`w-full text-left px-3 py-2 rounded border ${
                tab === item
                  ? "bg-white border-orange-400 text-orange-700"
                  : "bg-white hover:bg-orange-50 border-orange-200"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 pt-16 p-6 bg-white">
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

  // Live error for Birthdate (future/invalid)
  const birthdateError = useMemo(() => {
    if (!form.birthdate) return "";
    const bd = new Date(form.birthdate);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";
    return "";
  }, [form.birthdate]);

  // Infant months + derived years from birthdate
  const { infantMonths, isInfant, birthdateYears } = useMemo(() => {
    if (!form.birthdate) return { infantMonths: 0, isInfant: false, birthdateYears: null };
    const bd = new Date(form.birthdate);
    if (isNaN(bd)) return { infantMonths: 0, isInfant: false, birthdateYears: null };
    const t = new Date();

    // years
    let years = t.getFullYear() - bd.getFullYear();
    const mDelta = t.getMonth() - bd.getMonth();
    if (mDelta < 0 || (mDelta === 0 && t.getDate() < bd.getDate())) years--;

    // months
    let months = (t.getFullYear() - bd.getFullYear()) * 12 + (t.getMonth() - bd.getMonth());
    if (t.getDate() < bd.getDate()) months--;
    months = Math.max(0, months);

    return { infantMonths: months, isInfant: months < 12, birthdateYears: Math.max(0, years) };
  }, [form.birthdate]);

  // Live error for typed Age
  const ageError = useMemo(() => {
    if (form.age === "" || form.age === null || form.age === undefined) return "";
    const n = Number(form.age);
    if (!Number.isFinite(n)) return "Age must be a number.";
    if (n < 0) return "Age cannot be negative.";
    if (n > 120) return "Age must not exceed 120.";
    return "";
  }, [form.age]);

  // Family→surname lock state
  const [famLockSurname, setFamLockSurname] = useState(null); // string | null
  const [famLookupLoading, setFamLookupLoading] = useState(false);
  const norm = (s = "") => s.trim().toUpperCase();

  const set = (k, v) => setField(k, v);

  // ----- VALIDATION -----
  const validate = () => {
    if (!form.familyNumber.trim()) return "Family Number is required.";
    if (!form.surname.trim()) return "Surname is required.";
    if (!form.firstName.trim()) return "First Name is required.";
    if (!form.sex) return "Sex is required.";
    if (!form.birthdate) return "Birthdate is required.";
    if (!form.age) return "Age is required.";

    // Block future birthdates
    const bd = new Date(form.birthdate);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (isNaN(bd.getTime())) return "Birthdate is invalid.";
    if (bd > today) return "Birthdate cannot be in the future.";

    // Age typed must not exceed 120
    if (Number(form.age) > 120) return "Age must not exceed 120.";

    // Birthdate-derived years must not exceed 120
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

    return null;
  };

  const canSubmit = useMemo(() => !validate(), [form, famLockSurname, birthdateYears]);

  const handleSubmitClick = async (e) => {
    e.preventDefault();
    if (saving) return;

    const err = validate();
    if (err) { alert(err); return; }

    const ok = window.confirm(
      "Finalize this registration? Make sure all required fields are complete. Click OK to submit or Cancel to review."
    );
    if (!ok) return;

    await submit();
  };

  // Insert into public.patients (RLS + trigger will set created_by)
  const submit = async () => {
    if (saving) return;
    const err = validate();
    if (err) { setNote({ type:"error", msg: err }); return; }

    setSaving(true);
    setNote(null);

    try {
      // Map UI select (MALE/FEMALE/OTHER) to DB check (MEN/WOMEN/OTHER)
      const sexForDb =
        form.sex === "MALE" ? "MEN" :
        form.sex === "FEMALE" ? "WOMEN" :
        form.sex; // OTHER stays OTHER

      const payload = {
        family_number: form.familyNumber.trim(),
        surname: form.surname.trim(),
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim() || null,
        sex: sexForDb, // matches CHECK constraint: MEN/WOMEN/OTHER
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

      // If the checkbox is checked, add a queued record immediately
      if (form.proceedToQueue && data?.id) {
        // Optional: prevent duplicates — only one queued record per patient
        const { data: existing, error: existErr } = await supabase
          .from("patient_records")
          .select("id,status")
          .eq("patient_id", data.id)
          .eq("status", "queued")
          .maybeSingle(); // null when none

        if (existErr) throw existErr;

        if (!existing) {
          const { error: recErr } = await supabase
            .from("patient_records")
            .insert({
              patient_id: data.id,
              // visit_date omitted -> uses DEFAULT CURRENT_DATE
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

  // Auto-age from birthdate (in whole years)
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

  // Lookup canonical surname for the entered family number (exact match)
  useEffect(() => {
    const fn = form.familyNumber.trim();
    if (!fn) { setFamLockSurname(null); return; }

    const t = setTimeout(async () => {
      try {
        setFamLookupLoading(true);
        // Prefer exact match on family_number; adjust to ilike if your data has padding
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
    <section className="max-w-5xl mx-auto">
      <h2 className="text-sm font-semibold text-orange-600 mb-3 text-center">Patient Registration</h2>

      <form onSubmit={handleSubmitClick} className="bg-orange-50 rounded-xl border border-orange-200 p-6 space-y-5" autoComplete="off" aria-busy={saving}>
        <Row two>
          <Field label="Family Number" value={form.familyNumber} setValue={v=>set("familyNumber",v)} required />
          <div>
            <Field
              label="Surname"
              value={form.surname}
              setValue={v=>set("surname",v)}
              required
              disabled={!!famLockSurname}
            />
            {famLockSurname && (
              <div className="text-xs text-orange-700 mt-1">
                This Family Number is linked to <span className="font-semibold">"{famLockSurname}"</span>. Surname is locked.
              </div>
            )}
            {!famLockSurname && famLookupLoading && (
              <div className="text-xs text-gray-500 mt-1">Checking family mapping...</div>
            )}
          </div>
        </Row>

        <Row two>
          <Field label="First Name" value={form.firstName} setValue={v=>set("firstName",v)} required />
          <Field label="Middle Name" value={form.middleName} setValue={v=>set("middleName",v)} />
        </Row>
        <Row two>
          <Select label="Sex" value={form.sex} onChange={v=>set("sex",v)} options={["MALE","FEMALE","OTHER"]} required />
          <Field
            label="Birthdate"
            type="date"
            value={form.birthdate}
            setValue={v=>set("birthdate",v)}
            required
            max={todayISO}                 // disallow future dates in the picker
            error={birthdateError}         // LIVE red helper + red border
          />
        </Row>

        <Row two>
          <Field
            label="Age"
            type="number"
            value={form.age}
            setValue={v=>set("age",v)}
            required
            min={0}
            max={120}
            error={ageError}
          />
          <Field label="Contact Number" value={form.contactNumber} setValue={v=>set("contactNumber",v)} digitsOnly digitsOnlyExact={11} />
        </Row>

        {isInfant && (
          <div className="text-xs text-gray-600 -mt-2 mb-2">
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
        <hr className="border-orange-200" />

        <Row two>
          <Field label="Height (cm)" value={form.heightCm} setValue={v=>set("heightCm",v)} oneDecimal placeholder="e.g. 172.4" />
          <Field label="Weight (kg)" value={form.weightKg} setValue={v=>set("weightKg",v)} oneDecimal placeholder="e.g. 83.0" />
        </Row>
        <Row two>
          <Field label="Blood Pressure" value={form.bloodPressure} setValue={v=>set("bloodPressure",v)} placeholder="e.g. 120/80" />
          <Field label="Temperature (°C)" value={form.temperatureC} setValue={v=>set("temperatureC",v)} oneDecimal placeholder="e.g. 37.5" />
        </Row>

        <div>
          <label className="block text-sm mb-1">Chief Complaint:</label>
          <textarea className="w-full border rounded px-3 py-2 min-h-[120px] bg-white"
            value={form.chiefComplaint} onChange={e=>set("chiefComplaint", e.target.value)}
            autoComplete="off" spellCheck={false} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-orange-500"
            checked={form.proceedToQueue}
            onChange={e=>set("proceedToQueue", e.target.checked)}
            required
          />
          Proceed to Queuing
        </label>

        <button
          type="submit"
          className="w-full bg-orange-500 text-white rounded-lg py-2 hover:bg-orange-600 disabled:opacity-60"
          disabled={saving || !canSubmit}
          title={!canSubmit ? "Complete required fields to enable submit" : ""}
        >
          {saving ? "Saving..." : "Submit"}
        </button>

        {note && (
          <div className={`mt-3 text-sm p-2 rounded ${
            note.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>
            {note.msg}
          </div>
        )}
      </form>
    </section>
  );
}

const Row = ({two=false, children}) => (
  <div className={`grid gap-4 ${two?"grid-cols-1 md:grid-cols-2":""}`}>{children}</div>
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
  digitsOnlyExact,       // exact digit length (e.g., 11)
  oneDecimal = false,    // allow at most 1 decimal place
  disabled = false,
  min,                   // pass-through for inputs like date/number
  max,                   // pass-through for inputs like date/number
  error = "",            // live error message string
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
    <div>
      <label className="block text-sm mb-1">
        {label}{required && <span className="text-red-500"> *</span>}:
      </label>
      <input
        className={`w-full border rounded px-3 py-2 bg-white ${
          disabled ? "opacity-70 cursor-not-allowed bg-gray-50" : ""
        } ${hasError ? "border-red-400" : ""}`}
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
        <div className="text-xs text-red-600 mt-1">
          Must be exactly {exactLen} digits.
        </div>
      )}
      {!!error && (
        <div className="text-xs text-red-600 mt-1">{error}</div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, required = false }) {
  return (
    <div>
      <label className="block text-sm mb-1">
        {label}{required && <span className="text-red-500"> *</span>}:
      </label>
      <div className="relative">
        <select
          className="w-full border rounded px-3 py-2 appearance-none bg-white"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        >
          <option value="" disabled>Select...</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
          v
        </div>
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

      // Distinct families from patients; search by family_number or surname
      const like = q.trim();
      let query = supabase
        .from("patients")
        .select("family_number,surname")
        .order("family_number", { ascending: true });

      if (like) {
        // If family_number is numeric in your schema, consider exact .eq for numbers
        query = query.or(
          `family_number.ilike.%${like}%,surname.ilike.%${like}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      // Ensure uniqueness (defensive)
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
    <section className="max-w-5xl mx-auto w-full">
      <h2 className="text-sm font-semibold text-orange-600 mb-3 text-center">
        Patient Records
      </h2>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Search by Family No. or Surname..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <button
          className="border rounded px-3 py-2 hover:bg-gray-50"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {err && (
        <div className="text-sm bg-red-100 text-red-700 p-2 rounded mb-3">{err}</div>
      )}

      <div className="max-w-3xl mx-auto mt-2 space-y-2">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`/bhw/family/${encodeURIComponent(row.family_number)}`}
            className="block w-[420px] sm:w-[460px] mx-auto border border-gray-600 rounded px-3 py-2 text-center text-base hover:bg-orange-50"
          >
            {row.family_number} - {row.surname}
          </Link>
        ))}

        {items.length === 0 && !loading && (
          <div className="text-center text-sm text-gray-500">No families found.</div>
        )}
      </div>
    </section>
  );
}
