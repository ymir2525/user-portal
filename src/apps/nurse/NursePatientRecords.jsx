import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
// Reuse the exact same registration form/logic from BHW
import PatientRegistration from "../bhw/PatientRegistration";

/* ---------------- Nurse: Patient Records (same logic as BHW) ---------------- */
export default function NursePatientRecords() {
  const [q, setQ] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [items, setItems] = useState([]);
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

  useEffect(() => { void load(); }, [sortAsc]); // eslint-disable-line

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const like = q.trim();
      let query = supabase
        .from("patients")
        // ⬇️ include address so it’s on-hand if you want to show it later
        .select("family_number,surname,address")
        .order("family_number", { ascending: sortAsc });

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
    <section className="patient-records-section">
      <h2 className="section-title">Patient Records</h2>

      <div className="pr-toolbar">
        <div className="pr-left">
          <input
            className="pr-search"
            placeholder="Search by Family No. or Surname..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <button
            className={`btn-outline-blue btn-small ${sortAsc ? "is-active-sort" : ""}`}
            onClick={() => setSortAsc(true)}
            title="Ascending"
          >
            ↑ Ascending
          </button>
          <button
            className={`btn-outline-blue btn-small ${!sortAsc ? "is-active-sort" : ""}`}
            onClick={() => setSortAsc(false)}
            title="Descending"
          >
            ↓ Descending
          </button>
        </div>

        <div className="pr-right">
          <button
            className="btn-outline-blue btn-small"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            className="btn-outline-blue btn-small"
            onClick={() => setShowAdd(true)}
          >
            Add Patient
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="family-list">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`/nurse/family/${encodeURIComponent(row.family_number)}`}
            className="family-list-item"
          >
            {row.family_number} - {row.surname}
          </Link>
        ))}
        {items.length === 0 && !loading && (
          <div className="empty">No families found.</div>
        )}
      </div>

      {showAdd && (
        <div
          className="modal-overlay"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">Patient Registration</div>
              <button className="btn-outline-blue btn-small" onClick={() => setShowAdd(false)}>Close</button>
            </div>

            <div className="modal-body">
              <div className="registration-form-container">
                <PatientRegistration
                  showHeader={false}
                  onDone={() => { setShowAdd(false); void load(); }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
