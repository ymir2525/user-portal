import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// ---- Palette (matches your Admin sidebar screenshot)
const NAVY = "#0A2647";
const NAVY_SOFT = "#1b3d5e";
const ORANGE = "#E85D24";
const PANEL_BG = "#ffffff";
const PAGE_BG = "#f5f6f8";

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
    <section
      className="max-w-6xl mx-auto"
      style={{ background: "transparent" }}
    >
      {/* page background hint like screenshot */}
      <div
        className="rounded-lg p-6"
        style={{ background: PAGE_BG }}
      >
        {/* Title row with blue underline frame effect */}
        <h2
          className="font-semibold mb-4"
          style={{
            color: NAVY,
            borderLeft: `4px solid ${ORANGE}`,
            paddingLeft: 10,
          }}
        >
          Queueing Table
        </h2>

        {/* outer panel with navy border */}
        <div
          className="rounded-xl p-4"
          style={{
            background: PANEL_BG,
            border: `3px solid ${NAVY_SOFT}`,
          }}
        >
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
                  className="rounded-lg"
                  style={{
                    background: PANEL_BG,
                    border: "1px solid #E5E7EB",
                  }}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div
                        className="font-medium truncate"
                        style={{ color: NAVY }}
                      >
                        {fullName(r)}
                      </div>
                      <div className="text-xs mt-1" style={{ color: NAVY_SOFT }}>
                        {r.fam || "—"} | {ageDisplay}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Cancel — outlined with orange border, subtle hover fill */}
                      <button
                        className="text-sm px-3 py-1.5 rounded border"
                        style={{
                          borderColor: ORANGE,
                          color: ORANGE,
                          background: "#fff",
                        }}
                        onClick={() => handleCancel(r.record_id, r.patient_id)}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#FFF2E9")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#fff")
                        }
                      >
                        Cancel
                      </button>

                      {/* View Chart — solid orange */}
                      <button
                        className="text-sm px-3 py-1.5 rounded text-white"
                        style={{ backgroundColor: ORANGE, boxShadow: "0 1px 0 rgba(0,0,0,.05)" }}
                        onClick={() => handleViewChart(r.patient_id)}
                      >
                        View Chart
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
