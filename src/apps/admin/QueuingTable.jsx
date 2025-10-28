import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// helpers (same behavior as your Doctor page)
function ageFromBirthdate(birthdate, fallbackAge) {
  if (!birthdate) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const bd = new Date(birthdate);
  if (isNaN(bd)) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const now = new Date();
  if (bd > now) return "0 months";
  let months =
    (now.getFullYear() - bd.getFullYear()) * 12 +
    (now.getMonth() - bd.getMonth());
  if (now.getDate() < bd.getDate()) months -= 1;
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  return String(Math.floor(months / 12));
}
const fullName = (p) =>
  [p?.first_name, p?.middle_name, p?.surname].filter(Boolean).join(" ");

export default function QueuingTable() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        // === FETCH FROM patients (queued = true) ===
        // ordered ascending; prefer queued_at when present, else created_at
        const { data, error } = await supabase
          .from("patients")
          .select(
            "id, family_number, first_name, middle_name, surname, age, birthdate, queued, queued_at, created_at"
          )
          .eq("queued", true)
          .order("queued_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true });

        if (error) throw error;

        const list = (data || []).map((p) => ({
          patient_id: p.id,
          fam: p.family_number || "",
          first_name: p.first_name || "",
          middle_name: p.middle_name || "",
          surname: p.surname || "",
          age: p.age ?? "",
          birthdate: p.birthdate || null,
          // for uniqueness in render (no record id here)
          key: `${p.id}-${p.queued_at || p.created_at}`,
        }));

        if (alive) setRows(list);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    timer.current = setInterval(load, 15000);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const handleCancel = async (patientId) => {
    const ok = window.confirm("are you sure you want to cancel this patient");
    if (!ok) return;
    try {
      // 1) cancel any queued patient_record for this patient (if exists)
      const { data: rec, error: fetchRecErr } = await supabase
        .from("patient_records")
        .select("id")
        .eq("patient_id", patientId)
        .eq("status", "queued")
        .maybeSingle();
      if (fetchRecErr) throw fetchRecErr;

      if (rec?.id) {
        const { error: recUpdErr } = await supabase
          .from("patient_records")
          .update({ status: "cancelled", queued: false })
          .eq("id", rec.id);
        if (recUpdErr) throw recUpdErr;
      }

      // 2) clear the queue flag on the patient
      const { error: patErr } = await supabase
        .from("patients")
        .update({ queued: false, queued_at: null })
        .eq("id", patientId);
      if (patErr) throw patErr;

      // 3) remove from UI
      setRows((r) => r.filter((x) => x.patient_id !== patientId));
    } catch (e) {
      alert(e.message || "Cancel failed");
    }
  };

 const handleViewChart = (patientId) => {
  nav(`/admin/queue/${patientId}`);
};

  return (
    <section className="max-w-5xl mx-auto">
      {/* title + Add Patient */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Queueing Table</h2>
        <button
          className="text-xs border rounded px-3 py-1 border-green-700 text-green-700 hover:bg-green-50"
          onClick={() => setOpen(true)}
        >
          Add Patient
        </button>
      </div>

      {/* green rounded box like in screenshot */}
      <div className="border-2 border-green-700 rounded-xl p-3">
        {loading && (
          <div className="text-sm text-slate-600 px-2 py-1">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-slate-600 px-2 py-1">
            No patients in queue.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.key} className="bg-white rounded">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex-1">
                  <div className="font-medium">{fullName(r)}</div>
                  <div className="text-xs text-slate-600">
                    FAM {r.fam || "—"} | {ageFromBirthdate(r.birthdate, r.age)} yrs old
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs border rounded px-2 py-1 border-red-600 text-red-700 hover:bg-red-50"
                    onClick={() => handleCancel(r.patient_id)}
                  >
                    Cancel
                  </button>
                 <button
  className="text-xs border rounded px-2 py-1 border-blue-700 text-blue-700 hover:bg-blue-50"
  onClick={() => handleViewChart(r.patient_id)}
>
  View Chart
</button>
                </div>
              </div>
              {i < rows.length - 1 && <div className="h-px bg-slate-300 mx-3" />}
            </div>
          ))}
        </div>
      </div>

      {/* Add Patient modal (simple placeholder for now) */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="w-full max-w-3xl bg-white rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold">Add Patient</div>
              <button
                className="text-sm px-2 py-1 rounded border hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                Exit
              </button>
            </div>
            <div className="p-4 text-sm">this section is not implemented yet</div>
          </div>
        </div>
      )}
    </section>
  );
}
