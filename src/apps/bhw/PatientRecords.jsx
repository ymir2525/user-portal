// src/apps/bhw/PatientRecords.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PatientRegistration from "./PatientRegistration";
import './PatientRecords.css';  // Import the new CSS file

/* ---------------- Patient Records ---------------- */
function PatientRecords() {
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
        // ⬇️ include address so we can display & search it
        .select("family_number,surname,address")
        .order("family_number", { ascending: sortAsc });

      if (like) {
        // ⬇️ searchable by family number, surname, OR address
        query = query.or(
          `family_number.ilike.%${like}%,surname.ilike.%${like}%,address.ilike.%${like}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      // De-dup per family_number + surname (keep one row per family)
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
      <h2 className="section-title">Patient Records</h2>

      {/* Toolbar: ASC/DESC directly beside the search input */}
      <div className="pr-toolbar">
        {/* LEFT: Search + Asc/Desc */}
        <div className="pr-left">
          <input
            className="pr-search"
            placeholder="Search by Family No., Surname, or Address…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />

          <button
            className={`btn--outline-blue btn-sm ${sortAsc ? "is-active-sort" : ""}`}
            onClick={() => setSortAsc(true)}
            title="Ascending"
          >
            ↑ Ascending
          </button>

          <button
            className={`btn--outline-blue btn-sm ${!sortAsc ? "is-active-sort" : ""}`}
            onClick={() => setSortAsc(false)}
            title="Descending"
          >
            ↓ Descending
          </button>
        </div>

        {/* RIGHT: Refresh + Add Patient */}
        <div className="pr-right">
          <button
            className="btn--outline-blue btn-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            className="btn--outline-blue btn-sm"
            onClick={() => setShowAdd(true)}
          >
            Add Patient
          </button>
        </div>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="family-list">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`/bhw/family/${encodeURIComponent(row.family_number)}`}
            className="family-list__item"
          >
            <div className="fam-line">
              FAM {String(row.family_number).padStart(3, "0")} — {row.surname}
            </div>
            <div className="addr-line">
              {row.address && row.address.trim() ? row.address : "No address on file"}
            </div>
          </Link>
        ))}

        {items.length === 0 && !loading && (
          <div className="empty">No families found.</div>
        )}
      </div>

      {/* Modal for Add Patient */}
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
              <div className="title">Patient Registration</div>
              <button className="btn--outline-blue btn-sm" onClick={() => setShowAdd(false)}>Close</button>
            </div>

            <div className="modal-body">
              <div className="modal-content">
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

export default PatientRecords;
