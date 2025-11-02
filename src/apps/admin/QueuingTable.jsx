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
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;

   async function load() {
  try {
    setLoading(true);

    // Source of truth: patient_records (queued or status=queued)
    const { data, error } = await supabase
      .from("patient_records")
      .select(`
        id, patient_id, created_at, queued_at, status, queued,
        patients:patient_id (
          id, family_number, first_name, middle_name, surname, age, birthdate
        )
      `)
      .or("status.eq.queued,queued.eq.true")
      .order("queued_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const list = (data || []).map((r) => ({
      record_id: r.id,
      patient_id: r.patient_id,
      fam: r.patients?.family_number || "",
      first_name: r.patients?.first_name || "",
      middle_name: r.patients?.middle_name || "",
      surname: r.patients?.surname || "",
      age: r.patients?.age ?? "",
      birthdate: r.patients?.birthdate || null,
      key: `${r.id}-${r.queued_at || r.created_at}`,
    }));

    setRows(list);
  } catch (e) {
    console.error(e);
  } finally {
    setLoading(false);
  }
}

    load();
    timer.current = setInterval(load, 15000);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

const handleCancel = async (recordId, patientId) => {
  if (!window.confirm("Are you sure you want to cancel this patient?")) return;
  try {
    // cancel the record
    const { error: recErr } = await supabase
      .from("patient_records")
      .update({ status: "cancelled", queued: false })
      .eq("id", recordId);
    if (recErr) throw recErr;

    // clear patient queued flag
    const { error: patErr } = await supabase
      .from("patients")
      .update({ queued: false, queued_at: null })
      .eq("id", patientId);
    if (patErr) throw patErr;

    setRows((r) => r.filter((x) => x.record_id !== recordId));
  } catch (e) {
    alert(e.message || "Cancel failed");
  }
};


  const handleViewChart = (patientId) => {
    nav(`/admin/queue/${patientId}`);
  };

  return (
    <section className="max-w-6xl mx-auto">
      {/* centered title like in screenshot */}
      <h2 className="text-center font-semibold mb-4">Queueing Table</h2>

      {/* list container */}
      <div className="flex flex-col gap-3">
        {loading && (
          <div className="text-sm text-slate-600 text-center">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-slate-600 text-center">
            No patients in queue.
          </div>
        )}

        {rows.map((r) => {
          const age = ageFromBirthdate(r.birthdate, r.age);
          const ageDisplay = /\d+/.test(age) ? `${age} y/o` : age; // "22 y/o"
          return (
            <div
              key={r.key}
              className="bg-white border rounded-lg"
              style={{ borderColor: "#E5E7EB" }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{fullName(r)}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {r.fam || "—"} | {ageDisplay}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
  className="text-sm px-3 py-1.5 rounded border hover:bg-slate-50"
  style={{ borderColor: "#CBD5E1", color: "#334155" }}
  onClick={() => handleCancel(r.record_id, r.patient_id)}
>
  Cancel
</button>
                  <button
  className="text-sm px-3 py-1.5 rounded text-white"
  style={{ backgroundColor: "#f97316" }}
  onClick={() => nav(`/admin/queue/${r.patient_id}`)}
>
  View Chart
</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
