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
    <section className="section section--records">
      <style>{`
        .pr-toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; margin:8px 0 12px; flex-wrap:wrap;
        }
        .pr-left{ display:flex; align-items:center; gap:8px; flex:1 1 520px; min-width:420px; }
        .pr-right{ display:flex; align-items:center; gap:10px; flex:0 0 auto; }
        .pr-search{
          flex:1 1 auto; min-width:260px; border:3px solid #93c5fd; border-radius:8px;
          padding:10px 12px; background:#fff; outline:none;
        }
        .pr-search:focus{ border-color:#60a5fa; }
        .btn--outline-blue{
          background: transparent !important; color:#111827 !important;
          border:1px solid #3b82f6 !important; border-radius:8px; padding:8px 12px;
          box-shadow:none !important; cursor:pointer;
        }
        .btn--outline-blue:hover{ background:orange !important; }
        .btn--outline-blue:active{ background:#bfdbfe !important; }
        .btn--outline-blue:disabled{ opacity:.6; cursor:not-allowed; }
        .btn-sm{ padding:6px 10px; }
        .is-active-sort{ background:#dbeafe !important; }
        .family-list{ display:flex; flex-direction:column; gap:8px; margin-top:12px; }
        .family-list__item{
          display:block; padding:10px 12px; border:1px solid #e5e7eb; border-radius:8px;
          color:inherit; text-decoration:none; background:#fff;
        }
        .family-list__item:hover{ background:#f9fafb; }
        .alert.alert--error{ color:#b91c1c; margin-top:8px; }
      `}</style>

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
            to={`/nurse/family/${encodeURIComponent(row.family_number)}`}
            className="family-list__item"
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 12,
          }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="modal-sheet"
            style={{
              width: "min(720px, 94vw)",
              maxHeight: "80vh",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 18px 48px rgba(0,0,0,.35)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
              <button className="btn--outline-blue btn-sm" onClick={() => setShowAdd(false)}>Close</button>
            </div>

            <div
              style={{
                overflowY: "auto",
                padding: 14,
                maxHeight: "calc(80vh - 52px)",
              }}
            >
              <div style={{ maxWidth: 680, margin: "0 auto" }}>
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
