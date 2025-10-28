// src/apps/admin/AdminDashboard.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const ORANGE   = "#e9772e";
const PEACH    = "#f3b184";
const PANEL_BG = "#fff7f1";

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
  // ----------------- YOUR ORIGINAL, SENSITIVE COUNTER (UNCHANGED) -----------------
  const [loading, setLoading] = useState(true);
  const [queuedToday, setQueuedToday] = useState(0);
  const { startUtcIso, endUtcIso, manilaDate } = manilaTodayBoundsUTC();

  // Count QUEUED patients created "today" in Manila time.  (UNCHANGED)
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { count, error } = await supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("queued", true)
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

  useEffect(() => {
    const channel = supabase
      .channel("patients-queued-today")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "patients" },
        () => { load(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "patients" },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // ----------------- MEDICINE ON STOCK + ALERTS + OVERVIEW -----------------
  const [medLoading, setMedLoading] = useState(true);
  const [medicineOnStock, setMedicineOnStock] = useState(0);
  const [alerts, setAlerts] = useState([]);
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
    const { data, error } = await supabase
      .from("medicine_catalog")
      .select("classification");
    if (error) {
      console.error("AdminDashboard loadClassifications error:", error);
      setClasses([]);
      return;
    }
    const uniq = Array.from(new Set((data || []).map((r) => r.classification))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    setClasses(uniq);
    if (!uniq.includes(selectedClass)) setSelectedClass(uniq[0] || "");
  }, [selectedClass]);

  const loadAlerts = useCallback(async () => {
    try {
      const { data: cat, error: err1 } = await supabase
        .from("medicine_catalog")
        .select("medicine_name");
      if (err1) throw err1;

      const { data: invAgg, error: err2 } = await supabase
        .from("medicine_inventory")
        .select("medicine_name, quantity, expiration_date")
        .gte("expiration_date", manilaDate);
      if (err2) throw err2;

      const qtyMap = new Map();
      (invAgg || []).forEach((r) => {
        qtyMap.set(r.medicine_name, (qtyMap.get(r.medicine_name) || 0) + (Number(r.quantity) || 0));
      });

      const out = (cat || [])
        .filter((c) => (qtyMap.get(c.medicine_name) || 0) <= 0)
        .map((c) => c.medicine_name)
        .slice(0, 5);
      setAlerts(out);
    } catch (e) {
      console.error("AdminDashboard loadAlerts error:", e);
      setAlerts([]);
    }
  }, [manilaDate]);

  const loadOverview = useCallback(
    async (klass) => {
      if (!klass) { setOverviewRows([]); return; }
      try {
        const { data: cat, error: err1 } = await supabase
          .from("medicine_catalog")
          .select("medicine_name")
          .eq("classification", klass);
        if (err1) throw err1;

        const names = (cat || []).map((r) => r.medicine_name);

        const { data: inv, error: err2 } = await supabase
          .from("medicine_inventory")
          .select("medicine_name, quantity, expiration_date")
          .eq("classification", klass)
          .gte("expiration_date", manilaDate);
        if (err2) throw err2;

        const map = new Map();
        (inv || []).forEach((r) => {
          map.set(r.medicine_name, (map.get(r.medicine_name) || 0) + (Number(r.quantity) || 0));
        });

        const rows = names
          .map((n) => ({ name: n, qty: map.get(n) || 0 }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setOverviewRows(rows);
      } catch (e) {
        console.error("AdminDashboard loadOverview error:", e);
        setOverviewRows([]);
      }
    },
    [manilaDate]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await Promise.all([loadMedicineOnStock(), loadClassifications(), loadAlerts()]);
    })();
    const id = setInterval(() => {
      if (!cancelled) {
        loadMedicineOnStock();
        loadClassifications();
        loadAlerts();
        if (selectedClass) loadOverview(selectedClass);
      }
    }, 15000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMedicineOnStock, loadClassifications, loadAlerts]);

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

  // ----------------- STAFF TODAY (real logins from auth.users) -----------------
  const [staff, setStaff] = useState({ doctor: null, admin: [], nurse: [], bhw: [] });

  const loadStaffToday = useCallback(async () => {
    try {
      // 1) fetch all users who logged in between Manila start/end (UTC)
      const { data: logins, error: rpcErr } = await supabase.rpc(
        "users_logged_in_between",
        { start_ts: startUtcIso, end_ts: endUtcIso }
      );
      if (rpcErr) throw rpcErr;

      const ids = Array.from(new Set((logins || []).map((u) => u.id))).filter(Boolean);
      if (ids.length === 0) { setStaff({ doctor: null, admin: [], nurse: [], bhw: [] }); return; }

      // 2) join to profiles for names & roles
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, firstname, surname, role")
        .in("id", ids);
      if (profErr) throw profErr;

      const norm = (r) => String(r?.role || "").toUpperCase();

      const doctor = (profs || []).find((p) => norm(p) === "DOCTOR") || null;
      const admin  = (profs || []).filter((p) => norm(p) === "ADMIN");
      const nurse  = (profs || []).filter((p) => norm(p) === "NURSE");
      const bhw    = (profs || []).filter((p) => norm(p) === "BHW");

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
      <div className="text-sm text-gray-700 text-center md:text-left">
        DATE TODAY (Manila): <b>{manilaDate}</b>
      </div>

      {/* Top tiles: Total Check Up, Medicine On Stock, Alert */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="rounded-xl border p-4 flex flex-col items-center justify-center"
          style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}
        >
          <div className="text-4xl font-bold" style={{ color: ORANGE }}>
            {loading ? "…" : queuedToday}
          </div>
          <div className="text-sm text-gray-700 mt-1">Total Check Up (today)</div>
        </div>

        <div
          className="rounded-xl border p-4 flex flex-col items-center justify-center"
          style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}
        >
          <div className="text-4xl font-bold" style={{ color: ORANGE }}>
            {medLoading ? "…" : medicineOnStock}
          </div>
          <div className="text-sm text-gray-700 mt-1">Medicine On Stock</div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}
        >
          <div className="font-semibold mb-1">Alert</div>
          {alerts.length === 0 ? (
            <div className="text-sm text-gray-600">No out-of-stock medicines.</div>
          ) : (
            <ul className="list-disc ml-5 text-sm">
              {alerts.map((a) => (
                <li key={a}>{a} out of stock</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom row: Inventory Overview & Staff Today */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}
        >
          <div className="font-semibold mb-2">Medicine Inventory Overview</div>

          <div className="mb-3">
            <label className="text-sm mr-2">Classification</label>
            <select
              className="border rounded px-2 py-1"
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
              <div className="text-sm text-gray-600">No medicines for this classification.</div>
            ) : (
              overviewRows.map((r) => (
                <div key={r.name} className="flex items-center justify-between py-1 border-b border-dashed border-gray-200">
                  <div className="text-sm">{r.name}</div>
                  <div className="text-sm">{r.qty}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}
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
