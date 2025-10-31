// src/apps/doctor/DoctorQueueChart.jsx
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
import "./doctorDash.css";

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

export default function DoctorQueueChart() {
  const nav = useNavigate();
  const { recordId } = useParams();

  const [banner, setBanner] = useState(null);
  const [rec, setRec] = useState(null);
  const [tab, setTab] = useState("day"); // 'day' | 'past'
  const [docView, setDocView] = useState("none"); // 'none'|'referral'|'prescription'|'lab'|'medcert'
  const [saving, setSaving] = useState(false);

  // notes
  const [docAssessment, setDocAssessment] = useState("");
  const [docManagement, setDocManagement] = useState("");

  // INVENTORY-ONLY sources (non-expired)
  const [classifications, setClassifications] = useState([]);           // unique classification
  const [namesByClass, setNamesByClass] = useState(new Map());          // class -> Set(medicine_name)

  // Distributed (multiple rows)
  const [distRows, setDistRows] = useState([{ classification: "", name: "", qty: "" }]);

  // Prescribed (multiple rows; manual name allowed)
  const [rxRows, setRxRows] = useState([
    { classification: "", name: "", qty: "", nameMode: "dropdown" },
  ]);

  // Preview lists
  const [distributedList, setDistributedList] = useState([]); // {classification, name, qty}
  const [prescribedList, setPrescribedList] = useState([]);   // {classification, name, qty}

  // past
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
      const { data, error } = await supabase
        .from("patient_records")
        .select(`
          *, 
          patients:patient_id (
            id, first_name, middle_name, surname, family_number,
            sex, age, birthdate, contact_number, contact_person
          )
        `)
        .eq("id", recordId)
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
        contact_person: data.patients?.contact_person ?? "",
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
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to load chart" });
    }
  }, [recordId]);

  /* ---------- load medicines from inventory (non-expired) ---------- */
  const loadMedicines = useCallback(async () => {
    try {
      const { data: inv, error } = await supabase
        .from("medicine_inventory")
        .select("classification, medicine_name, quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      if (error) throw error;

      const classSet = new Set();
      const map = new Map(); // class -> Set(names)
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

  /* ---------- past records ---------- */
  const loadPastRecords = useCallback(async () => {
    if (!rec) return;
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
  }, [rec]);
  useEffect(() => {
    if (tab === "past" && rec?.patient_id) void loadPastRecords();
  }, [tab, rec?.patient_id, loadPastRecords]);

  /* ---------- helpers ---------- */
  const namesForClass = (cls) => Array.from(namesByClass.get(cls) || []).sort((a, b) => a.localeCompare(b));

  // Distributed row helpers
  const addDistRow = () => setDistRows((rows) => [...rows, { classification: "", name: "", qty: "" }]);
  const updateDistRow = (i, patch) =>
    setDistRows((rows) =>
      rows.map((r, idx) =>
        idx === i ? { ...r, ...patch, ...(patch.classification ? { name: "" } : null) } : r
      )
    );
  const removeDistRow = (i) =>
    setDistRows((rows) => (rows.length === 1 ? [{ classification: "", name: "", qty: "" }] : rows.filter((_, idx) => idx !== i)));

  // Prescribed row helpers
  const addRxRow = () =>
    setRxRows((rows) => [...rows, { classification: "", name: "", qty: "", nameMode: "dropdown" }]);
  const updateRxRow = (i, patch) =>
    setRxRows((rows) =>
      rows.map((r, idx) =>
        idx === i
          ? { ...r, ...patch, ...(patch.classification ? { name: "", nameMode: r.nameMode } : null) }
          : r
      )
    );
  const removeRxRow = (i) =>
    setRxRows((rows) =>
      rows.length === 1 ? [{ classification: "", name: "", qty: "", nameMode: "dropdown" }] : rows.filter((_, idx) => idx !== i)
    );

  // Add to preview
  const addAllDistributedToList = () => {
    const valid = distRows.filter(
      (r) => r.classification && r.name && Number(r.qty) > 0 && Number.isFinite(Number(r.qty))
    );
    if (!valid.length) {
      alert("Complete at least one distributed medicine row (classification, name, positive quantity).");
      return;
    }
    setDistributedList((prev) => [...prev, ...valid.map((r) => ({ ...r, qty: Number(r.qty) }))]);
    setDistRows([{ classification: "", name: "", qty: "" }]);
  };
  const addAllPrescribedToList = () => {
    const valid = rxRows.filter(
      (r) => r.classification && r.name && Number(r.qty) > 0 && Number.isFinite(Number(r.qty))
    );
    if (!valid.length) {
      alert("Complete at least one prescribed medicine row (classification, name, positive quantity).");
      return;
    }
    setPrescribedList((prev) => [...prev, ...valid.map((r) => ({ ...r, qty: Number(r.qty) }))]);
    setRxRows([{ classification: "", name: "", qty: "", nameMode: "dropdown" }]);
  };
  const removePreviewItem = (kind, idx) => {
    if (kind === "dist") setDistributedList((arr) => arr.filter((_, i) => i !== idx));
    else setPrescribedList((arr) => arr.filter((_, i) => i !== idx));
  };

  const handlePrintPreview = () => window.print();

  /* ---------- save chart ---------- */
  const canSave = !!docAssessment?.trim() && !!docManagement?.trim() && !saving;

  async function saveMedicinesDocument(record_id) {
    const payload = { distributed: distributedList, prescribed: prescribedList };
    const { error } = await supabase.from("record_documents").insert({ record_id, type: "medicines", payload });
    if (error) throw error;
  }

  // decrement inventory FIFO by (classification + medicine_name) and soonest expiry
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

  const saveChart = async () => {
    if (!rec) return;
    try {
      setSaving(true);
      setBanner(null);

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      const { data: me } = await supabase.from("profiles").select("firstname,surname").eq("id", uid).single();
      const doctor_full_name = me ? `${me.firstname ?? ""} ${me.surname ?? ""}`.trim() : null;

      const combinedNotes =
        `Assessment / Diagnosis:\n${(docAssessment || "").trim()}\n\n` +
        `Management:\n${(docManagement || "").trim()}`;

      // 1) save patient record
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
        .eq("id", rec.record_id);
      if (upErr) throw upErr;

      // 2) save medicines doc
      await saveMedicinesDocument(rec.record_id);

      // 3) decrement inventory for distributed only
      await decrementInventoryForDistributed(distributedList);
      await logDispenseTransactions(distributedList, rec);  
      setBanner({ type: "ok", msg: "Chart saved. Inventory updated and medicines recorded." });
      nav("/doctor/queue");
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
        <button className="btn btn--outline" onClick={() => nav("/doctor/queue")}>Back</button>
      </div>
    );
  }
async function logDispenseTransactions(items, rec) {
  if (!items.length) return;
  const { data: sess } = await supabase.auth.getSession();
  const staff_id = sess?.session?.user?.id ?? null;

  for (const it of items) {
    // Try to infer dosage_form from catalog first, else from non-expired inventory lot
    let dosage_form = null;

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

    await supabase.from("medicine_transactions").insert({
      direction: "out",
      classification: it.classification,
      medicine_name: it.name,
      dosage_form,
      quantity: Number(it.qty) || 0,
      record_id: rec.record_id,
      patient_id: rec.patient_id,
      staff_id,
      note: "Distributed via DoctorQueueChart",
    });
  }
}

  return (
    <div className="stack pt-1">
      {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}
      <button
        onClick={() => nav("/doctor/queue")}
        style={{ color: "black", border: "1px solid black", padding: "4px", width: "140px" }}
      >
        back
      </button>

      <div className="tabs">
        <button className={`tab ${tab === "day" ? "tab--active" : ""}`} onClick={() => setTab("day")}>Day Chart</button>
        <button className={`tab ${tab === "past" ? "tab--active" : ""}`} onClick={() => setTab("past")}>Past Records</button>
      </div>

      {tab === "day" && (
        <>
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

              {/* ====== MEDICINE SECTION (Inventory-like layout) ====== */}
              <div className="panel">
                <div className="panel__title">Medicine</div>
                <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>Medicine Consumption</div>

                {/* Two-column: left forms, right preview */}
                <div className="grid-2" style={{ alignItems: "start" }}>
                  {/* LEFT: forms */}
                  <div className="stack">
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
                        <button type="button" className="btn btn--outline" onClick={addDistRow}>
                          + Add another medicine
                        </button>
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
                        <button type="button" className="btn btn--outline" onClick={addRxRow}>
                          + Add another medicine
                        </button>
                        <button type="button" className="btn btn--orange" onClick={addAllPrescribedToList}>
                          Add to List
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: preview */}
                  <div className="card" style={{ marginTop: 8 }}>
                    <h4 className="card__title">Medicine Preview</h4>

                    {/* Distributed table */}
                    <h5 className="small" style={{ marginTop: 6, marginBottom: 4 }}>Distributed</h5>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Classification</th>
                            <th>Medicine Name</th>
                            <th>Quantity</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {distributedList.length ? (
                            distributedList.map((item, i) => (
                              <tr key={`drow-${i}`} className={i % 2 ? "is-even" : "is-odd"}>
                                <td>{item.classification}</td>
                                <td>{item.name}</td>
                                <td>{item.qty}</td>
                                <td>
                                  <button className="btn btn--outline" onClick={() => removePreviewItem("dist", i)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="table-empty">No distributed medicines added.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Prescribed table */}
                    <h5 className="small" style={{ marginTop: 12, marginBottom: 4 }}>Prescribed</h5>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Classification</th>
                            <th>Medicine Name</th>
                            <th>Quantity</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {prescribedList.length ? (
                            prescribedList.map((item, i) => (
                              <tr key={`prow-${i}`} className={i % 2 ? "is-even" : "is-odd"}>
                                <td>{item.classification}</td>
                                <td>{item.name}</td>
                                <td>{item.qty}</td>
                                <td>
                                  <button className="btn btn--outline" onClick={() => removePreviewItem("rx", i)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="table-empty">No prescribed medicines added.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn--outline" onClick={handlePrintPreview}>
                        Download PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* ====== END MEDICINE SECTION ====== */}

              <div className="inline-links">
                <button className="link" onClick={() => setDocView("referral")}>Referral Form</button>
                <button className="link" onClick={() => setDocView("prescription")}>Prescription Sheet</button>
                <button className="link" onClick={() => setDocView("lab")}>Laboratory Request</button>
                <button className="link" onClick={() => setDocView("medcert")}>Medical Certificate</button>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => {
                    if (!docAssessment?.trim() || !docManagement?.trim()) {
                      alert("Fill in both Assessment/Diagnosis and Management.");
                      return;
                    }
                    if (!window.confirm("Finalize this chart?")) return;
                    saveChart();
                  }}
                  disabled={!(!saving && docAssessment?.trim() && docManagement?.trim())}
                  className="btn btn--primary-wide"
                >
                  {saving ? "Saving…" : "Save Chart"}
                </button>
              </div>
            </div>
          )}

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
        </>
      )}

      {tab === "past" && (
        <div className="stack">
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
      )}
    </div>
  );
}
 