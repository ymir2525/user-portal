import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PatientRegistration from "./PatientRegistration";

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
        .select("family_number,surname")
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
    <section className="section section--records">
      <h2 className="section-title">Patient Records</h2>

      <div className="toolbar" style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8 }}>
        <input
          className="input input--search"
          placeholder="Search by Family No. or Surname..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <div className="btn-group">
          <button
            className={`btn ${sortAsc ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setSortAsc(true)}
            title="Ascending"
          >
            ↑ Ascending
          </button>
          <button
            className={`btn ${!sortAsc ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setSortAsc(false)}
            title="Descending"
          >
            ↓ Descending
          </button>
        </div>
        <button
          className="btn btn--secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
          Add Patient
        </button>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="family-list">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`/bhw/family/${encodeURIComponent(row.family_number)}`}
            className="family-list__item"
          >
            {row.family_number} - {row.surname}
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",         // PERFECT center
            zIndex: 1000,
            padding: 12,                  // keep gutter on very small screens
          }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="modal-sheet"
            style={{
              width: "min(720px, 94vw)",  // smaller sheet
              maxHeight: "80vh",          // a bit shorter
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 18px 48px rgba(0,0,0,.35)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",         // header fixed, body scrolls
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              style={{
                height: 52,
                padding: "0 14px",
                borderBottom: "1px solid #e9e9e9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 600 }}>Patient Registration</div>
              <button className="btn btn--ghost" onClick={() => setShowAdd(false)}>Close</button>
            </div>

            {/* Scrollable body */}
            <div
              style={{
                overflowY: "auto",
                padding: 14,
                maxHeight: "calc(80vh - 52px)", // subtract header height
              }}
            >
              <div style={{ maxWidth: 680, margin: "0 auto" }}>
                <PatientRegistration
                  showHeader={false}     // avoid double header
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
