// src/apps/bhw/BhwQueueChart.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fmtDate } from "../../lib/utils";
import PatientHeader from "../../components/PatientHeader";
import "./bhwQueue.css";

/* ---------- helpers ---------- */
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

const onlyDigits = (s="") => String(s).replace(/\D/g, "");
const collapseSpaces = (s="") => s.replace(/\s{2,}/g, " ").replace(/^\s+/, "");
const lettersSpacesOnly = (s="") => s.replace(/[^A-Za-z\s]/g, "");
const allowAddressChars = (s="") => s.replace(/[^A-Za-z0-9\s,\.\-/#]/g, "");
const pad3 = (d) => String(d).padStart(3, "0");

/** Turn a full middle name into an initial like "E." (or "" if none). */
const middleInitialDot = (middleName="") => {
  const ch = String(middleName).trim().replace(/[^A-Za-z]/g, "").charAt(0);
  return ch ? `${ch.toUpperCase()}.` : "";
};

export default function BhwQueueChart() {
  const nav = useNavigate();
  const location = useLocation();
  const { recordId } = useParams();
  const backTo = location.state?.from || "/bhw";

  const [banner, setBanner] = useState(null);
  const [rec, setRec] = useState(null);

  // edit state
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    family_number: "",
    first_name: "",
    middle_name: "",       // FULL middle name here (e.g., "Espino")
    surname: "",
    extension: "",
    sex: "",
    birthdate: "",
    contact_person_name: "",
    contact_person_number: "",
    relation: "",
    contact_number: "",
    address: "",
  });
  const [errors, setErrors] = useState({});
  const [maxFamily, setMaxFamily] = useState("000"); // for "next available" logic

  /* ------------ load record + current patient + max family ------------ */
  const loadRecord = useCallback(async () => {
    try {
      setBanner(null);
      const { data, error } = await supabase
        .from("patient_records")
        .select(`
          *,
          patients:patient_id (
            id,
            first_name,
            middle_name,         
            surname,
            name_extension,
            family_number,
            sex,
            age,
            birthdate,
            contact_number,
            contact_person,
            emergency_contact_name,
            emergency_relation,
            address
          )
        `)
        .eq("id", recordId)
        .single();

      if (error) throw error;

      const p = data.patients || {};
      const active = {
        record_id: data.id,
        patient_id: data.patient_id,
        family_number: p.family_number ?? "",
        first_name: p.first_name ?? "",
        middle_name: p.middle_name ?? "",           // full middle name
        surname: p.surname ?? "",
        name_extension: p.name_extension ?? "",
        sex: p.sex ?? "",
        age: p.age ?? "",
        birthdate: p.birthdate ?? null,
        contact_number: p.contact_number ?? "",
        contact_person_name: p.emergency_contact_name ?? "",
        contact_person_number: p.contact_person ?? "",
        relation: p.emergency_relation ?? "",
        address: p.address ?? "",
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        blood_pressure: data.blood_pressure,
        temperature_c: data.temperature_c,
        chief_complaint: data.chief_complaint,
        doctor_assessment: data.doctor_assessment ?? "",
        doctor_management: data.doctor_management ?? "",
        created_at: data.created_at,
      };
      setRec(active);

      // Seed form (full middle name in input)
      setForm({
        family_number: onlyDigits(active.family_number).slice(0, 3),
        first_name: active.first_name || "",
        middle_name: active.middle_name || "",       // <— full word in the field
        surname: active.surname || "",
        extension: active.name_extension || "",
        sex: active.sex || "",
        birthdate: active.birthdate ? String(active.birthdate).slice(0,10) : "",
        contact_person_name: active.contact_person_name || "",
        contact_person_number: onlyDigits(active.contact_person_number).slice(0,11),
        relation: active.relation || "",
        contact_number: onlyDigits(active.contact_number).slice(0,11),
        address: active.address || "",
      });
      setErrors({});
      setIsEditing(false);

      const { data: rows, error: e2 } = await supabase
        .from("patients")
        .select("family_number")
        .not("family_number","is", null)
        .order("family_number",{ ascending: false })
        .limit(1);
      if (!e2 && rows?.length) setMaxFamily(rows[0].family_number || "000");
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to load chart" });
    }
  }, [recordId]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  // --- Realtime subscriptions ---
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
    return () => { supabase.removeChannel(ch); };
  }, [rec?.patient_id, loadRecord]);

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
    return () => { supabase.removeChannel(ch); };
  }, [rec?.record_id, loadRecord]);

  const activeWithDisplays = useMemo(() => {
    if (!rec) return null;
    return {
      ...rec,
      age_display: ageDisplayFromBirthdate(rec.birthdate, rec.age),
      sex_display: sexDisplay(rec.sex),
      // For PatientHeader: send the middle as an initial so header shows "T."
      middle_name: middleInitialDot(rec.middle_name),
    };
  }, [rec]);

  /* -------------------- live validation -------------------- */
  const validate = async (f) => {
    const errs = {};
    const req = (v) => String(v ?? "").trim().length > 0;

    // family number
    const famDigits = onlyDigits(f.family_number).slice(0,3);
    if (famDigits.length !== 3) {
      errs.family_number = "3 digits (e.g., 011).";
    } else {
      const candidate = pad3(famDigits);
      const current = pad3(onlyDigits(rec.family_number || "").slice(0,3) || "000");
      if (candidate !== current) {
        const next = pad3(String(Number(onlyDigits(maxFamily || "0")) + 1));
        if (candidate !== next) {
          errs.family_number = `Must be the next available: ${next}.`;
        } else {
          const { data: taken, error: qErr } = await supabase
            .from("patients")
            .select("id")
            .eq("family_number", candidate)
            .neq("id", rec.patient_id)
            .limit(1);
          if (!qErr && taken && taken.length > 0) errs.family_number = "Already taken.";
        }
      }
    }

    // names
    const checkName = (key, required) => {
      const raw = String(f[key] ?? "");
      const val = raw.trim();
      if (!val) { if (required) errs[key] = "Required."; return; }
      if (val.length > 40) errs[key] = "Max 40 characters.";
      if (/\s{2,}/.test(raw)) errs[key] = "No double spaces.";
      if (/[^A-Za-z\s]/.test(val)) errs[key] = "Letters and spaces only.";
    };
    checkName("first_name", true);
    if (f.middle_name) checkName("middle_name", false); // optional full middle name
    if (f.surname) checkName("surname", false);
    if (f.extension) checkName("extension", false);
    if (f.contact_person_name) checkName("contact_person_name", false);
    if (f.relation) checkName("relation", false);

    // sex
    if (!req(f.sex)) errs.sex = "Required.";

    // birthdate
    if (!req(f.birthdate)) {
      errs.birthdate = "Required.";
    } else {
      const d = new Date(f.birthdate);
      const today = new Date(); today.setHours(0,0,0,0);
      if (isNaN(d)) errs.birthdate = "Invalid date.";
      if (!errs.birthdate && d > today) errs.birthdate = "Cannot be in the future.";
      if (!errs.birthdate) {
        const yrs = today.getFullYear() - d.getFullYear() - (today < new Date(d.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
        if (yrs > 120) errs.birthdate = "Age cannot exceed 120.";
      }
    }

    // phones: optional; if present 11 digits and start with 09
    const checkPhone = (key) => {
      const digits = onlyDigits(f[key] || "");
      if (!digits) return;
      if (!/^09\d{9}$/.test(digits)) errs[key] = "Must be 11 digits and start with 09.";
    };
    checkPhone("contact_person_number");
    checkPhone("contact_number");

    // address
    if (!req(f.address)) errs.address = "Required.";
    const addr = f.address || "";
    if (addr.length > 160) errs.address = "Max 160 characters.";
    if (/[^A-Za-z0-9\s,\.\-/#]/.test(addr)) errs.address = "Only letters, numbers, space, , . - / # allowed.";

    return errs;
  };

  // live validate on change
  const setF = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      (async ()=> setErrors(await validate(next)))();
      return next;
    });
  };

  /* -------------------- save -------------------- */
  const save = async () => {
    try {
      setBanner(null);

      const cleaned = {
        family_number: onlyDigits(form.family_number).slice(0,3),
        first_name: collapseSpaces(lettersSpacesOnly(form.first_name)).slice(0,40),
        middle_name: collapseSpaces(lettersSpacesOnly(form.middle_name)).slice(0,40), // save FULL middle name
        surname: collapseSpaces(lettersSpacesOnly(form.surname)).slice(0,40),
        extension: collapseSpaces(lettersSpacesOnly(form.extension)).slice(0,20),
        sex: collapseSpaces(form.sex),
        birthdate: form.birthdate,
        contact_person_name: collapseSpaces(lettersSpacesOnly(form.contact_person_name)).slice(0,40),
        contact_person_number: onlyDigits(form.contact_person_number).slice(0,11),
        relation: collapseSpaces(lettersSpacesOnly(form.relation)).slice(0,20),
        contact_number: onlyDigits(form.contact_number).slice(0,11),
        address: allowAddressChars(form.address).slice(0,160),
      };

      const errs = await validate(cleaned);
      setErrors(errs);
      if (Object.keys(errs).length) {
        setBanner({ type: "err", msg: "Please fix highlighted fields." });
        return;
      }

      const payload = {
        family_number: pad3(cleaned.family_number),
        first_name: cleaned.first_name,
        middle_name: cleaned.middle_name || null,     // store the FULL middle name
        surname: cleaned.surname || null,
        name_extension: cleaned.extension || null,
        sex: cleaned.sex,
        birthdate: cleaned.birthdate,
        emergency_contact_name: cleaned.contact_person_name || null,
        emergency_relation: cleaned.relation || null,
        contact_person: cleaned.contact_person_number || null,
        contact_number: cleaned.contact_number || null,
        address: cleaned.address,
      };

      // 1) update patients
      const { error: upErr } = await supabase
        .from("patients")
        .update(payload)
        .eq("id", rec.patient_id);
      if (upErr) throw upErr;

      // 2) bump record so other screens refresh
      const { error: bumpErr } = await supabase
        .from("patient_records")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", rec.record_id);
      if (bumpErr) throw bumpErr;

      // reflect locally
      setRec((r) => ({
        ...r,
        family_number: payload.family_number,
        first_name: payload.first_name,
        middle_name: payload.middle_name ?? "",      // keep full in state
        surname: payload.surname ?? "",
        name_extension: payload.name_extension ?? "",
        sex: payload.sex,
        birthdate: payload.birthdate,
        contact_person_name: payload.emergency_contact_name ?? "",
        relation: payload.emergency_relation ?? "",
        contact_person_number: payload.contact_person ?? "",
        contact_number: payload.contact_number ?? "",
        address: payload.address,
      }));

      setIsEditing(false);
      setBanner({ type: "ok", msg: "Patient chart updated." });
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Update failed" });
    }
  };

  if (!rec) {
    return (
      <div className="stack">
        {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}
        <div className="muted small">Loading…</div>
        <button className="btn btn--outline" onClick={() => nav(backTo, { replace: true })}>Back</button>
      </div>
    );
  }

  const errTxt = (k) => errors[k] ? <div className="small" style={{ color:"#b91c1c", marginTop:4 }}>{errors[k]}</div> : null;

  // Build display name with middle *initial* + dot + extension
  const nameDisplay = `${rec.first_name} ${rec.middle_name ? middleInitialDot(rec.middle_name) + " " : ""}${rec.surname}${rec.name_extension ? `, ${rec.name_extension}` : ""}`;

  return (
    <div className="stack pt-1">
      {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}

      <button
        onClick={() => nav(backTo, { replace: true })}
        style={{ color: "black", border: "1px solid black", padding: 4, width: 140 }}
      >
        Back
      </button>

      {/* Send middle initial to PatientHeader for display */}
      <PatientHeader patient={activeWithDisplays} />

      <div className="panel">
        <div className="panel__title">Patient Chart</div>

        {!isEditing ? (
          <>
            <div className="kv">
              <div><span>Family Number:</span> {String(rec.family_number || "").padStart(3,"0") || "—"}</div>
              <div><span>Name:</span> {nameDisplay}</div>
              <div><span>Sex:</span> {sexDisplay(rec.sex)}</div>
              <div><span>Birthdate:</span> {rec.birthdate ? String(rec.birthdate).slice(0,10) : "—"}</div>
              <div><span>Age:</span> {ageDisplayFromBirthdate(rec.birthdate, rec.age)}</div>
              <div><span>Contact Person:</span> {rec.contact_person_name || "—"}</div>
              <div><span>Relation:</span> {rec.relation || "—"}</div>
              <div><span>Contact Person Number:</span> {rec.contact_person_number || "—"}</div>
              <div><span>Patient Contact Number:</span> {rec.contact_number || "—"}</div>
              <div style={{ gridColumn: "1 / -1" }}><span>Address:</span> {rec.address || "—"}</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn btn--primary" onClick={() => setIsEditing(true)}>Edit</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid-2">
              {/* Family Number */}
              <label className="field">
                <div className="field__label">Family Number</div>
                <input
                  className={`input ${errors.family_number ? "input--error" : ""}`}
                  inputMode="numeric"
                  maxLength={3}
                  value={form.family_number}
                  onChange={(e)=> setF({ family_number: onlyDigits(e.target.value).slice(0,3) })}
                  placeholder="e.g., 011"
                />
                {errTxt("family_number")}
              </label>

              {/* Sex */}
              <label className="field">
                <div className="field__label">Sex</div>
                <input
                  className={`input ${errors.sex ? "input--error" : ""}`}
                  list="sex-list"
                  value={form.sex}
                  onChange={(e)=> setF({ sex: e.target.value })}
                  placeholder="Male / Female"
                />
                <datalist id="sex-list">
                  <option>Male</option><option>Female</option>
                </datalist>
                {errTxt("sex")}
              </label>

              {/* First / Middle (full) / Surname */}
              <label className="field">
                <div className="field__label">First Name</div>
                <input
                  className={`input ${errors.first_name ? "input--error" : ""}`}
                  value={form.first_name}
                  onChange={(e)=> setF({ first_name: collapseSpaces(lettersSpacesOnly(e.target.value)).slice(0,40) })}
                />
                {errTxt("first_name")}
              </label>

              <label className="field">
                <div className="field__label">Middle Name (optional)</div>
                <input
                  className={`input ${errors.middle_name ? "input--error" : ""}`}
                  value={form.middle_name}
                  onChange={(e)=> setF({ middle_name: collapseSpaces(lettersSpacesOnly(e.target.value)).slice(0,40) })}
                  placeholder="e.g., Espino"
                />
                {errTxt("middle_name")}
              </label>

              <label className="field">
                <div className="field__label">Surname</div>
                <input
                  className={`input ${errors.surname ? "input--error" : ""}`}
                  value={form.surname}
                  onChange={(e)=> setF({ surname: collapseSpaces(lettersSpacesOnly(e.target.value)).slice(0,40) })}
                />
                {errTxt("surname")}
              </label>

              {/* Extension (Jr / Sr / III) */}
              <label className="field">
                <div className="field__label">Extension (optional)</div>
                <input
                  className={`input ${errors.extension ? "input--error" : ""}`}
                  value={form.extension}
                  onChange={(e)=> setF({ extension: collapseSpaces(lettersSpacesOnly(e.target.value)).slice(0,20) })}
                  placeholder="e.g., Jr / Sr / III"
                />
                {errTxt("extension")}
              </label>

              {/* Birthdate */}
              <label className="field">
                <div className="field__label">Birthdate</div>
                <input
                  type="date"
                  className={`input ${errors.birthdate ? "input--error" : ""}`}
                  value={form.birthdate}
                  onChange={(e)=> setF({ birthdate: e.target.value })}
                />
                {errTxt("birthdate")}
              </label>

              {/* Contact Person Name */}
              <label className="field">
                <div className="field__label">Contact Person (Name)</div>
                <input
                  className={`input ${errors.contact_person_name ? "input--error" : ""}`}
                  value={form.contact_person_name}
                  onChange={(e)=> setF({ contact_person_name: collapseSpaces(lettersSpacesOnly(e.target.value)).slice(0,40) })}
                />
                {errTxt("contact_person_name")}
              </label>

              {/* Relation */}
              <label className="field">
                <div className="field__label">Relation</div>
                <input
                  className={`input ${errors.relation ? "input--error" : ""}`}
                  value={form.relation}
                  onChange={(e)=> setF({ relation: collapseSpaces(lettersSpacesOnly(e.target.value)).slice(0,20) })}
                />
                {errTxt("relation")}
              </label>

              {/* Contact Person Number */}
              <label className="field">
                <div className="field__label">Contact Person Number</div>
                <input
                  className={`input ${errors.contact_person_number ? "input--error" : ""}`}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="09XXXXXXXXX"
                  value={form.contact_person_number}
                  onChange={(e)=> setF({ contact_person_number: onlyDigits(e.target.value).slice(0,11) })}
                />
                {errTxt("contact_person_number")}
              </label>

              {/* Patient Contact Number */}
              <label className="field">
                <div className="field__label">Patient Contact Number</div>
                <input
                  className={`input ${errors.contact_number ? "input--error" : ""}`}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="09XXXXXXXXX"
                  value={form.contact_number}
                  onChange={(e)=> setF({ contact_number: onlyDigits(e.target.value).slice(0,11) })}
                />
                {errTxt("contact_number")}
              </label>
            </div>

            {/* Address */}
            <label className="field" style={{ marginTop: 8 }}>
              <div className="field__label">Address</div>
              <textarea
                className={`textarea ${errors.address ? "input--error" : ""}`}
                rows={2}
                value={form.address}
                onChange={(e)=> setF({ address: allowAddressChars(e.target.value).slice(0,160) })}
                placeholder="House/Blk/Lot, Street, Barangay, City/Municipality, Province"
              />
              {errTxt("address")}
            </label>

            <div className="row gap-8" style={{ marginTop: 12 }}>
              <button className="btn btn--primary" onClick={save}>Save</button>
              <button
                className="btn btn--outline"
                onClick={() => { setErrors({}); setIsEditing(false); }}
              >
                Cancel Edit
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nurse notes (read-only) */}
      <div className="panel">
        <div className="panel__title">Nurse’s Notes (read-only)</div>
        <div className="kv">
          <div><span>Height:</span> {rec.height_cm ?? "—"} cm</div>
          <div><span>Weight:</span> {rec.weight_kg ?? "—"} kg</div>
          <div><span>Blood Pressure:</span> {rec.blood_pressure ?? "—"}</div>
          <div><span>Temperature:</span> {rec.temperature_c ?? "—"} °C</div>
        </div>
        <div className="kv">
          <div className="kv-col">
            <div className="small muted" style={{ marginBottom: 6 }}>Chief Complaint</div>
            <div className="well">{rec.chief_complaint || "—"}</div>
          </div>
        </div>
      </div>

      {/* Doctor notes (read-only) */}
      <div className="panel">
        <div className="panel__title">Doctor’s Notes (read-only)</div>
        <div className="small muted" style={{ marginBottom: 6 }}>Assessment / Diagnosis</div>
        <div className="well">{rec.doctor_assessment || "Waiting for Doctor's Input"}</div>

        <div className="small muted" style={{ marginTop: 10, marginBottom: 6 }}>Management</div>
        <div className="well">{rec.doctor_management || "Waiting for Doctor's Input"}</div>

        <div className="small muted" style={{ marginTop: 10 }}>
          Visit: {fmtDate(rec.created_at)}
        </div>
      </div>
    </div>
  );
}
