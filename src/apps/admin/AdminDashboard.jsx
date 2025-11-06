// src/apps/admin/AdminDashboard.jsx
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

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
    <div className="space-y-6">
      {/* Date label centered like the mock */}
      <div className="text-sm text-gray-700 text-center">
        DATE TODAY (Manila): <b>{manilaDate}</b>
      </div>

     {/* ===== Top tiles: EXACT 3 tiles in one row ===== */}
<div
  className="flex flex-wrap justify-between gap-4"
  style={{ width: "100%" }}
>
  {/* Total Check Up */}
  <div
    className="flex-1 min-w-[240px] rounded-xl border-2 p-4 flex flex-col items-center justify-center text-center"
    style={{
      backgroundColor: PANEL_BG,
      borderColor: BORDER_NAVY,
      maxWidth: "32%",
      flexBasis: "32%",
    }}
  >
    <div className="text-4xl font-extrabold leading-none" style={{ color: ORANGE }}>
      {loading ? "…" : queuedToday}
    </div>
    <div className="text-[13px] text-gray-800 mt-1">Total Check Up</div>
  </div>

  {/* Medicine On Stock */}
  <div
    className="flex-1 min-w-[240px] rounded-xl border-2 p-4 flex flex-col items-center justify-center text-center"
    style={{
      backgroundColor: PANEL_BG,
      borderColor: BORDER_NAVY,
      maxWidth: "32%",
      flexBasis: "32%",
    }}
  >
    <div className="text-4xl font-extrabold leading-none" style={{ color: ORANGE }}>
      {medLoading ? "…" : medicineOnStock}
    </div>
    <div className="text-[13px] text-gray-800 mt-1">Medicine On Stock</div>
  </div>

  {/* Alert */}
  <div
    onClick={() => totalAlerts > 0 && setModalOpen(true)}
    role="button"
    tabIndex={0}
    className="flex-1 min-w-[240px] rounded-xl border-2 p-4 focus:outline-none cursor-pointer"
    style={{
      backgroundColor: PANEL_BG,
      borderColor: ALERT_RED,
      maxWidth: "32%",
      flexBasis: "32%",
    }}
  >
    <div className="font-semibold mb-1">Alert</div>
    {totalAlerts === 0 ? (
      <div className="text-sm text-gray-600">No low/out-of-stock medicines.</div>
    ) : (
      <ul className="list-disc ml-5 text-sm space-y-0.5">
        {alertsPreview.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    )}
  </div>
</div>


      {/* ===== Bottom row: two even cards ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Inventory Overview */}
        <div
          className="rounded-xl border-[3px] p-4"
          style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}
        >
          <div className="font-semibold mb-2">Medicine Inventory Overview</div>

          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm">Classification</label>
            <select
              className="border rounded px-2 py-1 text-xs outline-none"
              style={{ borderColor: "#cbd5e1" }}
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {classes.length === 0 && <option value="">—</option>}
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="max-h-72 overflow-auto pr-2">
            {overviewRows.length === 0 ? (
              <div className="text-sm text-gray-600">No medicines with available stock for this classification.</div>
            ) : (
              overviewRows.map((r) => (
                <div
                  key={`${r.name}::${r.form}`}
                  className="flex items-center justify-between py-1 border-b border-dashed"
                  style={{ borderColor: "#d7dfe7" }}
                >
                  <div className="text-sm flex items-center gap-2">
                    <span>{r.name}</span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full border"
                      style={{ borderColor: "#cbd5e1" }}
                      title="Dosage form"
                    >
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
        <div
          className="rounded-xl border-[3px] p-4"
          style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}
        >
          <div className="font-semibold mb-2">STAFF TODAY</div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <div>{nameOf(staff.doctor)}</div>
              <div className="text-gray-600">Doctor</div>
            </div>

            {staff.admin.map((p) => (
              <div className="flex justify-between" key={p.id}>
                <div>{nameOf(p)}</div>
                <div className="text-gray-600">Admin</div>
              </div>
            ))}

            {staff.nurse.map((p) => (
              <div className="flex justify-between" key={p.id}>
                <div>{nameOf(p)}</div>
                <div className="text-gray-600">Nurse</div>
              </div>
            ))}

            {staff.bhw.map((p) => (
              <div className="flex justify-between" key={p.id}>
                <div>{nameOf(p)}</div>
                <div className="text-gray-600">BHW</div>
              </div>
            ))}

            {!staff.admin.length && !staff.nurse.length && !staff.bhw.length && (
              <div className="text-gray-600">No staff logins recorded today.</div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Modal (unchanged logic, slight visual alignment) ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-lg w-[92vw] max-w-2xl border" style={{ borderColor: PEACH }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#eee" }}>
              <div className="font-semibold">
                Medicine Alerts — <span style={{ color: ORANGE }}>{totalAlerts}</span> total
                <span className="ml-3 text-xs text-gray-600">
                  (Out of stock: {alertsCounts.out}, Low stock ≤ {LOW_STOCK_THRESHOLD}: {alertsCounts.low})
                </span>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded px-3 py-1 text-sm"
                style={{ background: NAVY, color: "white" }}
              >
                Close
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-auto">
              {alertsAll.length === 0 ? (
                <div className="text-sm text-gray-600">No alerts.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: "#e6eef6" }}>
                      <th className="py-2 pr-3">Medicine</th>
                      <th className="py-2 pr-3">Quantity</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertsAll.map((r) => (
                      <tr key={r.medicine_name} className="border-b last:border-0" style={{ borderColor: "#f0f0f0" }}>
                        <td className="py-2 pr-3">{r.medicine_name}</td>
                        <td className="py-2 pr-3">{r.qty}</td>
                        <td className="py-2 pr-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs border"
                            style={{
                              background: r.status === "OUT" ? "#fee9e7" : "#fff7e6",
                              color: r.status === "OUT" ? "#b42318" : ORANGE,
                              borderColor: r.status === "OUT" ? "#f7c8c3" : "#fde3c0",
                            }}
                          >
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
