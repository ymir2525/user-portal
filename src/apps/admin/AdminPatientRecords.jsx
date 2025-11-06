// src/apps/admin/AdminPatientRecords.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./AdminPatientRecords.css"; // Link to the new CSS file

export default function AdminPatientRecords() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(false);

  // guard: only ADMIN
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { nav("/login", { replace: true }); return; }
      const { data: prof, error } = await supabase
        .from("profiles").select("role").eq("id", uid).single();
      if (error || !prof || String(prof.role).toUpperCase() !== "ADMIN") {
        await supabase.auth.signOut().catch(() => {});
        nav("/login", { replace: true });
        return;
      }
      if (mounted && !firstRun.current) {
        firstRun.current = true;
        void load();
      }
    })();
    return () => { mounted = false; };
  }, [nav]);

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
        .select("family_number,surname,address") // Include address in the selection
        .order("family_number", { ascending: sortAsc });

      if (like) {
        query = query.or(
          `family_number.ilike.%${like}%,surname.ilike.%${like}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      // de-duplicate by (family_number, surname)
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

  // If you route family detail somewhere else, change this base path:
  const linkBase = "/admin/family"; // e.g. route like /admin/family/:familyNumber

  return (
    <section className="section section--records">
      <h2 className="section-title">Patient Records</h2>

      <div className="toolbar">
        <input
          className="input--search"
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
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="family-list">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`${linkBase}/${encodeURIComponent(row.family_number)}`}
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
    </section>
  );
}
