// src/apps/bhw/BhwQueueList.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fullName } from "../../lib/utils";
import "../doctor/doctorDash.css"; // reuse styles
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
        .select(`
          id, patient_id, created_at, status, queued,
          patients:patient_id (
            id, first_name, middle_name, surname, family_number,
            age
          )
        `)
        .or("status.eq.queued,queued.eq.true")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = (data || []).map((r) => ({
        record_id: r.id,
        patient_id: r.patient_id,
        family_number: r.patients?.family_number ?? "",
        first_name: r.patients?.first_name ?? "",
        middle_name: r.patients?.middle_name ?? "",
        surname: r.patients?.surname ?? "",
        age: r.patients?.age ?? "",
      }));

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
  }, []);

  const handleCancel = async (recordId) => {
    // Ask for confirmation before canceling
    const confirmCancel = window.confirm("Are you sure you want to cancel this queue?");
    if (!confirmCancel) return;  // Exit if the user cancels the confirmation

    try {
      const { data, error } = await supabase
        .from("patient_records")
        .update({ status: "cancelled", queued: false })  // Assuming "cancelled" is the status you want
        .eq("id", recordId)
        .select();  // Add .select() to ensure the updated record is returned

      if (error) throw error;

      // Update the UI with the cancelled record by filtering it out
      setQueue((prevQueue) => prevQueue.filter((q) => q.record_id !== recordId));

      // Optionally, update the count
      if (typeof onCountChange === "function") onCountChange(queue.length - 1);

      // Show success alert
      alert("The queue has been successfully cancelled.");
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to cancel the queue" });
    }
  };

  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 15000);
    return () => clearInterval(id);
  }, [fetchQueue]);

  return (
    <div className="stack">
      {banner && (
        <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>
      )}

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
              <div className="queue-card__name">{fullName(q)}</div>
              <div className="queue-card__meta small muted">
                {q.family_number} | {q.age ?? "—"} y/o
              </div>
            </div>
            <div className="queue-card__right">
              {/* View Chart Button */}
              <button
                className="btn btn--primary"
                onClick={() => nav(`/bhw/queue/${q.record_id}`, { state: { from: "/bhw" } })}>
                View Chart
              </button>
              {/* Cancel Button */}
              <button
                className="btn btn--secondary"
                onClick={() => handleCancel(q.record_id)}>
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
