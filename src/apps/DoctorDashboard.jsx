// src/pages/DoctorDashboard.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDate, fullName } from "../lib/utils";
import { supabase } from "../lib/supabase";

import PatientHeader from "../components/PatientHeader";
import NurseBlock from "../components/NurseBlock";
import ReferralForm from "../components/ReferralForm";
import PastChartView from "../components/past/PastChartView";
import PastRecordDetail from "../components/past/PastRecordDetail";
import PastDocumentsView from "../components/past/PastDocumentsView";
import MedCertForm from "../components/MedCertForm";
import LabRequestForm from "../components/LabRequestForm";
import PrescriptionForm from "../components/PrescriptionForm";

import "./DoctorD.css"; // <-- external CSS (no Tailwind)

/* ---- helpers to compute display values ---- */
function ageDisplayFromBirthdate(birthdate, fallbackAge) {
  if (!birthdate) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);

  const bd = new Date(birthdate);
  if (isNaN(bd)) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);

  const now = new Date();
  if (bd > now) return "0 months";

  let months = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
  if (now.getDate() < bd.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;

  const years = Math.floor(months / 12);
  return `${years}`;
}

function sexDisplay(sex) {
  if (!sex) return "—";
  const s = String(sex).toUpperCase();
  if (s === "MEN") return "MALE";
  if (s === "WOMEN") return "FEMALE";
  return s; // OTHER or already MALE/FEMALE
}

export default function DoctorDashboard() {
  const nav = useNavigate();

  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("day"); // 'day' | 'past'
  const [banner, setBanner] = useState(null); // {type:'ok'|'err', msg:string}

  const [saving, setSaving] = useState(false);
  const [docNotes, setDocNotes] = useState("");

  const [docView, setDocView] = useState("none"); // 'none'|'referral'|'prescription'|'lab'|'medcert'

  const [past, setPast] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [selectedPast, setSelectedPast] = useState(null);
  const [pastView, setPastView] = useState("menu"); // 'menu'|'detail'|'chart'|'docs'

  // ---- AUTH GUARD (doctor only) ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { nav("/login", { replace: true }); return; }

      const { data: prof, error } = await supabase
        .from("profiles").select("firstname,surname,role").eq("id", uid).single();

      if (error || !prof || String(prof.role).toUpperCase() !== "DOCTOR") {
        await supabase.auth.signOut().catch(()=>{});
        nav("/login", { replace: true });
        return;
      }

      if (mounted) setLoading(false);
    })();

    return () => { mounted = false; };
  }, [nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(()=>{});
    nav("/login", { replace: true });
  };

  // ---- QUEUE (poll every 15s) ----
  const firstLoadRef = useRef(true);
  const prevQueueRef = useRef([]);

  const equalQueues = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i].record_id !== b[i].record_id) return false;
    return true;
  };

  useEffect(() => {
    let stop = false;

    async function fetchQueue() {
      try {
        const { data, error } = await supabase
          .from("patient_records")
          .select(`
            id,
            patient_id,
            created_at,
            visit_date,
            chief_complaint,
            height_cm,
            weight_kg,
            blood_pressure,
            temperature_c,
            status,
            queued,
            patients:patient_id (
              id,
              first_name,
              middle_name,
              surname,
              family_number,
              sex,
              age,
              birthdate,
              contact_number,
              contact_person
            )
          `)
          .or("status.eq.queued,queued.eq.true")
          .order("created_at", { ascending: true });

        if (error) throw error;

        const list = (data || []).map((r) => ({
          record_id: r.id,
          patient_id: r.patient_id,
          family_number: r.patients?.family_number ?? "",
          first_name: r.patients?.first_name ?? "",
          middle_name: r.patients?.middle_name ?? "",
          surname: r.patients?.surname ?? "",
          sex: r.patients?.sex ?? "",
          age: r.patients?.age ?? "",
          birthdate: r.patients?.birthdate ?? null,
          contact_number: r.patients?.contact_number ?? "",
          contact_person: r.patients?.contact_person ?? "",
          height_cm: r.height_cm,
          weight_kg: r.weight_kg,
          blood_pressure: r.blood_pressure,
          temperature_c: r.temperature_c,
          chief_complaint: r.chief_complaint,
        }));

        if (!equalQueues(list, prevQueueRef.current)) {
          prevQueueRef.current = list;
          setQueue(list);
          setActive((prev) => {
            const stillThere = prev && list.find((x) => x.record_id === prev.record_id);
            return stillThere ? prev : list[0] || null;
          });
        }
      } catch (e) {
        console.error(e);
        setBanner({ type: "err", msg: e.message || "Failed to load queue" });
      } finally {
        if (firstLoadRef.current) {
          firstLoadRef.current = false;
          setLoading(false);
        }
      }
    }

    fetchQueue();
    const id = setInterval(fetchQueue, 15000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    setDocNotes("");
    setDocView("none");
  }, [active?.record_id]);

  // ---- SAVE CHART (complete record) ----
  const saveChart = async () => {
    if (!active) return;

    try {
      setSaving(true);
      setBanner(null);

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;

      const { data: me } = await supabase
        .from("profiles")
        .select("firstname,surname")
        .eq("id", uid)
        .single();

      const doctor_full_name = me ? `${me.firstname ?? ""} ${me.surname ?? ""}`.trim() : null;

      const { error } = await supabase
        .from("patient_records")
        .update({
          doctor_notes: docNotes || null,
          doctor_id: uid,
          doctor_full_name,
          status: "completed",
          completed_at: new Date().toISOString(),
          queued: false,
        })
        .eq("id", active.record_id);

      if (error) throw error;

      // NOTE: Do NOT touch patients.queued / patients.queued_at anymore.
      // That way AdminDashboard's "Total Check Up (today)" never decrements.

      setQueue((q) => q.filter((x) => x.record_id !== active.record_id));
      setActive(null);
      setBanner({ type: "ok", msg: "Chart saved. Patient removed from queue." });

      if (tab === "past") await loadPastRecords();
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!docNotes || !docNotes.trim()) {
      alert("Please enter the Doctor’s Notes before saving.");
      return;
    }
    const ok = window.confirm(
      "Finalize this chart? Make sure the Doctor’s Notes are complete. Click OK to save or Cancel to go back."
    );
    if (!ok) return;
    saveChart();
  };

  const canSave = !!docNotes?.trim() && !saving;

  // ---- PAST RECORDS ----
  const loadPastRecords = async () => {
    if (!active) return;
    try {
      setLoadingPast(true);
      setSelectedPast(null);
      setPastView("menu");

      const { data, error } = await supabase
        .from("patient_records")
        .select("*")
        .eq("patient_id", active.patient_id)
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
  };

  useEffect(() => {
    if (tab === "past" && active?.patient_id) void loadPastRecords();
  }, [tab, active?.patient_id]); // eslint-disable-line

  async function saveRecordDocument(recordId, type, payload, filename, url) {
    const { error } = await supabase
      .from("record_documents")
      .insert({
        record_id: recordId,
        type,
        payload: payload ?? {},
        filename: filename || null,
        url: url || null,
      });
    if (error) throw error;
  }

  const makeName = (p, prefix, dateStr) => {
    const clean = (s) => String(s || "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_.-]/g, "");
    const name = clean(fullName(p)) || "patient";
    const fam = clean(p.family_number) || "fam";
    const dt = (dateStr || fmtDate(new Date())).replace(/\//g, "-");
    return `${prefix}_${fam}_${name}_${dt}.pdf`;
  };
  const makeReferralFilename = (p, d) => makeName(p, "REFERRAL", d);
  const makePrescriptionFilename = (p, d) => makeName(p, "PRESCRIPTION", d);
  const makeLabReqFilename = (p, d) => makeName(p, "LABREQ", d);
  const makeMedCertFilename = (p, d) => makeName(p, "MEDCERT", d);

  // ---- compute display fields for the active patient ----
  const activeWithDisplays = active
    ? {
        ...active,
        age_display: ageDisplayFromBirthdate(active.birthdate, active.age),
        sex_display: sexDisplay(active.sex),
      }
    : null;

  return (
    <div className="docdash layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__title">Caybiga Health Center</div>
        <button onClick={logout} className="link link--small">Log Out</button>
      </header>

      {/* Queue */}
      <aside className="sidebar">
        <div className="sidebar__title">Queue</div>
        {loading && <div className="muted small">Loading…</div>}
        {!loading && queue.length === 0 && <div className="muted small">No patients in queue.</div>}
        <div className="sidebar__list">
          {queue.map((q) => (
            <button
              key={q.record_id}
              onClick={() => { setActive(q); setTab("day"); setDocView("none"); }}
              className={`queue-item ${active?.record_id === q.record_id ? "queue-item--active" : ""}`}
            >
              <div className="queue-item__fam muted small">{q.family_number}</div>
              <div className="queue-item__name">{fullName(q)}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${tab === "day" ? "tab--active" : ""}`}
            onClick={() => setTab("day")}
          >
            Day Chart
          </button>
          <button
            className={`tab ${tab === "past" ? "tab--active" : ""}`}
            onClick={() => setTab("past")}
          >
            Past Records
          </button>
        </div>

        {banner && (
          <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>
            {banner.msg}
          </div>
        )}

        {/* DAY CHART */}
        {tab === "day" && (
          <>
            {!active && <div className="muted small text-center">Pick a patient from the left queue.</div>}

            {active && docView === "none" && (
              <div className="stack">
                <PatientHeader patient={activeWithDisplays} />
                <div className="grid-2">
                  <div className="panel">
                    <div className="panel__title">Doctor’s Notes:</div>
                    <textarea
                      className="textarea"
                      placeholder="Enter findings, assessment, and plan here…"
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                    />
                  </div>
                  <NurseBlock record={active} />
                </div>

                <div className="inline-links">
                  <button className="link" onClick={() => setDocView("referral")}>Referral Form</button>
                  <button className="link" onClick={() => setDocView("prescription")}>Prescription Sheet</button>
                  <button className="link" onClick={() => setDocView("lab")}>Laboratory Request</button>
                  <button className="link" onClick={() => setDocView("medcert")}>Medical Certificate</button>
                </div>

                <div className="pt-1">
                  <button
                    onClick={handleSaveClick}
                    disabled={!canSave}
                    className="btn btn--primary-wide"
                    title={!docNotes?.trim() ? "Enter Doctor’s Notes to enable saving" : ""}
                    aria-disabled={!canSave}
                  >
                    {saving ? "Saving…" : "Save Chart"}
                  </button>
                </div>
              </div>
            )}

            {active && docView === "referral" && (
              <ReferralForm
                active={active}
                onBack={() => setDocView("none")}
                onSavePdf={async (form) => {
                  try {
                    if (!window.confirm("Save this referral and open Save as PDF?")) return;
                    const filename = makeReferralFilename(active, form.date);
                    await saveRecordDocument(active.record_id, "referral", form, filename, null);
                    setBanner({ type: "ok", msg: "Referral saved. Choose 'Save as PDF' in the dialog." });
                    setTimeout(() => window.print(), 150);
                  } catch (e) {
                    setBanner({ type: "err", msg: e.message || "Failed to save referral" });
                  }
                }}
              />
            )}

            {active && docView === "prescription" && (
              <PrescriptionForm
                active={active}
                onBack={() => setDocView("none")}
                onSavePdf={async (form) => {
                  try {
                    if (!window.confirm("Save this prescription and open Save as PDF?")) return;
                    const filename = makePrescriptionFilename(active, form.date);
                    await saveRecordDocument(active.record_id, "prescription", form, filename, null);
                    setBanner({ type: "ok", msg: "Prescription saved. Choose 'Save as PDF' in the dialog." });
                    setTimeout(() => window.print(), 150);
                  } catch (e) {
                    setBanner({ type: "err", msg: e.message || "Failed to save prescription" });
                  }
                }}
              />
            )}

            {active && docView === "lab" && (
              <LabRequestForm
                active={active}
                onBack={() => setDocView("none")}
                onSavePdf={async (form) => {
                  try {
                    if (!window.confirm("Save this laboratory request and open Save as PDF?")) return;
                    const filename = makeLabReqFilename(active, form.date);
                    await saveRecordDocument(active.record_id, "lab", form, filename, null);
                    setBanner({ type: "ok", msg: "Laboratory request saved. Choose 'Save as PDF' in the dialog." });
                    setTimeout(() => window.print(), 150);
                  } catch (e) {
                    setBanner({ type: "err", msg: e.message || "Failed to save laboratory request" });
                  }
                }}
              />
            )}

            {active && docView === "medcert" && (
              <MedCertForm
                active={active}
                onBack={() => setDocView("none")}
                onSavePdf={async (form) => {
                  try {
                    if (!window.confirm("Save this medical certificate and open Save as PDF?")) return;
                    const filename = makeMedCertFilename(active, form.date);
                    await saveRecordDocument(active.record_id, "medcert", form, filename, null);
                    setBanner({ type: "ok", msg: "Medical certificate saved. Choose 'Save as PDF' in the dialog." });
                    setTimeout(() => window.print(), 150);
                  } catch (e) {
                    setBanner({ type: "err", msg: e.message || "Failed to save medical certificate" });
                  }
                }}
              />
            )}
          </>
        )}

        {/* PAST RECORDS */}
        {tab === "past" && (
          <div className="stack">
            {!active && <div className="muted small">Select a patient from the queue first.</div>}

            {active && pastView === "menu" && (
              <div className="stack">
                {loadingPast && <div className="muted small">Loading…</div>}
                {!loadingPast && past.length === 0 && <div className="muted small">No past records found.</div>}
                {past.map((r) => (
                  <div key={r.id} className="past-row">
                    <button className="link" onClick={() => { setSelectedPast(r); setPastView("detail"); }}>
                      {fmtDate(r.completed_at || r.visit_date || r.created_at)}
                    </button>
                    <div className="past-row__doc small">{r.doctor_full_name || "—"}</div>
                  </div>
                ))}
              </div>
            )}

            {active && pastView === "detail" && selectedPast && (
              <PastRecordDetail
                rec={selectedPast}
                active={active}
                onBack={() => { setPastView("menu"); setSelectedPast(null); }}
                onViewChart={() => setPastView("chart")}
                onViewDocs={() => setPastView("docs")}
              />
            )}

            {active && pastView === "chart" && selectedPast && (
              <PastChartView
                rec={selectedPast}
                active={active}
                onBack={() => setPastView("detail")}
              />
            )}

            {active && pastView === "docs" && selectedPast && (
              <PastDocumentsView
                rec={selectedPast}
                onBack={() => setPastView("detail")}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
