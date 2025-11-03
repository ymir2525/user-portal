// src/apps/admin/DataAnalytics.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";

/* Theme */
const NAVY = "#0b314e";
const GREEN_DARK = "#0f7a3e";
const GREEN_LIGHT = "#3ddc7d";
const PANEL_BG = "#fff7f1";
const ORANGE = "#e9772e";

/* ---------- Helpers (Manila/UTC + ranges) ---------- */
const pad = (n) => String(n).padStart(2, "0");

function fmtPgTimestampUTC(d) {
  // single-line template to avoid JSX parser confusion
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}:${pad(d.getUTCSeconds())}`;
}

function manilaDayUtcRange(dateStr) {
  const a = new Date(`${dateStr}T00:00:00+08:00`);
  const b = new Date(`${dateStr}T00:00:00+08:00`);
  b.setDate(b.getDate() + 1);
  return { from: fmtPgTimestampUTC(a), to: fmtPgTimestampUTC(b) };
}

function todayYMD() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year").value}-${p.find((x) => x.type === "month").value}-${p.find((x) => x.type === "day").value}`;
}

function ymdToMonthStr(d = new Date(), tz = "Asia/Manila") {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year").value}-${p.find((x) => x.type === "month").value}`;
}

function daysInMonthUTC(d) {
  const y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

function manilaMonthUtcRange(ymStr) {
  const [y, m] = ymStr.split("-").map(Number);
  const start = new Date(`${y}-${pad(m)}-01T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { from: fmtPgTimestampUTC(start), to: fmtPgTimestampUTC(end) };
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const addMonths = (d, n) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

/* Axis helpers */
function niceStep(max) {
  if (max <= 5) return 1;
  if (max <= 20) return 5;
  if (max <= 50) return 5;
  if (max <= 100) return 10;
  return 20;
}
function buildTicks(max) {
  const step = niceStep(max || 1);
  const end = Math.max(step, Math.ceil((max || 1) / step) * step);
  const t = [];
  for (let v = step; v <= end; v += step) t.push(v);
  return { step, end, ticks: t };
}

/* ---------- Component ---------- */
export default function DataAnalytics() {
  /* Tabs */
  const [tab, setTab] = useState("dispense"); // "dispense" | "expiry"

  /* Day picker (chart) */
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const range = useMemo(() => manilaDayUtcRange(selectedDate), [selectedDate]);

  /* Month picker (rank table) */
  const [selectedMonth, setSelectedMonth] = useState(ymdToMonthStr());

  /* Expiry Proximity controls (client-side filtering) */
  const now = new Date();
  const currentYear = now.getFullYear();

  // default: show all -> year "ALL", month disabled until year chosen
  const [expYear, setExpYear] = useState("ALL"); // "ALL" | number-string
  const [expMonth, setExpMonth] = useState("ALL"); // "ALL" | "01".."12"

  // Dynamic year options (starts with ALL + current year, expands once data loads)
  const [yearOptions, setYearOptions] = useState(["ALL", String(currentYear)]);

  /* Common dropdowns */
  const [classes, setClasses] = useState(["ALL"]);
  const [classification, setClassification] = useState("ALL");
  const [dosageForms, setDosageForms] = useState([
    "tablet",
    "capsule",
    "syrup",
    "ointment",
    "drops",
    "injection",
    "suspension",
    "cream",
    "drop",
    "other",
  ]);
  const [medicineType, setMedicineType] = useState("ALL");

  const [bars, setBars] = useState([]); // {name,dispensed,forecast,stock,status}
  const [loading, setLoading] = useState(false);

  const [rankRows, setRankRows] = useState([]); // {medicine_name,type,dispensed,forecast,status,restockHint}

  /* Tooltips */
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, text: "" }); // chart
  const [rankTip, setRankTip] = useState({ show: false, x: 0, y: 0, text: "" }); // status chip

  /* EXPIRY PROXIMITY */
  const [expiryRows, setExpiryRows] = useState([]); // full dataset (no server filters)
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryNote, setExpiryNote] = useState("");

  /* Load dropdown options once */
  useEffect(() => {
    (async () => {
      const { data: cat } = await supabase.from("medicine_catalog").select("classification,dosage_form");
      const cls = Array.from(new Set((cat || []).map((r) => r.classification))).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
      setClasses(["ALL", ...cls]);

      const forms = Array.from(new Set([...(cat || []).map((r) => r.dosage_form).filter(Boolean), ...dosageForms])).sort(
        (a, b) => String(a).localeCompare(String(b))
      );
      setDosageForms(forms);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Chart: dispensed (day) + 90d-per-day forecast + stock ---------- */
  const loadDispense = useCallback(async () => {
    try {
      setLoading(true);

      // actual day (respect filters for chart)
      let q = supabase
        .from("medicine_transactions")
        .select("medicine_name,dosage_form,classification,quantity")
        .eq("direction", "out")
        .gte("created_at", range.from)
        .lt("created_at", range.to);
      if (classification !== "ALL") q = q.eq("classification", classification);
      if (medicineType !== "ALL") q = q.eq("dosage_form", medicineType);
      const { data: winTx } = await q;

      const dispMap = new Map();
      (winTx || []).forEach((r) => {
        dispMap.set(r.medicine_name, (dispMap.get(r.medicine_name) || 0) + (Number(r.quantity) || 0));
      });

      // forecast (90d avg → per-day)
      const now = new Date();
      const n90 = new Date();
      n90.setDate(now.getDate() - 90);
      let fq = supabase
        .from("medicine_transactions")
        .select("medicine_name,dosage_form,classification,quantity")
        .eq("direction", "out")
        .gte("created_at", fmtPgTimestampUTC(n90))
        .lt("created_at", fmtPgTimestampUTC(now));
      if (classification !== "ALL") fq = fq.eq("classification", classification);
      if (medicineType !== "ALL") fq = fq.eq("dosage_form", medicineType);
      const { data: histTx } = await fq;

      const fMap = new Map();
      (histTx || []).forEach((r) => {
        fMap.set(r.medicine_name, (fMap.get(r.medicine_name) || 0) + (Number(r.quantity) || 0));
      });
      for (const [k, v] of fMap) fMap.set(k, Math.round(v / 90));

      // stock snapshot
      let iq = supabase
        .from("medicine_inventory")
        .select("medicine_name,dosage_form,classification,quantity,expiration_date")
        .gte("expiration_date", todayYMD());
      if (classification !== "ALL") iq = iq.eq("classification", classification);
      if (medicineType !== "ALL") iq = iq.eq("dosage_form", medicineType);
      const { data: inv } = await iq;

      const sMap = new Map();
      (inv || []).forEach((r) => {
        sMap.set(r.medicine_name, (sMap.get(r.medicine_name) || 0) + (Number(r.quantity) || 0));
      });

      const names = Array.from(new Set([...dispMap.keys(), ...fMap.keys(), ...sMap.keys()])).sort((a, b) =>
        a.localeCompare(b)
      );
      const rows = names.map((name) => {
        const dispensed = dispMap.get(name) || 0;
        const forecast = fMap.get(name) || 0;
        const stock = sMap.get(name) ?? 0;
        let status = "Monitor";
        if (stock > 100) status = "Stable";
        else if (stock <= 30) status = "Low Stock";
        else if (stock <= forecast) status = "Reorder Soon";
        return { name, dispensed, forecast, stock, status };
      });

      setBars(rows);
    } catch (e) {
      console.error(e);
      setBars([]);
    } finally {
      setLoading(false);
    }
  }, [classification, medicineType, range]);

  useEffect(() => {
    loadDispense();
  }, [loadDispense]);

  /* ---------- Rank (MONTH): aggregate dispensed for the whole month ---------- */
  const loadRank = useCallback(async () => {
    try {
      const monthRange = manilaMonthUtcRange(selectedMonth);

      // A) Dispensed within the month
      const { data: rankTx } = await supabase
        .from("medicine_transactions")
        .select("medicine_name,dosage_form,quantity")
        .eq("direction", "out")
        .gte("created_at", monthRange.from)
        .lt("created_at", monthRange.to);

      const dispMap = new Map(); // key=name:::type
      (rankTx || []).forEach((r) => {
        const key = `${r.medicine_name}:::${r.dosage_form || "—"}`;
        dispMap.set(key, (dispMap.get(key) || 0) + (Number(r.quantity) || 0));
      });
      if (dispMap.size === 0) {
        setRankRows([]);
        return;
      }

      // B) Type lookup (inventory preferred, then catalog)
      const typeLookup = new Map(); // name -> type
      const { data: invTypes } = await supabase
        .from("medicine_inventory")
        .select("medicine_name,dosage_form")
        .gte("expiration_date", todayYMD());
      (invTypes || []).forEach((r) => {
        if (r.dosage_form) typeLookup.set(r.medicine_name, r.dosage_form);
      });
      const { data: catTypes } = await supabase.from("medicine_catalog").select("medicine_name,dosage_form");
      (catTypes || []).forEach((r) => {
        if (!typeLookup.has(r.medicine_name) && r.dosage_form) typeLookup.set(r.medicine_name, r.dosage_form);
      });

      // C) Stock (non-expired)
      const { data: invAll } = await supabase
        .from("medicine_inventory")
        .select("medicine_name,dosage_form,quantity")
        .gte("expiration_date", todayYMD());
      const stockMap = new Map();
      (invAll || []).forEach((r) => {
        const key = `${r.medicine_name}:::${r.dosage_form || "—"}`;
        stockMap.set(key, (stockMap.get(key) || 0) + (Number(r.quantity) || 0));
      });

      // D) Daily average (last 180d) → forecast next month
      const nowUTC = new Date();
      const n180UTC = new Date();
      n180UTC.setDate(nowUTC.getDate() - 180);
      const { data: hist } = await supabase
        .from("medicine_transactions")
        .select("medicine_name,dosage_form,quantity")
        .eq("direction", "out")
        .gte("created_at", fmtPgTimestampUTC(n180UTC))
        .lt("created_at", fmtPgTimestampUTC(nowUTC));

      const avgMap = new Map(); // key -> sum
      (hist || []).forEach((r) => {
        const key = `${r.medicine_name}:::${r.dosage_form || "—"}`;
        avgMap.set(key, (avgMap.get(key) || 0) + (Number(r.quantity) || 0));
      });
      for (const [k, v] of avgMap) avgMap.set(k, v / 180); // daily average

      // We forecast for the next month after selectedMonth
      const monthStart = new Date(`${selectedMonth}-01T00:00:00+08:00`);
      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
      const daysNextMonth = daysInMonthUTC(nextMonthStart);

      const rows = Array.from(dispMap.entries()).map(([key, dispensed]) => {
        let [name, type] = key.split(":::");
        if (!type || type === "—") type = typeLookup.get(name) || "—";

        const stock = stockMap.get(`${name}:::${type}`) ?? stockMap.get(`${name}:::—`) ?? 0;
        const dailyAvg = avgMap.get(`${name}:::${type}`) ?? avgMap.get(`${name}:::—`) ?? 0;
        const forecastNextMonth = Math.round(dailyAvg * daysNextMonth);

        // naive 12-month runout projection
        let remaining = stock;
        let m = new Date(monthStart);
        for (let i = 0; i < 12; i++) {
          const need = Math.round(dailyAvg * daysInMonthUTC(m));
          if (remaining - need <= 0) break;
          remaining -= need;
          m.setUTCMonth(m.getUTCMonth() + 1);
        }
        const restockHint = `Restock before ${m.toLocaleString("en-US", { month: "short", year: "numeric" })}`;

        let status = "Monitor";
        if (stock > 100) status = "Stable";
        else if (stock <= 30) status = "Low Stock";
        else if (stock <= forecastNextMonth) status = "Reorder Soon";

        return { medicine_name: name, type, dispensed, forecast: forecastNextMonth, status, restockHint };
      });

      rows.sort((a, b) => b.dispensed - a.dispensed);
      setRankRows(rows.slice(0, 50));
    } catch (e) {
      console.error("loadRank error:", e);
      setRankRows([]);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadRank();
  }, [loadRank]);

  /* ---------- Average Expiry Proximity ---------- */

  // Display-only SKU generator: <3 letters initialism>-<TypeInitial><YY><MM>-<id%1000>
  function makeSKU(row) {
    const code =
      (row.medicine_name || "")
        .replace(/[^A-Za-z]/g, " ")
        .trim()
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("")
        .slice(0, 3) || "MED";
    const t = (row.dosage_form || "X")[0].toUpperCase();
    const d = row.expiration_date ? new Date(row.expiration_date) : null;
    const yy = d ? String(d.getFullYear()).slice(-2) : "00";
    const mm = d ? pad(d.getMonth() + 1) : "00";
    const tail = String((row.id ?? 0) % 1000).padStart(3, "0");
    return `${code}-${t}${yy}${mm}-${tail}`;
  }

  // Fetch ALL lots once; filter on the client with Year/Month and fallback windows
  const loadExpiry = useCallback(async () => {
    try {
      setExpiryLoading(true);
      const { data, error } = await supabase
        .from("medicine_inventory")
        .select("id, medicine_name, dosage_form, quantity, expiration_date")
        .order("expiration_date", { ascending: true });

      if (error) throw error;

      const rows = (data || []).map((r) => ({ ...r, sku: makeSKU(r) }));
      setExpiryRows(rows);
    } catch (e) {
      console.error("expiry fetch failed:", e?.message || e);
      setExpiryRows([]);
    } finally {
      setExpiryLoading(false);
    }
  }, []);

  // auto fetch when tab becomes active
  useEffect(() => {
    if (tab === "expiry" && !expiryRows.length) loadExpiry();
  }, [tab, loadExpiry, expiryRows.length]);

  // Realtime: keep year options & list fresh when inventory changes
  useEffect(() => {
    const ch = supabase
      .channel("realtime_inventory_expiry")
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_inventory" }, () => {
        loadExpiry();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadExpiry]);

  // Compute dynamic year options from current inventory (never offer past years)
  const recomputeYearOptionsFromRows = useCallback(
    (rows) => {
      const maxExpYear = (rows || []).reduce((max, r) => {
        const y = r.expiration_date ? new Date(r.expiration_date).getFullYear() : currentYear;
        return Math.max(max, y);
      }, currentYear);

      const years = ["ALL"];
      for (let y = currentYear; y <= maxExpYear; y++) years.push(String(y));
      setYearOptions(years);

      // keep selected year in range
      setExpYear((prev) => {
        if (prev === "ALL") return prev;
        const py = Number(prev);
        if (Number.isNaN(py) || py < currentYear) return String(currentYear);
        if (py > maxExpYear) return String(maxExpYear);
        return prev;
      });
    },
    [currentYear]
  );

  // Whenever expiryRows changes, recompute year options
  useEffect(() => {
    if (expiryRows.length) recomputeYearOptionsFromRows(expiryRows);
    else setYearOptions(["ALL", String(currentYear)]);
  }, [expiryRows, recomputeYearOptionsFromRows, currentYear]);

  // Client-side filter for expiry with fallback buckets:
  //  - if exact Year/Month has no matches:
  //       1) show those within <= 24 months after the selected period
  //       2) then show those beyond 24 months
  const expiryCalc = useMemo(() => {
    if (!expiryRows.length) return { rows: [], note: "" };

    // Show-all mode
    if (expYear === "ALL") return { rows: expiryRows, note: "" };

    // target period
    const targetMonth = expMonth === "ALL" ? "01" : expMonth;
    const targetStart = new Date(`${expYear}-${targetMonth}-01T00:00:00+08:00`);
    const targetEnd = expMonth === "ALL" ? addMonths(targetStart, 12) : addMonths(targetStart, 1);

    // Exact matches
    const inRange = expiryRows.filter((r) => {
      if (!r.expiration_date) return false;
      const d = new Date(r.expiration_date);
      return d >= targetStart && d < targetEnd;
    });

    if (inRange.length) return { rows: inRange, note: "" };

    // Fallback buckets relative to end of selected period
    const within24 = expiryRows.filter((r) => {
      if (!r.expiration_date) return false;
      const d = new Date(r.expiration_date);
      return d >= targetEnd && d < addMonths(targetEnd, 24); // ≤ 2 years after
    });

    const beyond24 = expiryRows.filter((r) => {
      if (!r.expiration_date) return false;
      const d = new Date(r.expiration_date);
      return d >= addMonths(targetEnd, 24); // > 2 years after
    });

    const note =
      within24.length || beyond24.length
        ? "No exact matches. Showing the closest future expiries: first within the next 2 years, then more than 2 years ahead."
        : "No future expiries found.";

    return { rows: [...within24, ...beyond24], note };
  }, [expiryRows, expYear, expMonth]);

  const expiryView = expiryCalc.rows;
  const expiryViewNote = expiryCalc.note;

  useEffect(() => {
    setExpiryNote(expiryViewNote || "");
  }, [expiryViewNote]);

  /* Axis scale for chart */
  const maxVal = Math.max(0, ...bars.map((b) => Math.max(b.dispensed, b.forecast)));
  const { end: tickEnd, ticks } = buildTicks(maxVal);

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4 max-w-5xl">
      <h3 className="text-xl font-semibold">Data Analytics</h3>

      {/* Top tabs */}
      <div className="flex gap-3">
        <button
          onClick={() => setTab("dispense")}
          className={`px-4 py-2 rounded-full font-medium ${tab === "dispense" ? "text-white" : "text-[#0b314e]"}`}
          style={{ background: tab === "dispense" ? NAVY : "#e6eef5" }}
        >
          Medicine Dispense with Forecast
        </button>
        <button
          onClick={() => setTab("expiry")}
          className={`px-4 py-2 rounded-full font-medium ${tab === "expiry" ? "text-white" : "text-[#0b314e]"}`}
          style={{ background: tab === "expiry" ? NAVY : "#e6eef5" }}
        >
          Average Expiry Proximity
        </button>
      </div>

      {tab === "dispense" && (
        <>
          {/* Filters: Day for chart / Month for rank */}
          <div className="rounded-xl border p-3" style={{ backgroundColor: PANEL_BG, borderColor: "#f3b184" }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-sm mb-1">Select Date (Chart)</div>
                <input
                  type="date"
                  className="border rounded-full px-3 py-1 w-full"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm mb-1">Select Month (Rank)</div>
                <input
                  type="month"
                  className="border rounded-full px-3 py-1 w-full"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Chart card */}
          <div
            className="relative p-4 bg-white"
            style={{ border: `1.5px solid ${NAVY}`, borderRadius: 14, boxShadow: `0 0 0 1px ${NAVY} inset` }}
            onMouseLeave={() => setTip((t) => ({ ...t, show: false }))}
          >
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <label className="text-sm font-semibold">
                Classification:&nbsp;
                <select
                  className="border rounded-full px-3 py-1 text-sm"
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                >
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Medicine Type:&nbsp;
                <select
                  className="border rounded-full px-3 py-1 text-sm"
                  value={medicineType}
                  onChange={(e) => setMedicineType(e.target.value)}
                >
                  <option value="ALL">ALL</option>
                  {dosageForms.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Bars */}
            {loading ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : (
              <>
                <div className="space-y-2">
                  {bars.map((b, i) => {
                    const actualPct = tickEnd ? Math.min(100, (b.dispensed / tickEnd) * 100) : 0;
                    const forecastGap = Math.max(b.forecast - b.dispensed, 0);
                    const gapPct = tickEnd ? Math.min(100, (forecastGap / tickEnd) * 100) : 0;

                    return (
                      <div key={b.name + i} className="grid" style={{ gridTemplateColumns: "140px 1fr", alignItems: "center" }}>
                        <div className="text-sm text-gray-800">{b.name}</div>

                        <div
                          className="relative"
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left + 12;
                            const y = e.clientY - rect.top - 14; // above cursor
                            setTip({
                              show: true,
                              x,
                              y,
                              text: `${b.name}: ${b.dispensed} dispensed`,
                            });
                          }}
                        >
                          {/* Gray track */}
                          <div className="h-4 rounded overflow-hidden bg-gray-200 border border-gray-300">
                            {/* actual + forecast remainder */}
                            <div className="h-4" style={{ width: `${actualPct}%`, background: GREEN_DARK }} />
                            <div className="h-4 -mt-4" style={{ width: `${actualPct + gapPct}%`, background: GREEN_LIGHT, opacity: 0.65 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Axis */}
                <div className="mt-3 ml-[140px] relative">
                  <div className="h-px bg-gray-300" />
                  {ticks.map((t) => (
                    <span
                      key={t}
                      className="absolute text-[12px] text-gray-700"
                      style={{ left: `${(t / tickEnd) * 100}%`, transform: "translateX(-50%)", top: 6 }}
                    >
                      {t}
                    </span>
                  ))}
                  <div className="text-[12px] text-gray-700 text-center mt-6">Quantity</div>
                </div>

                {/* Tooltip (above cursor) */}
                {tip.show && (
                  <div
                    style={{
                      position: "absolute",
                      left: clamp(tip.x + 140, 8, 800),
                      top: clamp(tip.y - 8, 8, 400),
                      pointerEvents: "none",
                      background: "white",
                      border: "1px solid #d1d5db", // <-- fixed quotes
                      borderRadius: 8,
                      padding: "6px 8px",
                      boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                      fontSize: 12,
                      zIndex: 20,
                    }}
                  >
                    {tip.text}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rank table (Monthly) */}
          <div
            className="relative rounded-xl border p-4"
            style={{ backgroundColor: "white", borderColor: "#e5e7eb" }}
            onMouseLeave={() => setRankTip((s) => ({ ...s, show: false }))}
          >
            <div className="mb-1 font-semibold">
              Most Ordered Medicine Rank — {new Date(`${selectedMonth}-01`).toLocaleString("en-US", { month: "long", year: "numeric" })}
            </div>
            <div className="text-xs text-gray-500 mb-3">Aggregated for the whole month. Forecast is for the next month.</div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Medicine Name</th>
                    <th className="py-2 pr-4">Medicine Type</th>
                    <th className="py-2 pr-4">Dispensed (month)</th>
                    <th className="py-2 pr-4">Forecasted Demand (next month)</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rankRows.map((r, i) => (
                    <tr key={r.medicine_name + r.type + i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.medicine_name}</td>
                      <td className="py-2 pr-4">{r.type || "—"}</td>
                      <td className="py-2 pr-4">{r.dispensed}</td>
                      <td className="py-2 pr-4">{r.forecast}</td>
                      <td className="py-2 pr-4">
                        <span
                          className="px-2 py-0.5 rounded-full border cursor-default"
                          style={{
                            borderColor: "#ddd",
                            background:
                              r.status === "Stable" ? "#e7f8ee" : r.status === "Reorder Soon" ? "#fff7e6" : r.status === "Low Stock" ? "#fee9e7" : "#f1f1f1",
                            color: r.status === "Stable" ? "#0f7a3e" : r.status === "Reorder Soon" ? ORANGE : r.status === "Low Stock" ? "#b42318" : "#666",
                          }}
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left + 8;
                            const y = e.clientY - rect.top - 14;
                            setRankTip({
                              show: true,
                              x,
                              y,
                              text: `${r.status} — ${r.restockHint}`,
                            });
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!rankRows.length && (
                    <tr>
                      <td className="py-2 text-gray-600" colSpan="5">
                        No medicines dispensed in this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {rankTip.show && (
              <div
                style={{
                  position: "absolute",
                  left: clamp(rankTip.x + 8, 8, 800),
                  top: clamp(rankTip.y - 8, 8, 400),
                  pointerEvents: "none",
                  background: "white",
                  border: "1px solid #d1d5db", // <-- fixed quotes
                  borderRadius: 8,
                  padding: "6px 8px",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                  fontSize: 12,
                  zIndex: 20,
                }}
              >
                {rankTip.text}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "expiry" && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: "white", borderColor: NAVY }}>
          <div className="mb-3 font-semibold">Average Expiry Proximity</div>

          {/* Controls (automatic; show-all by default; Month disabled until a Year is chosen) */}
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="text-sm font-semibold">
              Year:&nbsp;
              <select
                className="border rounded-full px-3 py-1 text-sm"
                value={expYear}
                onChange={(e) => {
                  const v = e.target.value;
                  setExpYear(v);
                  if (v === "ALL") setExpMonth("ALL");
                }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y === "ALL" ? "All years" : y}
                  </option>
                ))}
              </select>
            </label>

            <label className={`text-sm font-semibold ${expYear === "ALL" ? "opacity-50" : ""}`}>
              Month:&nbsp;
              <select
                className="border rounded-full px-3 py-1 text-sm"
                value={expMonth}
                onChange={(e) => setExpMonth(e.target.value)}
                disabled={expYear === "ALL"}
              >
                <option value="ALL">All months</option>
                {Array.from({ length: 12 }, (_, i) => pad(i + 1)).map((m) => (
                  <option key={m} value={m}>
                    {new Date(`2025-${m}-01`).toLocaleString("en-US", { month: "long" })}
                  </option>
                ))}
              </select>
            </label>

            {expiryLoading && <span className="text-sm text-gray-500">Loading…</span>}
          </div>

          {expiryNote && <div className="text-xs text-gray-600 mb-2">{expiryNote}</div>}

          <div className="rounded-xl border p-2" style={{ borderColor: NAVY }}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-[#f4f8fd]">
                    <th className="py-2 px-3">SKU #</th>
                    <th className="py-2 px-3">Medicine Name</th>
                    <th className="py-2 px-3">Medicine Type</th>
                    <th className="py-2 px-3">Quantity</th>
                    <th className="py-2 px-3">Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(expiryView.length ? expiryView : expiryRows).length ? (
                    (expiryView.length ? expiryView : expiryRows).map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 px-3">{r.sku}</td>
                        <td className="py-2 px-3">{r.medicine_name}</td>
                        <td className="py-2 px-3">{r.dosage_form || "—"}</td>
                        <td className="py-2 px-3">{r.quantity}</td>
                        <td className="py-2 px-3">{r.expiration_date ? new Date(r.expiration_date).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-3 px-3 text-gray-600" colSpan="5">
                        No expiring medicines found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
