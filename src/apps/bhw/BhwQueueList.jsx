import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "../doctor/doctorDash.css";
import "./bhwQueue.css";

export default function BhwQueueList({ onCountChange }) {
  const nav = useNavigate();
  const [banner, setBanner] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const firstLoadRef = useRef(true);
  const prevQueueRef = useRef([]);

  const equalQueues = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i].record_id !== b[i].record_id) return false;
    return true;
  };

  const fetchQueue = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("patient_records")
        .select(
          // ⬇️ No comments in this string; valid PostgREST syntax
          "id,patient_id,created_at,status,queued,patients:patient_id(id,first_name,middle_name,surname,family_number,age,name_extension)"
        )
        .or("status.eq.queued,queued.eq.true")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = (data || []).map((r) => {
        const p = r.patients || {};
        return {
          record_id: r.id,
          patient_id: r.patient_id,
          family_number: p.family_number ?? "",
          first_name: p.first_name ?? "",
          middle_name: p.middle_name ?? "",
          surname: p.surname ?? "",
          name_extension: p.name_extension ?? "",
          age: p.age ?? "",
        };
      });

      if (!equalQueues(list, prevQueueRef.current)) {
        prevQueueRef.current = list;
        setQueue(list);
        if (typeof onCountChange === "function") onCountChange(list.length);
      }
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to load queue" });
    } finally {
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        setLoading(false);
        if (typeof onCountChange === "function") onCountChange(prevQueueRef.current.length);
      }
    }
  }, [onCountChange]);

  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 15000);
    return () => clearInterval(id);
  }, [fetchQueue]);

  const cancelRecord = useCallback(
    async (recordId, patientId) => {
      const yes = window.confirm("Cancel this queue? The visit will be marked as cancelled.");
      if (!yes) return;
      try {
        const { error: recErr } = await supabase
          .from("patient_records")
          .update({ status: "cancelled", queued: false })
          .eq("id", recordId);
        if (recErr) throw recErr;

        await supabase.from("patients").update({ queued: false, queued_at: null }).eq("id", patientId);

        prevQueueRef.current = prevQueueRef.current.filter((r) => r.record_id !== recordId);
        setQueue((prev) => prev.filter((r) => r.record_id !== recordId));
        if (typeof onCountChange === "function") onCountChange(prevQueueRef.current.length);
        setBanner({ type: "ok", msg: "Queue cancelled." });
      } catch (e) {
        console.error(e);
        setBanner({ type: "err", msg: e.message || "Failed to cancel queue" });
      }
    },
    [onCountChange]
  );
  // helper: "Tuazon" -> "T." (handles blanks safely)
const toMiddleInitial = (s) => {
  const ch = String(s || "").replace(/[^A-Za-z]/g, "").charAt(0);
  return ch ? `${ch.toUpperCase()}.` : "";
};

const renderQueueName = (q) => {
  const mi = toMiddleInitial(q.middle_name);
  const ext = q.name_extension ? `, ${q.name_extension}` : "";
  return `${q.first_name} ${mi ? mi + " " : ""}${q.surname}${ext}`.replace(/\s+/g, " ").trim();
};

  return (
    <div className="stack">
      {banner && <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>}

      <div className="queue-header">
        <div className="page-title">Queueing Table</div>
        <div className="queue-count-badge">
          <div className="label">NUMBER OF QUEUES</div>
          <div className="count">{loading ? "…" : queue.length}</div>
        </div>
      </div>

      <div className="queue-list">
        {queue.map((q) => (
          <div key={q.record_id} className="queue-card">
            <div className="queue-card__left">
              <div className="queue-card__name">{renderQueueName(q)}</div>
              <div className="queue-card__meta small muted">
                {q.family_number} | {q.age ?? "—"} y/o
              </div>
            </div>
            <div className="queue-card__right">
              <button
                className="btn btn--primary"
                onClick={() => nav(`/bhw/queue/${q.record_id}`, { state: { from: "/bhw" } })}
              >
                View Chart
              </button>
              <button className="btn btn--outline" style={{ marginLeft: 8 }} onClick={() => cancelRecord(q.record_id, q.patient_id)}>
                Cancel
              </button>
            </div>
          </div>
        ))}
        {queue.length === 0 && !loading && <div className="muted small">No patients in queue.</div>}
      </div>
    </div>
  );
}
