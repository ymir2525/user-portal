// src/pages/doctor/DoctorDashboardHome.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const ORANGE = "#e9772e";
const PEACH = "#f3b184";
const PANEL_BG = "#fff7f1";

function manilaTodayBoundsUTC() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((x) => x.type === "year").value;
  const month = parts.find((x) => x.type === "month").value;
  const day = parts.find((x) => x.type === "day").value;
  const startLocal = `${year}-${month}-${day}T00:00:00+08:00`;
  const endLocal = `${year}-${month}-${day}T23:59:59.999+08:00`;
  return {
    startUtcIso: new Date(startLocal).toISOString(),
    endUtcIso: new Date(endLocal).toISOString(),
    manilaDate: `${year}-${month}-${day}`,
  };
}

export default function DoctorDashboardHome() {
  const { startUtcIso, endUtcIso, manilaDate } = useMemo(manilaTodayBoundsUTC, []);

  // tiles
  const [admLoading, setAdmLoading] = useState(true);
  const [queuedToday, setQueuedToday] = useState(0);

  const loadAdmTop = useCallback(async () => {
    try {
      setAdmLoading(true);
      const { count, error } = await supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("queued", true)
        .gte("created_at", startUtcIso)
        .lt("created_at", endUtcIso);
      if (error) throw error;
      setQueuedToday(count || 0);
    } catch {
      setQueuedToday(0);
    } finally {
      setAdmLoading(false);
    }
  }, [startUtcIso, endUtcIso]);

  const [medLoading, setMedLoading] = useState(true);
  const [medicineOnStock, setMedicineOnStock] = useState(0);
  const loadMedicineOnStock = useCallback(async () => {
    try {
      setMedLoading(true);
      const { data, error } = await supabase
        .from("medicine_inventory")
        .select("quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      if (error) throw error;
      const sum = (data || []).reduce((a, r) => a + (Number(r.quantity) || 0), 0);
      setMedicineOnStock(sum);
    } catch {
      setMedicineOnStock(0);
    } finally {
      setMedLoading(false);
    }
  }, [manilaDate]);

  const [alerts, setAlerts] = useState([]);
  const loadAlerts = useCallback(async () => {
    try {
      const { data: cat } = await supabase.from("medicine_catalog").select("medicine_name");
      const { data: invAgg } = await supabase
        .from("medicine_inventory")
        .select("medicine_name, quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      const qtyMap = new Map();
      (invAgg || []).forEach(r => qtyMap.set(r.medicine_name, (qtyMap.get(r.medicine_name) || 0) + (Number(r.quantity) || 0)));
      const out = (cat || [])
        .filter(c => (qtyMap.get(c.medicine_name) || 0) <= 0)
        .map(c => c.medicine_name)
        .slice(0, 5);
      setAlerts(out);
    } catch {
      setAlerts([]);
    }
  }, [manilaDate]);

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const loadClassifications = useCallback(async () => {
    const { data } = await supabase.from("medicine_catalog").select("classification");
    const uniq = Array.from(new Set((data || []).map(r => r.classification))).sort((a, b) => String(a).localeCompare(String(b)));
    setClasses(uniq);
    if (!uniq.includes(selectedClass)) setSelectedClass(uniq[0] || "");
  }, [selectedClass]);

  const [overviewRows, setOverviewRows] = useState([]);
  const loadOverview = useCallback(async (klass) => {
    if (!klass) { setOverviewRows([]); return; }
    try {
      const { data: cat } = await supabase
        .from("medicine_catalog").select("medicine_name").eq("classification", klass);
      const names = (cat || []).map(r => r.medicine_name);
      const { data: inv } = await supabase
        .from("medicine_inventory")
        .select("medicine_name, quantity, expiration_date")
        .eq("classification", klass)
        .gte("expiration_date", manilaDate);
      const map = new Map();
      (inv || []).forEach(r => map.set(r.medicine_name, (map.get(r.medicine_name) || 0) + (Number(r.quantity) || 0)));
      const rows = names.map(n => ({ name: n, qty: map.get(n) || 0 })).sort((a, b) => a.name.localeCompare(b.name));
      setOverviewRows(rows);
    } catch {
      setOverviewRows([]);
    }
  }, [manilaDate]);

  // staff today
  const [staff, setStaff] = useState({ doctor: null, admin: [], nurse: [], bhw: [] });
  const nameOf = (p) => (p ? `${p.firstname ?? ""} ${p.surname ?? ""}`.trim() : "—");
  const loadStaffToday = useCallback(async () => {
    try {
      const { startUtcIso, endUtcIso } = manilaTodayBoundsUTC();
      const { data: logins } = await supabase.rpc("users_logged_in_between", { start_ts: startUtcIso, end_ts: endUtcIso });
      const ids = Array.from(new Set((logins || []).map(u => u.id))).filter(Boolean);
      if (ids.length === 0) { setStaff({ doctor: null, admin: [], nurse: [], bhw: [] }); return; }
      const { data: profs } = await supabase.from("profiles").select("id, firstname, surname, role").in("id", ids);
      const norm = (r) => String(r?.role || "").toUpperCase();
      const doctor = (profs || []).find(p => norm(p) === "DOCTOR") || null;
      const admin = (profs || []).filter(p => norm(p) === "ADMIN");
      const nurse = (profs || []).filter(p => norm(p) === "NURSE");
      const bhw = (profs || []).filter(p => norm(p) === "BHW");
      setStaff({ doctor, admin, nurse, bhw });
    } catch {
      setStaff({ doctor: null, admin: [], nurse: [], bhw: [] });
    }
  }, []);

  // boot + polling
  useEffect(() => {
    loadAdmTop(); loadMedicineOnStock(); loadClassifications(); loadAlerts(); loadStaffToday();
    const id = setInterval(() => {
      loadAdmTop(); loadMedicineOnStock(); loadClassifications(); loadAlerts(); loadStaffToday();
      if (selectedClass) loadOverview(selectedClass);
    }, 15000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  useEffect(() => { if (selectedClass) loadOverview(selectedClass); }, [selectedClass, loadOverview]);

  return (
    <div className="stack">
      <div className="muted small">DATE TODAY (Manila): <b>{manilaDate}</b></div>

      {/* tiles */}
      <div className="tiles">
        <div className="tile" style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}>
          <div className="tile__big" style={{ color: ORANGE }}>{admLoading ? "…" : queuedToday}</div>
          <div className="tile__label">Total Check Up (today)</div>
        </div>
        <div className="tile" style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}>
          <div className="tile__big" style={{ color: ORANGE }}>{medLoading ? "…" : medicineOnStock}</div>
          <div className="tile__label">Medicine On Stock</div>
        </div>
        <div className="tile tile--alert" style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}>
          <div className="panel__title">Alert</div>
          {alerts.length === 0 ? (
            <div className="muted small">No out-of-stock medicines.</div>
          ) : (
            <ul className="ul">{alerts.map(a => <li key={a}>{a} out of stock</li>)}</ul>
          )}
        </div>
      </div>

      {/* bottom row */}
      <div className="grid-2">
        <div className="panel" style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}>
          <div className="panel__title">Medicine Inventory Overview</div>
          <div className="mb-2">
            <label className="small muted">Classification</label>{" "}
            <select className="select" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              {classes.length === 0 && <option value="">—</option>}
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="scroll">
            {overviewRows.length === 0 ? (
              <div className="muted small">No medicines for this classification.</div>
            ) : (
              overviewRows.map(r => (
                <div key={r.name} className="row">
                  <div>{r.name}</div><div>{r.qty}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel" style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}>
          <div className="panel__title">STAFF TODAY</div>
          <div className="staff">
            <div className="row"><div>{nameOf(staff.doctor)}</div><div className="muted">Doctor-in-Charge</div></div>
            {staff.admin.map(p => (<div key={p.id} className="row"><div>{nameOf(p)}</div><div className="muted">Admin</div></div>))}
            {staff.nurse.map(p => (<div key={p.id} className="row"><div>{nameOf(p)}</div><div className="muted">Nurse</div></div>))}
            {staff.bhw.map(p => (<div key={p.id} className="row"><div>{nameOf(p)}</div><div className="muted">BHW</div></div>))}
            {!staff.admin.length && !staff.nurse.length && !staff.bhw.length && (
              <div className="muted small">No staff logins recorded today.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
