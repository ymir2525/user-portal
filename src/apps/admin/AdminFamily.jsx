// src/apps/admin/AdminFamily.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dateOnly } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import "./AdminFamily.css"; // Link to the new CSS file

export default function AdminFamily() {
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

  // guard: only ADMIN + load family members
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { nav("/login", { replace: true }); return; }

      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("role").eq("id", uid).single();

      if (profErr || !prof || String(prof.role).toUpperCase() !== "ADMIN") {
        await supabase.auth.signOut().catch(()=>{}); 
        nav("/login", { replace: true }); return;
      }

      try {
        setLoading(true); setErr("");
        const { data, error } = await supabase
          .from("patients")
          .select(
            "id, first_name, middle_name, surname, sex, age, birthdate, family_number, created_at, contact_number, contact_person, emergency_contact_name, emergency_relation, address"
          )
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
      <h2 className="page-title--family">Family: {familyNumber}</h2>

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
              <div className="patient-head">
                <div className="patient-name">
                  {patient.first_name} {patient.middle_name ? patient.middle_name + " " : ""}{patient.surname}
                </div>
              </div>

              <div className="patient-meta">
                <div><strong>Birthdate:</strong> {dateOnly(patient.birthdate) || "—"}</div>
                <div><strong>Age:</strong> {computedAge || "—"} yrs old</div>
                <div><strong>Sex:</strong> {patient.sex || "—"}</div>
                <div><strong>Contact Number:</strong> {patient.contact_number || "—"}</div>
                <div className="patient-emergency">
                  <strong>Contact Person:</strong> {patient.emergency_contact_name || "—"}
                  {" "} | <strong>Contact Number:</strong> {patient.contact_person || "—"}
                  {" "} | <strong>Relation:</strong> {patient.emergency_relation || "—"}
                </div>
                <div className="sm:col-span-3" style={{ gridColumn: "1 / -1" }}>
                  <strong>Address:</strong> {patient.address || "—"}
                </div>
                <div className="patient-right">
                  <strong>Fam {patient.family_number || "—"}</strong>
                </div>
              </div>

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

/* PastChartViewLite remains unchanged, as it's already structured */
