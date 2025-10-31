// src/apps/doctor/DoctorQueueList.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fullName } from "../../lib/utils";
import "./doctorDash.css";

export default function DoctorQueueList() {
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
          id, patient_id, created_at, visit_date, chief_complaint,
          height_cm, weight_kg, blood_pressure, temperature_c,
          status, queued,
          patients:patient_id (
            id, first_name, middle_name, surname, family_number,
            sex, age, birthdate, contact_number, contact_person
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
      }
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to load queue" });
    } finally {
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 15000);
    return () => clearInterval(id);
  }, [fetchQueue]);

  const cancelQueueItem = async (recordId) => {
    if (!window.confirm("Cancel this queue item?")) return;
    try {
      const { error } = await supabase
        .from("patient_records")
        .update({ status: "cancelled", queued: false })
        .eq("id", recordId);
      if (error) throw error;
      setQueue((q) => q.filter((x) => x.record_id !== recordId));
      setBanner({ type: "ok", msg: "Queue item cancelled." });
    } catch (e) {
      console.error(e);
      setBanner({ type: "err", msg: e.message || "Failed to cancel" });
    }
  };

  return (
    <div className="stack">
      {banner && (
        <div className={`banner ${banner.type === "ok" ? "banner--ok" : "banner--err"}`}>{banner.msg}</div>
      )}
      <div className="page-title">Queueing Table</div>

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
              <button className="btn btn--outline" onClick={() => cancelQueueItem(q.record_id)}>Cancel</button>
              <button className="btn btn--primary" onClick={() => nav(`/doctor/queue/${q.record_id}`)}>
                View Chart
              </button>
            </div>
          </div>
        ))}
        {queue.length === 0 && <div className="muted small">No patients in queue.</div>}
      </div>
    </div>
  );
}
