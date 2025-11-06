// src/apps/admin/AdminDashboard.jsx
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./AdminDashboard.css"; // <-- NEW

const ORANGE   = "#e9772e";   // numbers + accent
const PEACH    = "#f3b184";   // modal divider (kept)
const PANEL_BG = "#fff7f1";   // card bg (off-white like the mock)
const NAVY     = "#0b314e";   // dark accent / border color
const BORDER_NAVY = "#0b314e";
const ALERT_RED   = "#e15252"; // alert border
const LOW_STOCK_THRESHOLD = 30;

/** Manila "today" bounds as UTC ISO strings + YYYY-MM-DD date. */
function manilaTodayBoundsUTC() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year  = parts.find(x => x.type === "year").value;
  const month = parts.find(x => x.type === "month").value;
  const day   = parts.find(x => x.type === "day").value;

  const startLocal = `${year}-${month}-${day}T00:00:00+08:00`;
  const endLocal   = `${year}-${month}-${day}T23:59:59.999+08:00`;

  return {
    startUtcIso: new Date(startLocal).toISOString(),
    endUtcIso:   new Date(endLocal).toISOString(),
    manilaDate:  `${year}-${month}-${day}`,
  };
}

export default function AdminDashboard() {
  // --- Today bounds (reused below) ---
  const { startUtcIso, endUtcIso, manilaDate } = manilaTodayBoundsUTC();

  // ----------------- Total Check Up (today) -----------------
  const [loading, setLoading] = useState(true);
  const [queuedToday, setQueuedToday] = useState(0);

  // Count patient_records created today (Manila day)
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { count, error } = await supabase
        .from("patient_records")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startUtcIso)
        .lt("created_at", endUtcIso);

      if (error) throw error;
      setQueuedToday(count || 0);
    } catch (e) {
      console.error("AdminDashboard load error:", e);
      setQueuedToday(0);
    } finally {
      setLoading(false);
    }
  }, [startUtcIso, endUtcIso]);

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    const id = setInterval(() => { if (!cancelled) load(); }, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [load]);

  // Realtime: update the tile if either patient_records or patients change.
  useEffect(() => {
    const prCh = supabase
      .channel("admindash-patient-records-today")
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_records" }, () => { load(); })
      .subscribe();

    const patCh = supabase
      .channel("admindash-patients-queued-meta")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => { load(); })
      .subscribe();

    return () => {
      supabase.removeChannel(prCh);
      supabase.removeChannel(patCh);
    };
  }, [load]);

  // ----------------- Medicine on stock + alerts + overview -----------------
  const [medLoading, setMedLoading] = useState(true);
  const [medicineOnStock, setMedicineOnStock] = useState(0);

  // Alerts state
  const [alertsPreview, setAlertsPreview] = useState([]); // up to 5 lines
  const [alertsCounts, setAlertsCounts] = useState({ low: 0, out: 0 });
  const totalAlerts = alertsCounts.low + alertsCounts.out;

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [alertsAll, setAlertsAll] = useState([]); // all rows for modal

  // Inventory overview
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [overviewRows, setOverviewRows] = useState([]);

  const loadMedicineOnStock = useCallback(async () => {
    try {
      setMedLoading(true);
      const { data, error } = await supabase
        .from("medicine_inventory")
        .select("quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      if (error) throw error;
      const sum = (data || []).reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
      setMedicineOnStock(sum);
    } catch (e) {
      console.error("AdminDashboard loadMedicineOnStock error:", e);
      setMedicineOnStock(0);
    } finally {
      setMedLoading(false);
    }
  }, [manilaDate]);

  const loadClassifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("medicine_inventory")
        .select("classification, expiration_date")
        .gte("expiration_date", manilaDate);
      if (error) throw error;

      const uniq = Array.from(
        new Set((data || []).map((r) => r.classification).filter(Boolean))
      ).sort((a, b) => String(a).localeCompare(String(b)));

      setClasses(uniq);
      if (!uniq.includes(selectedClass)) setSelectedClass(uniq[0] || "");
    } catch (e) {
      console.error("AdminDashboard loadClassifications (from inventory) error:", e);
      setClasses([]);
    }
  }, [manilaDate, selectedClass]);

  // Alerts (LOW + OUT, aggregated by medicine, non-expired)
  const loadAlerts = useCallback(async () => {
    try {
      const { data: inv, error } = await supabase
        .from("medicine_inventory")
        .select("medicine_name, quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      if (error) throw error;

      const qtyMap = new Map();
      (inv || []).forEach((r) => {
        qtyMap.set(r.medicine_name, (qtyMap.get(r.medicine_name) || 0) + (Number(r.quantity) || 0));
      });

      const rows = Array.from(qtyMap.entries()).map(([name, qty]) => {
        const status = qty <= 0 ? "OUT" : qty <= LOW_STOCK_THRESHOLD ? "LOW" : "OK";
        return { medicine_name: name, qty, status };
      });

      const low = rows.filter(r => r.status === "LOW").sort((a, b) => a.qty - b.qty);
      const out = rows.filter(r => r.status === "OUT").sort((a, b) => a.medicine_name.localeCompare(b.medicine_name));
      const allAlerts = [...out, ...low];

      setAlertsCounts({ low: low.length, out: out.length });
      setAlertsAll(allAlerts);

      const preview = allAlerts.slice(0, 5).map(r => `${r.medicine_name} — ${r.status === "OUT" ? "out of stock" : `low (${r.qty})`}`);
      setAlertsPreview(preview);
    } catch (e) {
      console.error("AdminDashboard loadAlerts error:", e);
      setAlertsCounts({ low: 0, out: 0 });
      setAlertsAll([]);
      setAlertsPreview([]);
    }
  }, [manilaDate]);

  const loadOverview = useCallback(async (klass) => {
    if (!klass) { setOverviewRows([]); return; }
    try {
      const { data: inv, error } = await supabase
        .from("medicine_inventory")
        // ADDED: include dosage_form
        .select("medicine_name, dosage_form, quantity, expiration_date")
        .eq("classification", klass)
        .gte("expiration_date", manilaDate);
      if (error) throw error;

      // ADDED: aggregate by (medicine_name + dosage_form)
      const map = new Map(); // key: `${name}||${form}` -> qty
      (inv || []).forEach((r) => {
        const keyName = r.medicine_name || "";
        const form = r.dosage_form ?? "—";
        if (!keyName) return;
        const key = `${keyName}||${form}`;
        map.set(key, (map.get(key) || 0) + (Number(r.quantity) || 0));
      });

      const rows = Array.from(map.entries())
        .map(([key, qty]) => {
          const [name, form] = key.split("||");
          return { name, form, qty: Number(qty) || 0 };
        })
        // ADDED: hide medicines with no available stock
        .filter((r) => r.qty > 0)
        .sort((a, b) => {
          const byName = a.name.localeCompare(b.name);
          if (byName !== 0) return byName;
          return String(a.form).localeCompare(String(b.form));
        });

      setOverviewRows(rows);
    } catch (e) {
      console.error("AdminDashboard loadOverview (from inventory) error:", e);
      setOverviewRows([]);
    }
  }, [manilaDate]);

  // Kick off loads + polling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await Promise.all([loadMedicineOnStock(), loadClassifications(), loadAlerts(), load()]);
    })();
    const id = setInterval(() => {
      if (!cancelled) {
        loadMedicineOnStock();
        loadClassifications();
        loadAlerts();
        if (selectedClass) loadOverview(selectedClass);
        load();
      }
    }, 15000);
  return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMedicineOnStock, loadClassifications, loadAlerts, load]);

  useEffect(() => { if (selectedClass) loadOverview(selectedClass); }, [selectedClass, loadOverview]);

  useEffect(() => {
    const invCh = supabase
      .channel("admindash-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_inventory" }, () => {
        loadMedicineOnStock();
        loadAlerts();
        if (selectedClass) loadOverview(selectedClass);
      })
      .subscribe();

    const catCh = supabase
      .channel("admindash-catalog")
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_catalog" }, () => {
        loadClassifications();
        loadAlerts();
        if (selectedClass) loadOverview(selectedClass);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(invCh);
      supabase.removeChannel(catCh);
    };
  }, [loadMedicineOnStock, loadClassifications, loadAlerts, selectedClass, loadOverview]);

  // ----------------- STAFF TODAY -----------------
  const [staff, setStaff] = useState({ doctor: null, admin: [], nurse: [], bhw: [] });

  const loadStaffToday = useCallback(async () => {
    try {
      const { data: logins, error: rpcErr } = await supabase.rpc(
        "users_logged_in_between",
        { start_ts: startUtcIso, end_ts: endUtcIso }
      );
      if (rpcErr) throw rpcErr;

      const ids = Array.from(new Set((logins || []).map(u => u.id))).filter(Boolean);
      if (ids.length === 0) { setStaff({ doctor: null, admin: [], nurse: [], bhw: [] }); return; }

      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, firstname, surname, role")
        .in("id", ids);
      if (profErr) throw profErr;

      const norm = r => String(r?.role || "").toUpperCase();
      const doctor = (profs || []).find(p => norm(p) === "DOCTOR") || null;
      const admin  = (profs || []).filter(p => norm(p) === "ADMIN");
      const nurse  = (profs || []).filter(p => norm(p) === "NURSE");
      const bhw    = (profs || []).filter(p => norm(p) === "BHW");

      setStaff({ doctor, admin, nurse, bhw });
    } catch (e) {
      console.error("AdminDashboard loadStaffToday error:", e);
      setStaff({ doctor: null, admin: [], nurse: [], bhw: [] });
    }
  }, [startUtcIso, endUtcIso]);

  useEffect(() => {
    loadStaffToday();
    const id = setInterval(loadStaffToday, 15000);
    return () => clearInterval(id);
  }, [loadStaffToday]);

  const nameOf = (p) => (p ? `${p.firstname ?? ""} ${p.surname ?? ""}`.trim() : "—");

  // ----------------- UI -----------------
  return (
    <div className="adm-space">
      {/* Date label centered like the mock */}
      <div className="adm-date">
        DATE TODAY (Manila): <b>{manilaDate}</b>
      </div>

      {/* ===== Top tiles: EXACT 3 tiles in one row ===== */}
      <div className="adm-tiles">
        {/* Total Check Up */}
        <div className="adm-tile">
          <div className="adm-tile-number">
            {loading ? "…" : queuedToday}
          </div>
          <div className="adm-tile-sub">Total Check Up</div>
        </div>

        {/* Medicine On Stock */}
        <div className="adm-tile">
          <div className="adm-tile-number">
            {medLoading ? "…" : medicineOnStock}
          </div>
          <div className="adm-tile-sub">Medicine On Stock</div>
        </div>

        {/* Alert */}
        <div
          onClick={() => totalAlerts > 0 && setModalOpen(true)}
          role="button"
          tabIndex={0}
          className="adm-tile adm-tile--alert"
        >
          <div className="font-semibold mb-1">Alert</div>
          {totalAlerts === 0 ? (
            <div className="text-sm text-gray-600">No low/out-of-stock medicines.</div>
          ) : (
            <ul className="adm-alerts-list">
              {alertsPreview.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ===== Bottom row: two even cards ===== */}
      <div className="adm-grid">
        {/* Inventory Overview */}
        <div className="adm-card">
          <div className="adm-card-title">Medicine Inventory Overview</div>

          <div className="adm-control">
            <label className="text-sm">Classification</label>
            <select
              className="adm-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {classes.length === 0 && <option value="">—</option>}
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="adm-overview">
            {overviewRows.length === 0 ? (
              <div className="text-sm text-gray-600">No medicines with available stock for this classification.</div>
            ) : (
              overviewRows.map((r) => (
                <div
                  key={`${r.name}::${r.form}`}
                  className="adm-overview-row"
                >
                  <div className="text-sm" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{r.name}</span>
                    <span className="adm-chip" title="Dosage form">
                      {r.form ?? "—"}
                    </span>
                  </div>
                  <div className="text-sm">{r.qty}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Staff Today */}
        <div className="adm-card">
          <div className="adm-card-title">STAFF TODAY</div>

          <div className="adm-staff-gap">
            <div className="adm-staff-line">
              <div>{nameOf(staff.doctor)}</div>
              <div className="adm-staff-muted">Doctor</div>
            </div>

            {staff.admin.map((p) => (
              <div className="adm-staff-line" key={p.id}>
                <div>{nameOf(p)}</div>
                <div className="adm-staff-muted">Admin</div>
              </div>
            ))}

            {staff.nurse.map((p) => (
              <div className="adm-staff-line" key={p.id}>
                <div>{nameOf(p)}</div>
                <div className="adm-staff-muted">Nurse</div>
              </div>
            ))}

            {staff.bhw.map((p) => (
              <div className="adm-staff-line" key={p.id}>
                <div>{nameOf(p)}</div>
                <div className="adm-staff-muted">BHW</div>
              </div>
            ))}

            {!staff.admin.length && !staff.nurse.length && !staff.bhw.length && (
              <div className="text-gray-600">No staff logins recorded today.</div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Modal ===== */}
      {modalOpen && (
        <div className="adm-modal" aria-modal="true" role="dialog">
          <div className="adm-modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="adm-modal-dialog">
            <div className="adm-modal-header">
              <div className="adm-modal-title">
                Medicine Alerts — <span className="adm-total">{totalAlerts}</span> total
                <span className="adm-modal-sub">
                  (Out of stock: {alertsCounts.out}, Low stock ≤ {LOW_STOCK_THRESHOLD}: {alertsCounts.low})
                </span>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="adm-modal-close"
              >
                Close
              </button>
            </div>

            <div className="adm-modal-body">
              {alertsAll.length === 0 ? (
                <div className="text-sm text-gray-600">No alerts.</div>
              ) : (
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Quantity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertsAll.map((r) => (
                      <tr key={r.medicine_name}>
                        <td>{r.medicine_name}</td>
                        <td>{r.qty}</td>
                        <td>
                          <span className={r.status === "OUT" ? "badge badge--out" : "badge badge--low"}>
                            {r.status === "OUT" ? "Out of stock" : "Low stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
