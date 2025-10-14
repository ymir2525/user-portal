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

// ---- helpers to compute display values ----
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
    <div className="min-h-screen flex">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-12 bg-orange-500 text-white flex items-center justify-between px-4 z-40">
        <div className="font-semibold">Caybiga Health Center</div>
        <button onClick={logout} className="text-sm hover:opacity-90">Log Out</button>
      </header>

      {/* Queue */}
      <aside className="w-64 bg-orange-100 border-r border-orange-200 pt-16 p-3 min-h-screen">
        <div className="font-medium text-sm mb-2">Queue</div>
        {loading && <div className="text-xs text-gray-600">Loading…</div>}
        {!loading && queue.length === 0 && <div className="text-xs text-gray-500">No patients in queue.</div>}
        <div className="space-y-2">
          {queue.map((q) => (
            <button
              key={q.record_id}
              onClick={() => { setActive(q); setTab("day"); setDocView("none"); }}
              className={`w-full text-left px-3 py-2 rounded border bg-white hover:bg-orange-50 ${
                active?.record_id === q.record_id ? "border-orange-400" : "border-orange-200"
              }`}
            >
              <div className="text-xs text-gray-500">{q.family_number}</div>
              <div className="font-medium">{fullName(q)}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 pt-16 p-6 bg-white">
        {/* Tabs */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            className={`text-center rounded py-2 text-sm ${tab === "day" ? "bg-orange-500 text-white" : "bg-orange-100 border border-orange-200"}`}
            onClick={() => setTab("day")}
          >
            Day Chart
          </button>
          <button
            className={`text-center rounded py-2 text-sm ${tab === "past" ? "bg-orange-500 text-white" : "bg-orange-100 border border-orange-200"}`}
            onClick={() => setTab("past")}
          >
            Past Records
          </button>
        </div>

        {banner && (
          <div className={`mb-3 text-sm p-2 rounded ${banner.type === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {banner.msg}
          </div>
        )}

        {/* DAY CHART */}
        {tab === "day" && (
          <>
            {!active && <div className="text-sm text-gray-500 text-center">Pick a patient from the left queue.</div>}

            {active && docView === "none" && (
              <div className="space-y-4">
                <PatientHeader patient={activeWithDisplays} />
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="border rounded p-3 bg-white">
                    <div className="font-semibold mb-2">Doctor’s Notes:</div>
                    <textarea
                      className="w-full min-h-[180px] border rounded px-3 py-2"
                      placeholder="Enter findings, assessment, and plan here…"
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                    />
                  </div>
                  <NurseBlock record={active} />
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <button className="underline" onClick={() => setDocView("referral")}>Referral Form</button>
                  <button className="underline" onClick={() => setDocView("prescription")}>Prescription Sheet</button>
                  <button className="underline" onClick={() => setDocView("lab")}>Laboratory Request</button>
                  <button className="underline" onClick={() => setDocView("medcert")}>Medical Certificate</button>
                </div>

                <div className="pt-1">
                  <button
                    onClick={handleSaveClick}
                    disabled={!canSave}
                    className="w-full bg-orange-500 text-white rounded py-2 hover:bg-orange-600 disabled:opacity-60"
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
          <div className="space-y-4">
            {!active && <div className="text-sm text-gray-500">Select a patient from the queue first.</div>}

            {active && pastView === "menu" && (
              <div className="space-y-2">
                {loadingPast && <div className="text-sm text-gray-500">Loading…</div>}
                {!loadingPast && past.length === 0 && <div className="text-sm text-gray-500">No past records found.</div>}
                {past.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border rounded px-3 py-2 bg-white hover:bg-orange-50">
                    <button className="underline" onClick={() => { setSelectedPast(r); setPastView("detail"); }}>
                      {fmtDate(r.completed_at || r.visit_date || r.created_at)}
                    </button>
                    <div className="text-sm text-gray-700">{r.doctor_full_name || "—"}</div>
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
