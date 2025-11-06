import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./nurseDash.css"; // Corrected import for NurseDashboard
const ORANGE = "#e9772e";
const PEACH = "#f3b184";
const PANEL_BG = "#fff7f1";
const BORDER_NAVY = "#0b314e";
const ALERT_RED = "#e15252";
const LOW_STOCK_THRESHOLD = 30;

function manilaTodayBoundsUTC() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

export default function NurseDashboard() {
  const { startUtcIso, endUtcIso, manilaDate } = useMemo(() => manilaTodayBoundsUTC(), []);

  // --- STATES ---
  const [loading, setLoading] = useState(true);
  const [queuedToday, setQueuedToday] = useState(0);
  const [medLoading, setMedLoading] = useState(true);
  const [medicineOnStock, setMedicineOnStock] = useState(0);
  const [alertsPreview, setAlertsPreview] = useState([]);
  const [alertsCounts, setAlertsCounts] = useState({ low: 0, out: 0 });
  const totalAlerts = alertsCounts.low + alertsCounts.out;
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [overviewRows, setOverviewRows] = useState([]);
  const [staff, setStaff] = useState({ doctor: null, admin: [], nurse: [], bhw: [] });

  // --- LOADERS ---
  const loadTotalCheckUp = useCallback(async () => {
    try {
      setLoading(true);
      const { count, error } = await supabase
        .from("patient_records")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startUtcIso)
        .lt("created_at", endUtcIso);
      if (error) throw error;
      setQueuedToday(count || 0);
    } catch {
      setQueuedToday(0);
    } finally {
      setLoading(false);
    }
  }, [startUtcIso, endUtcIso]);

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
    } catch {
      setMedicineOnStock(0);
    } finally {
      setMedLoading(false);
    }
  }, [manilaDate]);

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

      const low = rows.filter((r) => r.status === "LOW").sort((a, b) => a.qty - b.qty);
      const out = rows.filter((r) => r.status === "OUT").sort((a, b) =>
        a.medicine_name.localeCompare(b.medicine_name)
      );
      const allAlerts = [...out, ...low];
      setAlertsCounts({ low: low.length, out: out.length });

      const preview = allAlerts
        .slice(0, 5)
        .map((r) => `${r.medicine_name} — ${r.status === "OUT" ? "out of stock" : `low (${r.qty})`}`);
      setAlertsPreview(preview);
    } catch {
      setAlertsCounts({ low: 0, out: 0 });
      setAlertsPreview([]);
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
    } catch {
      setClasses([]);
    }
  }, [manilaDate, selectedClass]);

  const loadOverview = useCallback(
    async (klass) => {
      if (!klass) return setOverviewRows([]);
      try {
        const { data: inv, error } = await supabase
          .from("medicine_inventory")
          // ADDED: fetch dosage_form so we can display medicine type/form
          .select("medicine_name, dosage_form, quantity, expiration_date")
          .eq("classification", klass)
          .gte("expiration_date", manilaDate);
        if (error) throw error;

        // CHANGED: aggregate by (medicine_name + dosage_form)
        const map = new Map(); // key -> `${name}||${form}`
        (inv || []).forEach((r) => {
          const name = r.medicine_name ?? "";
          const form = r.dosage_form ?? "—";
          const key = `${name}||${form}`;
          map.set(key, (map.get(key) || 0) + (Number(r.quantity) || 0));
        });

        const rows = Array.from(map.entries())
          .map(([key, qty]) => {
            const [name, form] = key.split("||");
            return { name, form, qty: Number(qty) || 0 };
          })
          // ADDED: hide medicines that have no available stock
          .filter((r) => r.qty > 0)
          .sort((a, b) => {
            const byName = a.name.localeCompare(b.name);
            if (byName !== 0) return byName;
            return String(a.form).localeCompare(String(b.form));
          });

        setOverviewRows(rows);
      } catch {
        setOverviewRows([]);
      }
    },
    [manilaDate]
  );

  const nameOf = (p) => (p ? `${p.firstname ?? ""} ${p.surname ?? ""}`.trim() : "—");

  const loadStaffToday = useCallback(async () => {
    try {
      const { data: logins, error: rpcErr } = await supabase.rpc("users_logged_in_between", {
        start_ts: startUtcIso,
        end_ts: endUtcIso,
      });
      if (rpcErr) throw rpcErr;

      const ids = Array.from(new Set((logins || []).map((u) => u.id))).filter(Boolean);
      if (ids.length === 0) {
        setStaff({ doctor: null, admin: [], nurse: [], bhw: [] });
        return;
      }

      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, firstname, surname, role")
        .in("id", ids);
      if (profErr) throw profErr;

      const norm = (r) => String(r?.role || "").toUpperCase();
      const doctor = (profs || []).find((p) => norm(p) === "DOCTOR") || null;
      const admin = (profs || []).filter((p) => norm(p) === "ADMIN");
      const nurse = (profs || []).filter((p) => norm(p) === "NURSE");
      const bhw = (profs || []).filter((p) => norm(p) === "BHW");
      setStaff({ doctor, admin, nurse, bhw });
    } catch {
      setStaff({ doctor: null, admin: [], nurse: [], bhw: [] });
    }
  }, [startUtcIso, endUtcIso]);

  // --- Boot + polling ---
  useEffect(() => {
    loadTotalCheckUp();
    loadMedicineOnStock();
    loadClassifications();
    loadAlerts();
    loadStaffToday();
    const id = setInterval(() => {
      loadTotalCheckUp();
      loadMedicineOnStock();
      loadClassifications();
      loadAlerts();
      loadStaffToday();
      if (selectedClass) loadOverview(selectedClass);
    }, 15000);
    return () => clearInterval(id);
  }, [
    loadTotalCheckUp,
    loadMedicineOnStock,
    loadClassifications,
    loadAlerts,
    loadStaffToday,
    selectedClass,
    loadOverview,
  ]);

  useEffect(() => {
    if (selectedClass) loadOverview(selectedClass);
  }, [selectedClass, loadOverview]);

  // --- Realtime listeners ---
  useEffect(() => {
    const prCh = supabase
      .channel("nursehome-patient-records-today")
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_records" }, () => {
        loadTotalCheckUp();
      })
      .subscribe();

    const invCh = supabase
      .channel("nursehome-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_inventory" }, () => {
        loadMedicineOnStock();
        loadAlerts();
        if (selectedClass) loadOverview(selectedClass);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(prCh);
      supabase.removeChannel(invCh);
    };
  }, [loadTotalCheckUp, loadMedicineOnStock, loadAlerts, loadOverview, selectedClass]);

  // --- UI ---
  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-700 text-center">
        DATE TODAY (Manila): <b>{manilaDate}</b>
      </div>

      {/* Top Tiles */}
      <div className="tiles-container">
        {/* Total Check Up */}
        <div className="tile" style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}>
          <div className="tile-value" style={{ color: ORANGE }}>
            {loading ? "…" : queuedToday}
          </div>
          <div className="tile-label">Total Check Up</div>
        </div>

        {/* Medicine On Stock */}
        <div className="tile" style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}>
          <div className="tile-value" style={{ color: ORANGE }}>
            {medLoading ? "…" : medicineOnStock}
          </div>
          <div className="tile-label">Medicine On Stock</div>
        </div>

        {/* Alert */}
        <div className="tile" style={{ backgroundColor: PANEL_BG, borderColor: ALERT_RED }}>
          <div className="tile-title">Alert</div>
          {totalAlerts === 0 ? (
            <div className="tile-text">No low/out-of-stock medicines.</div>
          ) : (
            <ul className="alerts-preview">
              {alertsPreview.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom Panels */}
      <div className="bottom-panels">
        {/* Medicine Inventory Overview */}
        <div className="panel" style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}>
          <div className="panel-title">Medicine Inventory Overview</div>
          <div className="panel-select">
            <label className="select-label">Classification</label>
            <select
              className="select-input"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {classes.length === 0 && <option value="">—</option>}
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="overview-list">
            {overviewRows.length === 0 ? (
              <div className="overview-empty">No medicines with available stock for this classification.</div>
            ) : (
              overviewRows.map((r) => (
                <div
                  key={`${r.name}::${r.form}`}
                  className="overview-row"
                >
                  <div className="overview-name">{r.name}</div>
                  <div className="overview-form">{r.form ?? "—"}</div>
                  <div className="overview-qty">{r.qty}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Staff Today */}
        <div className="panel" style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}>
          <div className="panel-title">STAFF TODAY</div>
          <div className="staff-list">
            <div className="staff-item">
              <div>{nameOf(staff.doctor)}</div>
              <div className="staff-role">Doctor</div>
            </div>

            {staff.admin.map((p) => (
              <div key={p.id} className="staff-item">
                <div>{nameOf(p)}</div>
                <div className="staff-role">Admin</div>
              </div>
            ))}

            {staff.nurse.map((p) => (
              <div key={p.id} className="staff-item">
                <div>{nameOf(p)}</div>
                <div className="staff-role">Nurse</div>
              </div>
            ))}

            {staff.bhw.map((p) => (
              <div key={p.id} className="staff-item">
                <div>{nameOf(p)}</div>
                <div className="staff-role">BHW</div>
              </div>
            ))}

            {!staff.admin.length && !staff.nurse.length && !staff.bhw.length && (
              <div className="staff-empty">No staff logins recorded today.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
