import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

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

  const year = (parts.find((x) => x.type === "year") || { value: "" }).value;
  const month = (parts.find((x) => x.type === "month") || { value: "" }).value;
  const day = (parts.find((x) => x.type === "day") || { value: "" }).value;

  const startLocal = `${year}-${month}-${day}T00:00:00+08:00`;
  const endLocal = `${year}-${month}-${day}T23:59:59.999+08:00`;
  return {
    startUtcIso: new Date(startLocal).toISOString(),
    endUtcIso: new Date(endLocal).toISOString(),
    manilaDate: `${year}-${month}-${day}`,
  };
}

export default function DoctorDashboardHome() {
  const { startUtcIso, endUtcIso, manilaDate } = useMemo(() => manilaTodayBoundsUTC(), []);

  // ------------- Data States (all logic kept) -------------
  const [admLoading, setAdmLoading] = useState(true);
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

  // ------------------ Loaders ------------------
  const loadAdmTop = useCallback(async () => {
    try {
      setAdmLoading(true);
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
      setAdmLoading(false);
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
      const sum = (data || []).reduce((a, r) => a + (Number(r.quantity) || 0), 0);
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
        const name = r.medicine_name || "";
        if (!name) return;
        qtyMap.set(name, (qtyMap.get(name) || 0) + (Number(r.quantity) || 0));
      });

      const rows = Array.from(qtyMap.entries()).map(([name, qty]) => {
        const status = qty <= 0 ? "OUT" : qty <= LOW_STOCK_THRESHOLD ? "LOW" : "OK";
        return { medicine_name: name, qty, status };
      });

      const low = rows.filter((r) => r.status === "LOW").sort((a, b) => a.qty - b.qty);
      const out = rows
        .filter((r) => r.status === "OUT")
        .sort((a, b) => a.medicine_name.localeCompare(b.medicine_name));
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
      if (!klass) {
        setOverviewRows([]);
        return;
      }
      try {
        const { data: inv, error } = await supabase
          .from("medicine_inventory")
          .select("medicine_name, quantity, expiration_date")
          .eq("classification", klass)
          .gte("expiration_date", manilaDate);
        if (error) throw error;

        const map = new Map();
        (inv || []).forEach((r) => {
          const n = r.medicine_name || "";
          if (!n) return;
          map.set(n, (map.get(n) || 0) + (Number(r.quantity) || 0));
        });

        const rows = Array.from(map.entries())
          .map(([name, qty]) => ({ name, qty }))
          .sort((a, b) => a.name.localeCompare(b.name));
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
    } catch (e) {
      console.error("DoctorDashboardHome loadStaffToday error:", e);
      setStaff({ doctor: null, admin: [], nurse: [], bhw: [] });
    }
  }, [startUtcIso, endUtcIso]);

  // ----------------- Boot + polling -----------------
  useEffect(() => {
    loadAdmTop();
    loadMedicineOnStock();
    loadClassifications();
    loadAlerts();
    loadStaffToday();
    const id = setInterval(() => {
      loadAdmTop();
      loadMedicineOnStock();
      loadClassifications();
      loadAlerts();
      loadStaffToday();
      if (selectedClass) loadOverview(selectedClass);
    }, 15000);
    return () => clearInterval(id);
  }, [
    loadAdmTop,
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

  // ----------------- Realtime -----------------
  useEffect(() => {
    const prCh = supabase
      .channel("doctorhome-patient-records-today")
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_records" }, () => {
        loadAdmTop();
      })
      .subscribe();

    const invCh = supabase
      .channel("doctorhome-inventory")
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
  }, [loadAdmTop, loadMedicineOnStock, loadAlerts, loadOverview, selectedClass]);

  // ----------------- UI -----------------
  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-700 text-center">
        DATE TODAY (Manila): <b>{manilaDate}</b>
      </div>

      {/* === Top Tiles: 3 Equal in One Row === */}
      <div className="flex flex-wrap justify-between gap-4" style={{ width: "100%" }}>
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
            {admLoading ? "…" : queuedToday}
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

      {/* === Bottom Row === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Medicine Inventory Overview */}
        <div
          className="rounded-xl border-2 p-4"
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
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-72 overflow-auto pr-2">
            {overviewRows.length === 0 ? (
              <div className="text-sm text-gray-600">No medicines for this classification.</div>
            ) : (
              overviewRows.map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between py-1 border-b border-dashed"
                  style={{ borderColor: "#d7dfe7" }}
                >
                  <div className="text-sm">{r.name}</div>
                  <div className="text-sm">{r.qty}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Staff Today */}
        <div
          className="rounded-xl border-2 p-4"
          style={{ backgroundColor: PANEL_BG, borderColor: BORDER_NAVY }}
        >
          <div className="font-semibold mb-2">STAFF TODAY</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <div>{nameOf(staff.doctor)}</div>
              <div className="text-gray-600">Doctor-in-Charge</div>
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
    </div>
  );
}
