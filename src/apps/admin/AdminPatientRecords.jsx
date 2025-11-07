import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "../doctor/doctorDash.css"; // reuse the same light styles as Doctor

export default function AdminPatientRecords() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(false);

  // Guard: only ADMIN
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) {
        nav("/login", { replace: true });
        return;
      }
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();
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
    <section className="max-w-7xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">
        Patient Records
      </h2>

      <div className="flex justify-between items-center mb-4">
        {/* Search bar */}
        <div className="flex items-center gap-4 w-full md:w-1/2">
          <input
            className="w-full p-2 border border-gray-300 rounded-md"
            placeholder="Search by Family No. or Surname..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          {/* Sorting buttons */}
          <button
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${
              sortAsc ? "bg-orange-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setSortAsc(true)}
          >
            ↑ Ascending
          </button>
          <button
            className={`px-4 py-2 text-sm font-semibold rounded-lg ${
              !sortAsc ? "bg-orange-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setSortAsc(false)}
          >
            ↓ Descending
          </button>
        </div>
        {/* Refresh button */}
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-md"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      {/* List of Families */}
      <div className="space-y-4">
        {items.map((row) => (
          <Link
            key={`${row.family_number}-${row.surname}`}
            to={`${linkBase}/${encodeURIComponent(row.family_number)}`}
            className="block p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100"
          >
            <div className="text-lg font-medium text-gray-800">
              FAM {String(row.family_number).padStart(3, "0")} — {row.surname}
            </div>
            <div className="text-sm text-gray-600">
              {row.address && row.address.trim() ? row.address : "No address on file"}
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
