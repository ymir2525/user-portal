import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dateOnly } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import "./doctorDash.css";

export default function DoctorFamily() {
  const { familyNumber } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [members, setMembers] = useState([]);

  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);

  // views: list | chart
  const [pastView, setPastView] = useState("list");
  const [selectedPast, setSelectedPast] = useState(null);

  // guard: only DOCTOR + load family members
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { nav("/login", { replace: true }); return; }

      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("role").eq("id", uid).single();

      if (profErr || !prof || String(prof.role).toUpperCase() !== "DOCTOR") {
        await supabase.auth.signOut().catch(()=>{});
        nav("/login", { replace: true }); return;
      }

      try {
        setLoading(true); setErr("");
        const { data, error } = await supabase
          .from("patients")
          .select("id, first_name, middle_name, surname, sex, age, birthdate, family_number, created_at, contact_number, contact_person, emergency_contact_name, emergency_relation, address")
          .eq("family_number", familyNumber)
          .order("created_at", { ascending: false });

        if (!mounted) return;
        if (error) throw error;

        setMembers(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setErr(e.message || "Failed to load family");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [familyNumber, nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(()=>{});
    nav("/login", { replace: true });
  };

  // Load one patient + past records
  const openPatient = async (patientId) => {
    try {
      setLoading(true); setErr("");

      const [{ data: p, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).single(),
        supabase.from("patient_records")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;

      setPatient(p);
      setRecords(Array.isArray(recs) ? recs : []);
      setPastView("list");
      setSelectedPast(null);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load patient");
    } finally {
      setLoading(false);
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

  return (
    <div className="family-page">
      <h2 className="page-title page-title--family">Family: {familyNumber}</h2>

      {loading && <div className="status status--loading">Loading…</div>}
      {err && <div className="error-text text-center">{err}</div>}

      {!loading && !err && (
        <>
          {!patient && (
            <div className="member-list">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openPatient(m.id)}
                  className="member-card"
                >
                  <div className="member-card__row">
                    <div className="member-card__main">
                      <span className="member-card__name">
                        {m.first_name} {m.middle_name ? `${m.middle_name} ` : ""}{m.surname}
                      </span>
                      <span className="member-card__meta">
                        {" "}• {m.sex} • {m.age} Years Old
                      </span>
                    </div>
                    <div className="member-card__date">{dateOnly(m.birthdate)}</div>
                  </div>
                </button>
              ))}

              {members.length === 0 && (
                <div className="empty">No members found.</div>
              )}
            </div>
          )}

          {patient && (
            <div className="patient-wrap">
              {/* header (NO "+ New Record" button for doctor) */}
              <div className="patient-head">
                <div className="patient-name">
                  {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}
                </div>
              </div>

              {/* Meta summary */}
              <div className="patient-meta">
                <div><strong>Birthdate:</strong> {dateOnly(patient.birthdate) || "—"}</div>
                <div><strong>Age:</strong> {computedAge || "—"} yrs old</div>
                <div><strong>Sex:</strong> {patient.sex || "—"}</div>
                <div><strong>Contact Number:</strong> {patient.contact_number || "—"}</div>
                <div><strong>Address:</strong> {patient.address || "—"}</div>
                <div className="patient-emergency">
                  <strong>Contact Person:</strong> {patient.emergency_contact_name || "—"}
                  {" "} | <strong>Contact Number:</strong> {patient.contact_person || "—"}
                  {" "} | <strong>Relation:</strong> {patient.emergency_relation || "—"}
                </div>
                <div className="patient-right">
                  <strong>Fam {patient.family_number || "—"}</strong>
                </div>
              </div>

              {/* Past Records (click -> auto Chart view) */}
              {pastView === "list" && (
                <>
                  <div className="subhead">Past Records</div>
                  <div className="record-list">
                    {records.length === 0 && (
                      <div className="empty">No past records found.</div>
                    )}
                    {records.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedPast(r); setPastView("chart"); }}
                        className="record-item"
                      >
                        <div className="record-item__title">
                          {dateOnly(r.completed_at || r.visit_date || r.created_at)}
                        </div>
                        <div className="record-item__meta">
                          H: {r.height_cm ?? "—"} cm • W: {r.weight_kg ?? "—"} kg • BP: {r.blood_pressure ?? "—"} •
                          Temp: {r.temperature_c ?? "—"} °C • CC: {r.chief_complaint || "—"}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="actions actions--back">
                    <button
                      onClick={() => { setPatient(null); setSelectedPast(null); setPastView("list"); }}
                      className="btn btn--primary"
                    >
                      Back
                    </button>
                  </div>
                </>
              )}

              {pastView === "chart" && selectedPast && (
                <PastChartViewLite
                  rec={selectedPast}
                  patient={patient}
                  onBack={() => setPastView("list")}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Auto-open Chart view (includes Document Request + PDF Download) ---------- */
function PastChartViewLite({ rec, patient, onBack }) {
  const printRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsErr, setDocsErr] = useState("");

  // load documents for the record (shown under chart)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingDocs(true); setDocsErr("");
        const { data, error } = await supabase
          .from("record_documents")
          .select("*")
          .eq("record_id", rec.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (mounted) setDocs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mounted) setDocsErr(e.message || "Failed to load documents");
      } finally {
        if (mounted) setLoadingDocs(false);
      }
    })();
    return () => { mounted = false; };
  }, [rec.id]);

  const downloadAsPDF = () => {
    // Simple, dependency-free approach using the browser print-to-PDF
    const node = printRef.current;
    if (!node) return;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const style = `
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; }
        h1,h2,h3 { margin: 0 0 8px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
        .card__title { font-weight: 600; margin-bottom: 6px; }
        .muted { color: #6b7280; }
        .doc-row { display:flex; justify-content: space-between; border-top: 1px dashed #e5e7eb; padding: 8px 0; }
        .doc-row:first-child { border-top: 0; }
      </style>
    `;

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Chart</title>${style}</head><body>${node.innerHTML}</body></html>`);
    win.document.close();
    // Give the new doc a tick to render before printing
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 150);
  };

  return (
    <div className="past past--chart">
      <div className="past-head">
        <h3 className="subhead">Chart – {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</h3>
        <button onClick={onBack} className="btn btn--light">Back</button>
      </div>

      <div ref={printRef}>
        {/* Header details inside printable area */}
        <div className="past-meta" style={{ marginBottom: 12 }}>
          <div><strong>Patient Name:</strong> {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}</div>
            <div><strong>Address:</strong> {patient.address || "—"}</div> {/* ← add this */}
          <div><strong>Doctor in Charge:</strong> {rec.doctor_full_name || "—"}</div>
          <div><strong>Date:</strong> {dateOnly(rec.completed_at || rec.visit_date || rec.created_at)}</div>
        </div>

        <div className="grid grid--two">
          <div className="card">
            <div className="card__title">Nurse Vitals</div>
            <div>Height: {rec.height_cm ?? "—"} cm</div>
            <div>Weight: {rec.weight_kg ?? "—"} kg</div>
            <div>BP: {rec.blood_pressure ?? "—"}</div>
            <div>Temperature: {rec.temperature_c ?? "—"} °C</div>
            <div>Chief Complaint: {rec.chief_complaint || "—"}</div>
          </div>
          <div className="card">
            <div className="card__title">Doctor’s Notes</div>
            <div className="prewrap">{rec.doctor_notes || "—"}</div>
            <div className="muted small">Doctor: {rec.doctor_full_name || "—"}</div>
          </div>
        </div>

        {/* Document Request section lives WITHIN the Chart view now */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card__title">Document Request</div>
          {loadingDocs && <div className="status status--loading">Loading…</div>}
          {docsErr && <div className="error-text">{docsErr}</div>}
          {!loadingDocs && !docsErr && (
            <div>
              {docs.length === 0 && <div className="muted">No documents saved for this record.</div>}
              {docs.map(d => (
                <div key={d.id} className="doc-row">
                  <div>
                    {d.type} <span className="doc-row__meta">• {new Date(d.created_at).toLocaleString()}</span>
                  </div>
                  <div>
                    {d.url
                      ? <a className="link" href={d.url} target="_blank" rel="noreferrer">open file</a>
                      : "no file URL"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions under printable area */}
      <div className="past-actions" style={{ marginTop: 12 }}>
        <button
        onClick={downloadAsPDF}
        className="btn btn--accent-block"
        style={{
          border: '2px solid #22c55e',
          color: '#16a34a',
          background: '#ffffff',
          borderRadius: 12,
          fontWeight: 600
        }}
      >
        Download Chart (PDF)
      </button>
      </div>
    </div>
  );
}
