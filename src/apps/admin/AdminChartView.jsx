// src/apps/admin/AdminChartView.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fmtDate, fullName } from "../../lib/utils";

import PatientHeader from "../../components/PatientHeader";
import NurseBlock from "../../components/NurseBlock";
import ReferralForm from "../../components/ReferralForm";
import PastChartView from "../../components/past/PastChartView";
import PastRecordDetail from "../../components/past/PastRecordDetail";
import PastDocumentsView from "../../components/past/PastDocumentsView";
import MedCertForm from "../../components/MedCertForm";
import LabRequestForm from "../../components/LabRequestForm";
import PrescriptionForm from "../../components/PrescriptionForm";
import "../doctor/doctorDash.css";

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

export default function AdminChartView() {
  const nav = useNavigate();
  const { recordId, patientId } = useParams();
  const effectiveRecordId = recordId ?? null;
  const effectivePatientId = patientId ?? null;

  const [banner, setBanner] = useState(null);
  const [rec, setRec] = useState(null);

  const [docView, setDocView] = useState("none"); // 'none'|'referral'|'prescription'|'lab'|'medcert'
  const [saving, setSaving] = useState(false);

  // notes
  const [docAssessment, setDocAssessment] = useState("");
  const [docManagement, setDocManagement] = useState("");

  // INVENTORY-ONLY sources (non-expired)
  const [classifications, setClassifications] = useState([]);
  const [namesByClass, setNamesByClass] = useState(new Map());

  // Distributed rows
  const [distRows, setDistRows] = useState([
    { classification: "", name: "", qty: "", dosage: "", medicine_type: "", sig: "" },
  ]);

  // Prescribed rows
  const [rxRows, setRxRows] = useState([
    { classification: "", name: "", qty: "", nameMode: "dropdown" },
  ]);

  // Lists saved for document + inventory logic
  const [distributedList, setDistributedList] = useState([]);
  const [prescribedList, setPrescribedList] = useState([]);

  // Past
  const [past, setPast] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [selectedPast, setSelectedPast] = useState(null);
  const [pastView, setPastView] = useState("menu");

  const manilaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

 /* ---------- load record ---------- */
const loadRecord = useCallback(async () => {
  try {
    setBanner(null);

    if (effectiveRecordId) {
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
        .eq("id", effectiveRecordId)
        .single();
      if (error) throw error;

      const active = {
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
      };
      setRec(active);
      setDocAssessment(active.doctor_assessment || "");
      setDocManagement(active.doctor_management || "");
      return;
    }

    if (effectivePatientId) {
      const { data, error } = await supabase
        .from("patients")
        .select(`
          id, family_number, first_name, middle_name, surname,
          sex, age, birthdate, contact_number, contact_person,
          emergency_contact_name, emergency_relation, address,
          height_cm, weight_kg, blood_pressure, temperature_c, chief_complaint
        `)
        .eq("id", effectivePatientId)
        .single();
      if (error) throw error;

      const merged = {
        record_id: null, // will create on save
        patient_id: data.id,
        family_number: data.family_number ?? "",
        first_name: data.first_name ?? "",
        middle_name: data.middle_name ?? "",
        surname: data.surname ?? "",
        sex: data.sex ?? "",
        age: data.age ?? "",
        birthdate: data.birthdate ?? null,
         contact_number: data.contact_number ?? "",
        contact_person_number: data.contact_person ?? "",
        contact_person_name: data.emergency_contact_name ?? "",
        relation: data.emergency_relation ?? "",
        address: data.address ?? "",
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        blood_pressure: data.blood_pressure,
        temperature_c: data.temperature_c,
        chief_complaint: data.chief_complaint,
        doctor_assessment: "",
        doctor_management: "",
      };
      setRec(merged);
      setDocAssessment("");
      setDocManagement("");
      return;
    }

    setBanner({ type: "err", msg: "Missing route parameter. No recordId or patientId provided." });
  } catch (e) {
    console.error(e);
    setBanner({ type: "err", msg: e.message || "Failed to load chart" });
  }
}, [effectiveRecordId, effectivePatientId]);

// --- Realtime: refresh when patient is updated elsewhere ---
useEffect(() => {
  if (!rec?.patient_id) return;
  const ch = supabase
    .channel(`patients-${rec.patient_id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'patients',
        filter: `id=eq.${rec.patient_id}`,
      },
      () => loadRecord()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, [rec?.patient_id, loadRecord]);

// (optional) Also refresh this view if someone bumps the record (e.g., BHW save sets updated_at)
useEffect(() => {
  if (!rec?.record_id) return;
  const ch = supabase
    .channel(`patient_records-${rec.record_id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'patient_records',
        filter: `id=eq.${rec.record_id}`,
      },
      () => loadRecord()
    )
    .subscribe();

  return () => supabase.removeChannel(ch);
}, [rec?.record_id, loadRecord]);


// --- Realtime: refresh when patient is updated elsewhere ---
useEffect(() => {
  if (!rec?.patient_id) return;
  const ch = supabase
    .channel(`patients-${rec.patient_id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'patients',
        filter: `id=eq.${rec.patient_id}`,
      },
      () => loadRecord()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}, [rec?.patient_id, loadRecord]);

  /* ---------- load medicines from inventory (non-expired) ---------- */
  const loadMedicines = useCallback(async () => {
    try {
      const { data: inv, error } = await supabase
        .from("medicine_inventory")
        .select("classification, medicine_name, quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      if (error) throw error;

      const classSet = new Set();
      const map = new Map();
      (inv || []).forEach((row) => {
        const cls = row.classification || "";
        const name = row.medicine_name || "";
        if (!cls || !name) return;
        classSet.add(cls);
        if (!map.has(cls)) map.set(cls, new Set());
        map.get(cls).add(name);
      });

      setClassifications(Array.from(classSet).sort((a, b) => String(a).localeCompare(String(b))));
      setNamesByClass(map);
    } catch (e) {
      console.error(e);
    }
  }, [manilaDate]);

  useEffect(() => {
    loadRecord();
    loadMedicines();
  }, [loadRecord, loadMedicines]);

  const activeWithDisplays = useMemo(
    () =>
      rec
        ? { ...rec, age_display: ageDisplayFromBirthdate(rec.birthdate, rec.age), sex_display: sexDisplay(rec.sex) }
        : null,
    [rec]
  );

  /* ---------- past records (only if we know patient_id) ---------- */
  const loadPastRecords = useCallback(async () => {
    if (!rec?.patient_id) return;
    try {
      setLoadingPast(true);
      setSelectedPast(null);
      setPastView("menu");
      const { data, error } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", rec.patient_id)
        .neq("status", "queued")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPast(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to load past records" });
    } finally {
      setLoadingPast(false);
    }
  }, [rec?.patient_id]);
  useEffect(() => { void loadPastRecords(); }, [loadPastRecords]);

  /* ---------- helpers ---------- */
  const namesForClass = (cls) => Array.from(namesByClass.get(cls) || []).sort((a, b) => a.localeCompare(b));

  const updateDistRow = (i, patch) =>
    setDistRows((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch, ...(patch.classification ? { name: "" } : null) } : r))
    );

  const removeDistRow = (i) =>
    setDistRows((rows) =>
      rows.length === 1
        ? [{ classification: "", name: "", qty: "", dosage: "", medicine_type: "", sig: "" }]
        : rows.filter((_, idx) => idx !== i)
    );

  const addRxRow = () => setRxRows((rows) => [...rows, { classification: "", name: "", qty: "", nameMode: "dropdown" }]);
  const updateRxRow = (i, patch) =>
    setRxRows((rows) =>
      rows.map((r, idx) =>
        idx === i ? { ...r, ...patch, ...(patch.classification ? { name: "", nameMode: r.nameMode } : null) } : r
      )
    );
  const removeRxRow = (i) =>
    setRxRows((rows) => (rows.length === 1 ? [{ classification: "", name: "", qty: "", nameMode: "dropdown" }] : rows.filter((_, idx) => idx !== i)));

  const addAllDistributedToList = () => {
    const valid = distRows.filter((r) => r.classification && r.name && Number(r.qty) > 0 && Number.isFinite(Number(r.qty)));
    if (!valid.length) {
      alert("Complete at least one distributed medicine row (classification, name, positive quantity).");
      return;
    }
    const mgmtBlocks = valid.map((r) => {
      const headline = [r.name || "", r.qty ? String(Number(r.qty)) : "", (r.dosage || "").trim(), (r.medicine_type || "").trim() ? `/${(r.medicine_type || "").trim()}` : ""]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+\/\s*/g, " / ");
      const sigLine = (r.sig || "").trim() ? `\n(${(r.sig || "").trim()})` : "";
      return `${headline}${sigLine}`;
    });
    setDocManagement((prev) => `${prev?.trim() ? `${prev}\n\n` : ""}${mgmtBlocks.join("\n\n")}`);
    setDistributedList((prev) => [
      ...prev,
      ...valid.map((r) => ({
        classification: r.classification,
        name: r.name,
        qty: Number(r.qty),
        dosage: (r.dosage || "").trim(),
        medicine_type: (r.medicine_type || "").trim(),
        sig: (r.sig || "").trim(),
      })),
    ]);
    setDistRows([{ classification: "", name: "", qty: "", dosage: "", medicine_type: "", sig: "" }]);
  };

  const addAllPrescribedToList = () => {
    const valid = rxRows.filter((r) => r.classification && r.name && Number(r.qty) > 0 && Number.isFinite(Number(r.qty)));
    if (!valid.length) {
      alert("Complete at least one prescribed medicine row (classification, name, positive quantity).");
      return;
    }
    setPrescribedList((prev) => [...prev, ...valid.map((r) => ({ ...r, qty: Number(r.qty) }))]);
    setRxRows([{ classification: "", name: "", qty: "", nameMode: "dropdown" }]);
  };

  const canSave = !!docAssessment?.trim() && !!docManagement?.trim() && !saving;

  async function saveMedicinesDocument(record_id) {
    const payload = { distributed: distributedList, prescribed: prescribedList };
    const { error } = await supabase.from("record_documents").insert({ record_id, type: "medicines", payload });
    if (error) throw error;
  }

  async function decrementInventoryForDistributed(items) {
    for (const item of items) {
      let toTake = Number(item.qty) || 0;
      if (toTake <= 0) continue;

      const { data: rows, error } = await supabase
        .from("medicine_inventory")
        .select("id, quantity")
        .eq("classification", item.classification)
        .eq("medicine_name", item.name)
        .gte("expiration_date", manilaDate)
        .order("expiration_date", { ascending: true });
      if (error) throw error;

      for (const row of rows || []) {
        if (toTake <= 0) break;
        const available = Number(row.quantity) || 0;
        const used = Math.min(available, toTake);
        if (used > 0) {
          const { error: upErr } = await supabase
            .from("medicine_inventory")
            .update({ quantity: available - used })
            .eq("id", row.id);
          if (upErr) throw upErr;
          toTake -= used;
        }
      }

      if (toTake > 0) {
        console.warn(`Not enough stock for ${item.classification} / ${item.name}. Short by ${toTake}.`);
      }
    }
  }

  // ensure we have a patient_records row if opened via patientId
  async function ensureRecordId() {
    if (rec.record_id) return rec.record_id;

    const insertPayload = {
      patient_id: rec.patient_id,
      visit_date: new Date().toISOString(),
      queued: false,
      status: "in_progress",
      height_cm: rec.height_cm,
      weight_kg: rec.weight_kg,
      blood_pressure: rec.blood_pressure,
      temperature_c: rec.temperature_c,
      chief_complaint: rec.chief_complaint,
    };

    const { data, error } = await supabase
      .from("patient_records")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) throw error;

    setRec((prev) => ({ ...prev, record_id: data.id }));
    return data.id;
  }

  // NEW: clear patient queue flags so they disappear from QueuingTable immediately
  async function clearPatientQueueFlags(patient_id) {
    if (!patient_id) return;
    const { error } = await supabase
      .from("patients")
      .update({ queued: false, queued_at: null })
      .eq("id", patient_id);
    if (error) throw error;
  }

  const saveChart = async () => {
    if (!rec) return;
    try {
      setSaving(true);
      setBanner(null);

      const record_id = await ensureRecordId();

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      const { data: me } = await supabase.from("profiles").select("firstname,surname").eq("id", uid).single();
      const doctor_full_name = me ? `${me.firstname ?? ""} ${me.surname ?? ""}`.trim() : null;

      const combinedNotes =
        `Assessment / Diagnosis:\n${(docAssessment || "").trim()}\n\n` +
        `Management:\n${(docManagement || "").trim()}`;

      const { error: upErr } = await supabase
        .from("patient_records")
        .update({
          doctor_assessment: docAssessment || null,
          doctor_management: docManagement || null,
          doctor_notes: combinedNotes || null,
          doctor_id: uid,
          doctor_full_name,
          status: "completed",
          completed_at: new Date().toISOString(),
          queued: false,
        })
        .eq("id", record_id);
      if (upErr) throw upErr;

      // ALSO clear queue flags on patients
      await clearPatientQueueFlags(rec.patient_id);

      await saveMedicinesDocument(record_id);
      await decrementInventoryForDistributed(distributedList);
      await logDispenseTransactions(distributedList, { ...rec, record_id });

      setBanner({ type: "ok", msg: "Chart saved. Inventory updated and medicines recorded." });
      nav("/admin/queue");
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (!rec) {
    return (
      <div className="stack">
        {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}
        <div className="muted small">Loading…</div>
        <button className="btn btn--outline" onClick={() => nav("/admin/queue")}>Back</button>
      </div>
    );
  }

  async function logDispenseTransactions(items, recCtx) {
    if (!items.length) return;
    const { data: sess } = await supabase.auth.getSession();
    const staff_id = sess?.session?.user?.id ?? null;

    for (const it of items) {
      let dosage_form = it.medicine_type || null;

      if (!dosage_form) {
        const { data: cat } = await supabase
          .from("medicine_catalog")
          .select("dosage_form")
          .eq("classification", it.classification)
          .eq("medicine_name", it.name)
          .maybeSingle();

        if (cat?.dosage_form) dosage_form = cat.dosage_form;
        else {
          const { data: invLot } = await supabase
            .from("medicine_inventory")
            .select("dosage_form")
            .eq("classification", it.classification)
            .eq("medicine_name", it.name)
            .gte("expiration_date", manilaDate)
            .order("expiration_date", { ascending: true })
            .limit(1)
            .maybeSingle();
          dosage_form = invLot?.dosage_form ?? null;
        }
      }

      await supabase.from("medicine_transactions").insert({
        direction: "out",
        classification: it.classification,
        medicine_name: it.name,
        dosage_form,
        quantity: Number(it.qty) || 0,
        record_id: recCtx.record_id,
        patient_id: recCtx.patient_id,
        staff_id,
        note: "Distributed via AdminChartView",
      });
    }
  }

  return (
    <div className="stack pt-1">
      {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}
      <button
        onClick={() => nav("/admin/queue")}
        style={{ color: "black", border: "1px solid black", padding: "4px", width: "140px" }}
      >
        back
      </button>

      {/* ====== Main Day Chart ====== */}
      {docView === "none" && (
        <div className="stack">
          <PatientHeader patient={activeWithDisplays} />
          <div className="grid-2">
            <div className="panel">
              <div className="panel__title">Doctor’s Notes</div>

              <div className="small muted" style={{ marginBottom: 6 }}>Assessment / Diagnosis</div>
              <textarea
                className="textarea"
                placeholder="e.g., Acute sinusitis"
                value={docAssessment}
                onChange={(e) => setDocAssessment(e.target.value)}
              />

              <div className="small muted" style={{ marginTop: 10, marginBottom: 6 }}>Management</div>
              <textarea
                className="textarea"
                placeholder="e.g., Amoxicillin 500 mg PO TID x 7 days; hydration; rest"
                value={docManagement}
                onChange={(e) => setDocManagement(e.target.value)}
              />
            </div>

            <NurseBlock record={rec} />
          </div>

          {/* ====== MEDICINE SECTION ====== */}
          <div className="panel">
            <div className="panel__title">Medicine</div>
            <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>Medicine Consumption</div>

            <div className="stack" style={{ alignItems: "stretch" }}>
              {/* Distributed */}
              <div className="card card--form" style={{ marginTop: 8 }}>
                <h4 className="card__title">Medicine Distributed</h4>

                {distRows.map((row, i) => (
                  <div className="grid" key={`dist-${i}`} style={{ alignItems: "end" }}>
                    <div className="field">
                      <label className="label">Medicine Classification</label>
                      <select
                        className="input"
                        value={row.classification}
                        onChange={(e) => updateDistRow(i, { classification: e.target.value })}
                      >
                        <option value="">Select classification</option>
                        {classifications.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Medicine Name</label>
                      <select
                        className="input"
                        value={row.name}
                        onChange={(e) => updateDistRow(i, { name: e.target.value })}
                        disabled={!row.classification}
                      >
                        <option value="">{row.classification ? "Select medicine" : "Select classification first"}</option>
                        {namesForClass(row.classification).map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Dosage</label>
                      <input
                        className="input"
                        placeholder="e.g. 500mg"
                        value={row.dosage}
                        onChange={(e) => updateDistRow(i, { dosage: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      <label className="label">Medicine Type</label>
                      <select
                        className="input"
                        value={row.medicine_type}
                        onChange={(e) => updateDistRow(i, { medicine_type: e.target.value })}
                      >
                        <option value="">Select type</option>
                        <option value="capsule">capsule</option>
                        <option value="tablet">tablet</option>
                        <option value="syrup">syrup</option>
                        <option value="suspension">suspension</option>
                        <option value="drop">drop</option>
                        <option value="ointment">ointment</option>
                        <option value="cream">cream</option>
                        <option value="injection">injection</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="input"
                        value={row.qty}
                        onChange={(e) => updateDistRow(i, { qty: e.target.value })}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: "1 / -2" }}>
                      <label className="label">Sig</label>
                      <textarea
                        className="textarea"
                        placeholder="e.g. 1 tab every 12 hrs for pain"
                        value={row.sig}
                        onChange={(e) => updateDistRow(i, { sig: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      {distRows.length > 1 && (
                        <button type="button" className="btn btn--outline" onClick={() => removeDistRow(i)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn--orange" onClick={addAllDistributedToList}>
                    Add to List
                  </button>
                </div>
              </div>

              {/* Prescribed */}
              <div className="card card--form" style={{ marginTop: 12 }}>
                <h4 className="card__title">Medicine Prescribed</h4>
                {rxRows.map((row, i) => (
                  <div className="grid" key={`rx-${i}`} style={{ alignItems: "end" }}>
                    <div className="field">
                      <label className="label">Medicine Classification</label>
                      <select
                        className="input"
                        value={row.classification}
                        onChange={(e) => updateRxRow(i, { classification: e.target.value })}
                      >
                        <option value="">Select classification</option>
                        {classifications.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Medicine Name</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select
                          className="input"
                          value={row.nameMode === "dropdown" ? row.name : ""}
                          onChange={(e) => updateRxRow(i, { nameMode: "dropdown", name: e.target.value })}
                          disabled={row.nameMode !== "dropdown"}
                        >
                          <option value="">{row.classification ? "Select medicine" : "Select classification first"}</option>
                          {namesForClass(row.classification).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn--outline"
                          onClick={() => updateRxRow(i, { nameMode: "manual", name: "" })}
                        >
                          Manual Input
                        </button>
                      </div>
                      {row.nameMode === "manual" && (
                        <input
                          className="input mt-2"
                          placeholder="Type medicine name"
                          value={row.name}
                          onChange={(e) => updateRxRow(i, { name: e.target.value })}
                        />
                      )}
                    </div>

                    <div className="field">
                      <label className="label">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="input"
                        value={row.qty}
                        onChange={(e) => updateRxRow(i, { qty: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      {rxRows.length > 1 && (
                        <button type="button" className="btn btn--outline" onClick={() => removeRxRow(i)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn--orange" onClick={addAllPrescribedToList}>
                    Add to List
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* ====== END MEDICINE SECTION ====== */}

          {/* ====== DOCUMENT REQUESTS ====== */}
          <div className="inline-links">
            <button className="link" onClick={() => setDocView("referral")}>Referral Form</button>
            <button className="link" onClick={() => setDocView("prescription")}>Prescription Sheet</button>
            <button className="link" onClick={() => setDocView("lab")}>Laboratory Request</button>
            <button className="link" onClick={() => setDocView("medcert")}>Medical Certificate</button>
          </div>

          {/* ====== PAST VISITS ====== */}
          <div className="panel" style={{ margin: "10px 20px 0", padding: "12px 16px" }}>
            <div className="panel__title">Past Visits</div>
            {loadingPast && <div className="muted small">Loading…</div>}
            {!loadingPast && past.length === 0 && <div className="muted small">No past records found.</div>}

            {pastView === "menu" && past.map((r) => (
              <div key={r.id} className="past-row">
                <button className="link" onClick={() => { setSelectedPast(r); setPastView("detail"); }}>
                  {fmtDate(r.completed_at || r.visit_date || r.created_at)}
                </button>
                <div className="past-row__doc small">{r.doctor_full_name || "—"}</div>
              </div>
            ))}

            {pastView === "detail" && selectedPast && (
              <PastRecordDetail
                rec={selectedPast}
                active={rec}
                onBack={() => { setPastView("menu"); setSelectedPast(null); }}
                onViewChart={() => setPastView("chart")}
                onViewDocs={() => setPastView("docs")}
              />
            )}

            {pastView === "chart" && selectedPast && (
              <PastChartView rec={selectedPast} active={rec} onBack={() => setPastView("detail")} />
            )}

            {pastView === "docs" && selectedPast && (
              <PastDocumentsView rec={selectedPast} onBack={() => setPastView("detail")} />
            )}
          </div>

          {/* ====== ACTIONS ====== */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", maxWidth: 560, margin: "16px auto 0" }}>
            <button
              className="btn btn--outline"
              style={{ borderColor: "#d33", color: "#d33", minWidth: 180 }}
              onClick={() => {
                if (window.confirm("Discard changes to this chart?")) nav("/admin/queue");
              }}
            >
              Discard
            </button>
            <button
              onClick={() => {
                if (!docAssessment?.trim() || !docManagement?.trim()) {
                  alert("Fill in both Assessment/Diagnosis and Management.");
                  return;
                }
                if (!window.confirm("Finalize this chart?")) return;
                saveChart();
              }}
              disabled={!canSave}
              className="btn btn--primary"
              style={{ minWidth: 180 }}
            >
              {saving ? "Saving…" : "Save Chart"}
            </button>
          </div>
        </div>
      )}

      {/* ====== Document sub-views ====== */}
      {docView === "referral" && (
        <ReferralForm
          active={rec}
          onBack={() => setDocView("none")}
          onSavePdf={async (form) => {
            try {
              if (!window.confirm("Save this referral and open Save as PDF?")) return;
              const filename = `REFERRAL_${rec.family_number}_${fullName(rec)}_${fmtDate(new Date()).replace(/\//g, "-")}.pdf`;
              await supabase.from("record_documents").insert({ record_id: rec.record_id, type: "referral", payload: form, filename });
              setBanner({ type: "ok", msg: "Referral saved. Choose 'Save as PDF' in the dialog." });
              setTimeout(() => window.print(), 150);
            } catch (e) { setBanner({ type: "err", msg: e.message || "Failed to save referral" }); }
          }}
        />
      )}

      {docView === "prescription" && (
        <PrescriptionForm
          active={rec}
          onBack={() => setDocView("none")}
          onSavePdf={async (form) => {
            try {
              if (!window.confirm("Save this prescription and open Save as PDF?")) return;
              const filename = `PRESCRIPTION_${rec.family_number}_${fullName(rec)}_${fmtDate(new Date()).replace(/\//g, "-")}.pdf`;
              await supabase.from("record_documents").insert({ record_id: rec.record_id, type: "prescription", payload: form, filename });
              setBanner({ type: "ok", msg: "Prescription saved. Choose 'Save as PDF' in the dialog." });
              setTimeout(() => window.print(), 150);
            } catch (e) { setBanner({ type: "err", msg: e.message || "Failed to save prescription" }); }
          }}
        />
      )}

      {docView === "lab" && (
        <LabRequestForm
          active={rec}
          onBack={() => setDocView("none")}
          onSavePdf={async (form) => {
            try {
              if (!window.confirm("Save this laboratory request and open Save as PDF?")) return;
              const filename = `LABREQ_${rec.family_number}_${fullName(rec)}_${fmtDate(new Date()).replace(/\//g, "-")}.pdf`;
              await supabase.from("record_documents").insert({ record_id: rec.record_id, type: "lab", payload: form, filename });
              setBanner({ type: "ok", msg: "Laboratory request saved. Choose 'Save as PDF' in the dialog." });
              setTimeout(() => window.print(), 150);
            } catch (e) { setBanner({ type: "err", msg: e.message || "Failed to save laboratory request" }); }
          }}
        />
      )}

      {docView === "medcert" && (
        <MedCertForm
          active={rec}
          onBack={() => setDocView("none")}
          onSavePdf={async (form) => {
            try {
              if (!window.confirm("Save this medical certificate and open Save as PDF?")) return;
              const filename = `MEDCERT_${rec.family_number}_${fullName(rec)}_${fmtDate(new Date()).replace(/\//g, "-")}.pdf`;
              await supabase.from("record_documents").insert({ record_id: rec.record_id, type: "medcert", payload: form, filename });
              setBanner({ type: "ok", msg: "Medical certificate saved. Choose 'Save as PDF' in the dialog." });
              setTimeout(() => window.print(), 150);
            } catch (e) { setBanner({ type: "err", msg: e.message || "Failed to save medical certificate" }); }
          }}
        />
      )}
    </div>
  );
}
