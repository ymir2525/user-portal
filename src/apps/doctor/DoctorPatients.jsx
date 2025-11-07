// src/apps/doctor/DoctorPatients.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

/* ---------------- Doctor Patients ---------------- */
export default function DoctorPatients() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(false);

  // guard: only DOCTOR
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { nav("/login", { replace: true }); return; }
      const { data: prof, error } = await supabase
        .from("profiles").select("role").eq("id", uid).single();
      if (error || !prof || String(prof.role).toUpperCase() !== "DOCTOR") {
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
        .select("family_number,surname,address") // Include address in query from the 'patients' table
        .order("family_number", { ascending: sortAsc });

      if (like) {
        query = query.or(
          `family_number.ilike.%${like}%,surname.ilike.%${like}%,address.ilike.%${like}%`
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
    <section className="p-6">
      <h2 className="text-2xl font-bold mb-4">Patient Records</h2>

      {/* Toolbar */}
      <div className="flex justify-between gap-4 mb-4">
        {/* Search and Sort */}
        <div className="flex gap-4 items-center flex-1">
          <input
            type="text"
            className="p-2 border rounded-md w-1/3"
            placeholder="Search by Family No. or Surname"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className={`btn btn-sm ${sortAsc ? "bg-blue-100" : "bg-gray-200"}`}
            onClick={() => setSortAsc(true)}
          >
            ↑ Ascending
          </button>
          <button
            className={`btn btn-sm ${!sortAsc ? "bg-blue-100" : "bg-gray-200"}`}
            onClick={() => setSortAsc(false)}
          >
            ↓ Descending
          </button>
        </div>

        {/* Refresh Button */}
        <button
          className="btn btn-sm bg-blue-500 text-white"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Error Handling */}
      {err && <div className="text-red-600">{err}</div>}

      {/* Patient List */}
      <div className="space-y-4">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`/doctor/family/${encodeURIComponent(row.family_number)}`}
            className="block p-4 bg-white border rounded-md hover:bg-gray-100"
          >
            <div className="font-semibold">
              FAM {String(row.family_number).padStart(3, "0")} - {row.surname}
            </div>
            <div className="text-gray-600 text-sm mt-1">
              {row.address && row.address.trim() ? row.address : "No address available"}
            </div>
          </Link>
        ))}

        {items.length === 0 && !loading && (
          <div className="text-center text-gray-500">No families found.</div>
        )}
      </div>
    </section>
  );
}
