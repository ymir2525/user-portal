// src/apps/bhw/PatientRecords.jsx
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
      {/* Local styles so you don't have to edit CSS files */}
      <style>{`
        /* Toolbar layout: search + sort on the left, refresh + add on the right */
        .pr-toolbar{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin:8px 0 12px;
          flex-wrap:wrap;
        }
        .pr-left{
          display:flex;
          align-items:center;
          gap:8px;
          flex:1 1 520px;
          min-width:420px;
        }
        .pr-right{
          display:flex;
          align-items:center;
          gap:10px;
          flex:0 0 auto;
        }
        .pr-search{
          flex:1 1 auto;
          min-width:260px;
          border:3px solid #93c5fd; /* blue-300 */
          border-radius:8px;
          padding:10px 12px;
          background:#fff;
          outline:none;
        }
        .pr-search:focus{ border-color:#60a5fa; } /* blue-400 */

        /* Outline-blue buttons */
        .btn--outline-blue{
          background: transparent !important;
          color: #111827 !important;
          border: 1px solid #3b82f6 !important; /* blue-500 */
          border-radius: 8px;
          padding: 8px 12px;
          box-shadow: none !important;
          cursor: pointer;
        }
        .btn--outline-blue:hover{ background:orange !important; }
        .btn--outline-blue:active{ background:#bfdbfe !important; }
        .btn--outline-blue:disabled{ opacity:.6; cursor:not-allowed; }

        .btn-sm{ padding:6px 10px; }

        .is-active-sort{ background:#dbeafe !important; } /* blue-100 */

        /* List styles */
        .family-list{ display:flex; flex-direction:column; gap:8px; margin-top:12px; }
        .family-list__item{
          display:block; padding:10px 12px; border:1px solid #e5e7eb; border-radius:8px;
          color:inherit; text-decoration:none; background:#fff;
        }
        .family-list__item:hover{ background:#f9fafb; }

        /* Family number on top, bold */
        .fam-line{
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:0.3px;
          margin-bottom:2px;
        }

        /* Address indicator under it (like your screenshot) */
        .addr-line{
          font-size:12px;
          color:#4b5563; /* gray-600 */
          line-height:1.25rem;
          overflow:hidden;
          text-overflow:ellipsis;
          display:-webkit-box;
          -webkit-line-clamp:2;  /* keep it tidy if address is long */
          -webkit-box-orient:vertical;
        }

        .alert.alert--error{ color:#b91c1c; margin-top:8px; }
      `}</style>

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
            {/* Top: FAM + number (bold), you can include surname if you want */}
          <div className="fam-line">FAM {String(row.family_number).padStart(3, "0")} — {row.surname}</div>
            {/* Address indicator just below, as requested */}
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
              <button className="btn--outline-blue btn-sm" onClick={() => setShowAdd(false)}>Close</button>
            </div>

            {/* Scrollable body */}
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

export default PatientRecords;
