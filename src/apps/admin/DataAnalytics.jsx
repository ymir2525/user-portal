// src/apps/admin/DataAnalytics.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Chart from "chart.js/auto";

/** ──────────────────────────────────────────────────────────────────────────
 *  Supabase client (uses your existing Vite env vars)
 *  ────────────────────────────────────────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/** ──────────────────────────────────────────────────────────────────────────
 *  Utilities
 *  ────────────────────────────────────────────────────────────────────────── */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const toMonthIdx = (d) => new Date(d).getMonth();
const toYear     = (d) => new Date(d).getFullYear();

const fmtDateHeader = (d = new Date()) => {
  const opts = { year: "numeric", month: "long", day: "numeric" };
  return d.toLocaleDateString("en-PH", opts).toUpperCase();
};

const COLORS = [
  "rgb(232, 93, 36)",  // Orange
  "rgb(10, 38, 71)",   // Dark Blue
  "rgb(120, 180, 50)", // Green
  "rgb(153, 102, 255)",// Purple
  "rgb(255, 159, 64)", // Orange Light
  "rgb(54, 162, 235)", // Blue Light
  "rgb(255, 99, 132)", // Red
];
const colorAt = (i) => COLORS[i % COLORS.length];

/** tolerant normalizer */
const normalizeTupleKey = (cls, med, form, allowedSet) => {
  const f = (form || "").trim();
  const exact = `${cls}::${med}::${f}`;
  if (allowedSet.has(exact)) return exact;

  const blank = `${cls}::${med}::`;
  if (allowedSet.has(blank)) return blank;

  for (const k of allowedSet) {
    if (k.startsWith(`${cls}::${med}::`)) return k; // any allowed form
  }
  return exact; // fallback
};

/** Simple YoY avg growth forecast (for the “F” year) */
function forecastNextYear(seriesByYearObj, nextYear) {
  const years = Object.keys(seriesByYearObj)
    .map((y) => parseInt(y, 10))
    .filter((y) => y < nextYear)
    .sort((a, b) => a - b);

  if (years.length < 2) {
    const last = years[years.length - 1];
    const v = last ? seriesByYearObj[last] : 0;
    return { avgGrowthPct: 0, nextYearValue: Math.round(v) };
  }

  const rates = [];
  for (let i = 1; i < years.length; i++) {
    const prev = seriesByYearObj[years[i - 1]] ?? 0;
    const cur  = seriesByYearObj[years[i]] ?? 0;
    if (prev > 0) rates.push((cur - prev) / prev);
  }

  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const lastYear = years[years.length - 1];
  const lastVal  = seriesByYearObj[lastYear] ?? 0;
  const nextVal  = Math.round(lastVal * (1 + avg));
  return { avgGrowthPct: avg * 100, nextYearValue: nextVal };
}

/** ──────────────────────────────────────────────────────────────────────────
 *  Component
 *  ────────────────────────────────────────────────────────────────────────── */
export default function DataAnalytics() {
  const [tab, setTab] = useState("monthly");             // "monthly" | "yearly"
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Transactions (direction='out' only) drive the charts
  const [tx, setTx] = useState([]);
  // Inventory drives dropdowns & the set of valid (classification, medicine_name, dosage_form) tuples
  const [inv, setInv] = useState([]);

  // Filters
  const [classification, setClassification] = useState("");
  const [medicine, setMedicine] = useState("");

  // Chart refs/instances
  const monthlyChartRef = useRef(null);
  const yearlyChartRef  = useRef(null);
  const monthlyChartInstance = useRef(null);
  const yearlyChartInstance  = useRef(null);

  // toggles (show table vs chart)
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const [showYearlyTable,  setShowYearlyTable]  = useState(false);

  // date
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();
  const dateHeader   = fmtDateHeader(now);

  // last 3 complete years, plus current-year forecast label
  const yearlyYears  = useMemo(() => [currentYear - 3, currentYear - 2, currentYear - 1], [currentYear]);
  const yearlyLabels = useMemo(() => [...yearlyYears.map(String), `${currentYear}F`], [yearlyYears, currentYear]);

  /** Fetch inventory (for dropdowns) + transactions (for charts) */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // 1) Inventory => dropdowns & valid tuples
        const { data: invRows, error: invErr } = await supabase
          .from("medicine_inventory")
          .select("classification, medicine_name, dosage_form")
          .order("classification", { ascending: true });
        if (invErr) throw invErr;
        setInv(invRows || []);

        // 2) Transactions => chart aggregates
        // Fetch everything, then keep direction='out'
        const { data, error } = await supabase
          .from("medicine_transactions")
          .select("id, direction, classification, medicine_name, dosage_form, quantity, created_at")
          .order("created_at", { ascending: true });

        if (error) throw error;
        setTx((data || []).filter(r => r.direction === "out"));

        setErr(null);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Build dropdowns & valid tuples from inventory ONLY (deduped, no stray “()”) */
  const { classifications, medicinesByClass, allItems, allowedTupleSet } = useMemo(() => {
    const classSet = new Set();
    const map = new Map(); // classification -> Set(medicine_name)
    const tupleSet = new Set(); // unique (cls, med, form)

    inv.forEach(r => {
      const cls  = (r.classification || "").trim();
      const med  = (r.medicine_name || "").trim();
      const form = (r.dosage_form || "").trim(); // may be empty

      if (!cls || !med) return;
      classSet.add(cls);

      if (!map.has(cls)) map.set(cls, new Set());
      map.get(cls).add(med);

      // Track valid tuples to ignore orphan transactions
      tupleSet.add(`${cls}::${med}::${form}`);
    });

    return {
      classifications: Array.from(classSet).sort(),
      medicinesByClass: Object.fromEntries(
        Array.from(map.entries()).map(([k, v]) => [k, Array.from(v).sort()])
      ),
      allItems: Array.from(tupleSet).map(s => {
        const [cls, med, form] = s.split("::");
        return { cls, med, form };
      }),
      allowedTupleSet: tupleSet,
    };
  }, [inv]);

  /** apply filters */
  const filteredItems = useMemo(() => {
    return allItems.filter(({ cls, med }) => {
      if (classification && cls !== classification) return false;
      if (medicine && med !== medicine) return false;
      return true;
    });
  }, [allItems, classification, medicine]);

  /** NEW: pick the most recent year with data for the current filters (so Monthly never looks empty) */
  const displayYear = useMemo(() => {
    const years = new Set();
    tx.forEach(r => {
      const cls = (r.classification || "").trim();
      const med = (r.medicine_name || "").trim();
      if (classification && cls !== classification) return;
      if (medicine && med !== medicine) return;
      years.add(toYear(r.created_at));
    });
    if (years.size === 0) return currentYear;
    return Math.max(...Array.from(years));
  }, [tx, classification, medicine, currentYear]);

  /** ✅ monthly rows for displayYear (aggregate tx ONLY for tuples that actually have that year's data) */
  const monthlyRows = useMemo(() => {
    // 1) Discover active tuples for displayYear after filters
    const activeKeys = new Set();

    tx.forEach((r) => {
      const y = toYear(r.created_at);
      if (y !== displayYear) return;

      const cls  = (r.classification || "").trim();
      const med  = (r.medicine_name || "").trim();
      const form = (r.dosage_form || "").trim();

      if (classification && cls !== classification) return;
      if (medicine && med !== medicine) return;

      const normalizedKey = normalizeTupleKey(cls, med, form, allowedTupleSet);
      if (!normalizedKey) return;

      activeKeys.add(normalizedKey);
    });

    if (activeKeys.size === 0) return [];

    // 2) Build buckets for active tuples only
    const buckets = new Map();
    activeKeys.forEach((key) => {
      const [cls, med, form] = key.split("::");
      buckets.set(key, { cls, med, form, months: Array(12).fill(0) });
    });

    // 3) Aggregate quantities
    tx.forEach((r) => {
      const y = toYear(r.created_at);
      if (y !== displayYear) return;

      const cls  = (r.classification || "").trim();
      const med  = (r.medicine_name || "").trim();
      const form = (r.dosage_form || "").trim();

      if (classification && cls !== classification) return;
      if (medicine && med !== medicine) return;

      const normalizedKey = normalizeTupleKey(cls, med, form, allowedTupleSet);
      if (!normalizedKey || !buckets.has(normalizedKey)) return;

      const idx = toMonthIdx(r.created_at);
      if (idx >= 0 && idx < 12) {
        buckets.get(normalizedKey).months[idx] += Number(r.quantity || 0);
      }
    });

    const rows = Array.from(buckets.values()).map((v) => ({
      ...v,
      total: v.months.reduce((a, b) => a + b, 0),
    }));

    rows.sort((a, b) => `${a.cls} ${a.med} ${a.form}`.localeCompare(`${b.cls} ${b.med} ${b.form}`));
    return rows;
  }, [tx, filteredItems, classification, medicine, displayYear, allowedTupleSet]);

  /** yearly rows for last 3 years + forecast current (same valid-tuple rule) */
  const yearlyRows = useMemo(() => {
    const buckets = new Map();
    filteredItems.forEach(({ cls, med, form }) => {
      const key = `${cls}::${med}::${form}`;
      buckets.set(key, { cls, med, form, y: {} });
    });

    tx.forEach((r) => {
      const y = toYear(r.created_at);
      if (!yearlyYears.includes(y)) return;

      const cls  = (r.classification || "").trim();
      const med  = (r.medicine_name || "").trim();
      const form = (r.dosage_form || "").trim();

      if (classification && cls !== classification) return;
      if (medicine && med !== medicine) return;

      const key = `${cls}::${med}::${form}`;
      if (!allowedTupleSet.has(key)) return;

      if (!buckets.has(key)) buckets.set(key, { cls, med, form, y: {} });
      const qty = Number(r.quantity || 0);
      buckets.get(key).y[y] = (buckets.get(key).y[y] || 0) + qty;
    });

    const rows = Array.from(buckets.values()).map((v) => {
      const yObj = { ...v.y };
      yearlyYears.forEach((yr) => {
        if (typeof yObj[yr] !== "number") yObj[yr] = 0;
      });
      const { avgGrowthPct, nextYearValue } = forecastNextYear(yObj, currentYear);
      return { ...v, y: yObj, avgGrowthPct, pred: nextYearValue };
    });

    rows.sort((a, b) => `${a.cls} ${a.med} ${a.form}`.localeCompare(`${b.cls} ${b.med} ${b.form}`));
    return rows;
  }, [tx, filteredItems, classification, medicine, yearlyYears, currentYear, allowedTupleSet]);

  /** ── Charts ─────────────────────────────────────────────────────────── */

  // Build datasets helper (with visible points, tooltips)
  const lineOptsCommon = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y ?? ctx.raw;
            const name = ctx.dataset?.label || "Units";
            return `${name}: ${v} units`;
          },
        },
      },
    },
    elements: {
      point: { radius: 3, hoverRadius: 6, pointStyle: "circle" },
      line:  { tension: 0.1, borderWidth: 2, fill: false },
    },
    scales: {},
  };

  // MONTHLY chart: only create/update when tab visible
  const [monthlyLegendHtml, setMonthlyLegendHtml] = useState("");
  useEffect(() => {
    if (tab !== "monthly") return;

    const ctx = monthlyChartRef.current;
    const datasets = monthlyRows.map((row, i) => {
      const label = `${row.med}${row.form ? ` - ${row.form}` : ""}`;
      const c = colorAt(i);
      return { label, data: row.months, borderColor: c, backgroundColor: c };
    });

    // If no data -> destroy chart, clear legend, and bail
    if (datasets.length === 0) {
      if (monthlyChartInstance.current) {
        monthlyChartInstance.current.destroy();
        monthlyChartInstance.current = null;
      }
      setMonthlyLegendHtml("");
      return;
    }

    if (monthlyChartInstance.current) {
      const chart = monthlyChartInstance.current;
      chart.data.labels = MONTHS;
      chart.data.datasets = datasets;
      chart.options.scales = {
        y: { beginAtZero: true, title: { display: true, text: "Consumption (Units)" } },
        x: { title: { display: true, text: "Month" } },
      };
      chart.update();
      chart.resize(); // ensure correct size after becoming visible
      setMonthlyLegendHtml(buildLegendHtml(chart));
    } else if (ctx) {
      monthlyChartInstance.current = new Chart(ctx, {
        type: "line",
        data: { labels: MONTHS, datasets },
        options: {
          ...lineOptsCommon,
          plugins: {
            ...lineOptsCommon.plugins,
            title: {
              display: true,
              text: "Monthly Rx Demand Trend by Dosage/Form",
              font: { size: 16, weight: "bold" },
            },
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: "Consumption (Units)" } },
            x: { title: { display: true, text: "Month" } },
          },
        },
      });
      setMonthlyLegendHtml(buildLegendHtml(monthlyChartInstance.current));
    }
  }, [monthlyRows, tab]);

  // YEARLY chart: only create/update when tab visible
  const [yearlyLegendHtml,  setYearlyLegendHtml]  = useState("");
  useEffect(() => {
    if (tab !== "yearly") return;

    const ctx = yearlyChartRef.current;
    if (!ctx) return;

    const datasets = yearlyRows.map((row, i) => {
      const label = `${row.med}${row.form ? ` - ${row.form}` : ""}`;
      const c = colorAt(i);
      const series = [...yearlyYears.map((y) => row.y[y] || 0), row.pred || 0];
      return { label, data: series, borderColor: c, backgroundColor: c };
    });

    if (yearlyChartInstance.current) {
      const chart = yearlyChartInstance.current;
      chart.data.labels = yearlyLabels;
      chart.data.datasets = datasets;
      chart.options.scales = {
        y: { beginAtZero: true, title: { display: true, text: "Distribution (Units)" } },
        x: { title: { display: true, text: "Year" } },
      };
      chart.update();
      chart.resize();
      setYearlyLegendHtml(buildLegendHtml(chart));
    } else {
      yearlyChartInstance.current = new Chart(ctx, {
        type: "line",
        data: { labels: yearlyLabels, datasets },
        options: {
          ...lineOptsCommon,
          plugins: {
            ...lineOptsCommon.plugins,
            title: {
              display: true,
              text: "Annual Distribution & Forecast Trend",
              font: { size: 16, weight: "bold" },
            },
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: "Distribution (Units)" } },
            x: { title: { display: true, text: "Year" } },
          },
        },
      });
      setYearlyLegendHtml(buildLegendHtml(yearlyChartInstance.current));
    }
  }, [yearlyRows, yearlyLabels, yearlyYears, tab]);

  /** Legends external handlers */
  const onMonthlyLegendClick = (e) => {
    const chart = monthlyChartInstance.current;
    if (!chart) return;
    const li = e.target.closest("li[data-idx]");
    if (!li) return;
    const idx = parseInt(li.getAttribute("data-idx"), 10);
    const vis = chart.isDatasetVisible(idx);
    chart.setDatasetVisibility(idx, !vis);
    chart.update();
    setMonthlyLegendHtml(buildLegendHtml(chart));
  };

  const onYearlyLegendClick = (e) => {
    const chart = yearlyChartInstance.current;
    if (!chart) return;
    const li = e.target.closest("li[data-idx]");
    if (!li) return;
    const idx = parseInt(li.getAttribute("data-idx"), 10);
    const vis = chart.isDatasetVisible(idx);
    chart.setDatasetVisibility(idx, !vis);
    chart.update();
    setYearlyLegendHtml(buildLegendHtml(chart));
  };

  /** ── Widgets ─────────────────────────────────────────────────────────── */

  // Seasonal Demand Analysis (per selected classification, +5% buffer; high/low different when possible)
  const seasonalWidget = useMemo(() => {
    if (!classification) {
      return {
        highest: "Pick a classification to see high/low for this month.",
        lowest: "—",
        actionable: "Select a classification above. We’ll show the top & bottom medicine (across forms) with a +5% buffer.",
      };
    }

    const lastYear = currentYear - 1;
    const monthIdx = currentMonth;

    // Aggregate last year's current month totals per medicine_name within the selected classification
    const byMed = new Map(); // med -> total qty (across forms)
    tx.forEach(r => {
      if (r.direction !== "out") return;
      const cls  = (r.classification || "").trim();
      const med  = (r.medicine_name || "").trim();
      const form = (r.dosage_form || "").trim();
      if (cls !== classification) return;

      const y = toYear(r.created_at);
      if (y !== lastYear) return;
      if (toMonthIdx(r.created_at) !== monthIdx) return;

      // Only consider meds that exist in inventory for this classification
      const maybeValidTuples = [
        `${cls}::${med}::${form}`,
        `${cls}::${med}::`,
      ];
      if (![...maybeValidTuples].some(k => allowedTupleSet.has(k))) return;

      const qty = Number(r.quantity || 0);
      byMed.set(med, (byMed.get(med) || 0) + qty);
    });

    if (byMed.size === 0) {
      return {
        highest: `No data for ${MONTHS[monthIdx]} last year in "${classification}".`,
        lowest: "—",
        actionable: "Record distributions first, then revisit this panel.",
      };
    }

    const sorted = Array.from(byMed.entries()).sort((a,b) => b[1] - a[1]);

    const [hiMed, hiVal] = sorted[0];
    const lowEntry = sorted.length > 1 ? sorted[sorted.length - 1] : sorted[0];
    const [loMed, loVal] = lowEntry;

    const bufHi = Math.ceil((hiVal || 0) * 1.05);
    const bufLo = Math.ceil((loVal || 0) * 1.05);

    return {
      highest: `Highest this month: <b>${MONTHS[monthIdx]}</b> (${bufHi} units for ${hiMed})`,
      lowest:  `Lowest this month: <b>${MONTHS[monthIdx]}</b> (${bufLo} units for ${loMed})`,
      actionable: `Use a +5% buffer on last year’s ${MONTHS[monthIdx]} demand for each item. Prioritize fast movers in "${classification}".`,
    };
  }, [tx, classification, currentYear, currentMonth, allowedTupleSet]);

  // Additional spike analysis across months
  const monthlySpikeMsg = useMemo(() => {
    const datasets = monthlyRows.map((r) => ({ label: `${r.med}${r.form ? ` - ${r.form}` : ""}`, data: r.months }));
    let spike = null;
    datasets.forEach((ds) => {
      for (let i = 0; i < ds.data.length - 1; i++) {
        const a = ds.data[i];
        const b = ds.data[i + 1];
        if (a > 0) {
          const g = (b - a) / a;
          if (!spike || g > spike.g) spike = { g, from: i, to: i + 1, label: ds.label };
        }
      }
    });
    if (spike && spike.g >= 0.3) {
      return `The item with the **biggest sequential increase** is **${spike.label}** (+${(spike.g * 100).toFixed(1)}%) from ${MONTHS[spike.from]} to ${MONTHS[spike.to]}. Consider moving procurement **one quarter earlier**.`;
    }
    return `No medication in the current set showed a sequential increase of **30%+**. Maintain regular procurement schedule.`;
  }, [monthlyRows]);

  const yearlyWidget = useMemo(() => {
    if (yearlyRows.length === 0) {
      return {
        topGrowth: [],
        riskList: ["No data for the selected filters."],
        interp: "Select a Classification or Medicine to view yearly insights.",
      };
    }

    // Top 3 projected growth
    const topGrowth = [...yearlyRows]
      .sort((a, b) => b.avgGrowthPct - a.avgGrowthPct)
      .slice(0, 3)
      .map((r, i) => ({
        rank: i + 1,
        name: `${r.med}${r.form ? ` - ${r.form}` : ""}`,
        pct: r.avgGrowthPct,
      }));

    // Volatility summary
    const vols = yearlyRows.map((r) => {
      const y = r.y;
      const v =
        Math.abs((y[yearlyYears[1]] || 0) - (y[yearlyYears[0]] || 0)) +
        Math.abs((y[yearlyYears[2]] || 0) - (y[yearlyYears[1]] || 0));
      return { name: `${r.med}${r.form ? ` - ${r.form}` : ""}`, volatility: v, growth: r.avgGrowthPct };
    }).sort((a, b) => b.volatility - a.volatility);

    const riskList = [];
    if (vols[0]) riskList.push(`1. **${vols[0].name}:** Highest volatility detected.`);
    const minGrowth = [...yearlyRows].sort((a, b) => a.avgGrowthPct - b.avgGrowthPct)[0];
    if (minGrowth) {
      const mgName = `${minGrowth.med}${minGrowth.form ? ` - ${minGrowth.form}` : ""}`;
      if (!vols[0] || vols[0].name !== mgName) {
        riskList.push(`2. **${mgName}:** Lowest Projected Growth (${minGrowth.avgGrowthPct.toFixed(2)}%)`);
      }
    }
    if (riskList.length === 0) riskList.push("No critical volatility detected.");

    const maxG = [...yearlyRows].sort((a, b) => b.avgGrowthPct - a.avgGrowthPct)[0];
    const interp = maxG
      ? `Highest projected growth: **${maxG.med}${maxG.form ? ` - ${maxG.form}` : ""}** (${maxG.avgGrowthPct.toFixed(2)}%). Forecast **${(maxG.pred || 0).toLocaleString("en-US")} units** in ${currentYear}. Keep a **5% buffer** to avoid stockouts.`
      : "No projected growth available.";

    return { topGrowth, riskList, interp };
  }, [yearlyRows, yearlyYears, currentYear]);

  /** ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="admin-analytics">
      {/* scoped styles */}
      <style>{`
        .admin-analytics { width: 100%; }
        .admin-analytics .page-bar {
          display:flex; align-items:center; justify-content:space-between;
          background:#E85D24; color:#fff; padding:10px 15px; border-radius:6px; margin-bottom:16px;
        }
        .admin-analytics .page-bar h2 { font-size:20px; font-weight:700; }
        .admin-analytics .page-bar .date { font-size:12px; font-weight:700; opacity:.95; }

        :root{
          --color-orange-dark:#E85D24;
          --color-title-bg:#ffebe1;
          --color-blue-dark:#0A2647;
          --color-blue-light:#1b3d5e;
          --color-orange-light:#fff2e6;
        }
        .dashboard-container{
          width:100%; background:#fff; border:1px solid #e5e5e5;
          box-shadow:0 4px 12px rgba(0,0,0,.06); border-radius:8px; display:flex; flex-direction:column;
        }
        .header-title{font-size:24px;font-weight:bold;color:var(--color-orange-dark);text-align:center;padding:15px 0;}

        .table-header-tabs{display:flex;border-bottom:1px solid #ddd;}
        .section-title-tab{flex:1;font-size:16px;padding:12px 20px;cursor:pointer;text-align:center;border-right:1px solid #ddd;background:#f9f9f9;color:#666;}
        .section-title-tab.active{background:var(--color-title-bg);color:var(--color-orange-dark);font-weight:bold;border-bottom:1px solid var(--color-title-bg);border-top:3px solid var(--color-orange-dark);}
        .forecast-section{padding:0 15px 15px 15px;display:none;}
        .forecast-section.active{display:block;}

        .control-area{display:flex;flex-wrap:wrap;gap:10px 20px;padding:15px 0 20px;border-bottom:1px solid #eee;margin-bottom:15px;}
        .control-group{display:flex;align-items:center;gap:5px;}
        .control-group label{font-size:13px;font-weight:bold;color:#333;}
        .control-group select{padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;min-width:180px}
        .data-toggle-btn{background:#0A2647;color:#fff;padding:6px 12px;border:none;border-radius:4px;font-size:13px;cursor:pointer;font-weight:bold;margin-left:auto;}

        .analytics-main-content{display:flex;gap:20px;padding:15px 0;align-items:flex-start;}
        .forecast-table-container{flex:2;min-width:60%;}
        .growth-widget-container{flex:1;min-width:250px;border:1px solid #ddd;border-radius:4px;padding:15px;background:#fafafa;}
        .widget-title{font-size:14px;font-weight:bold;color:var(--color-blue-dark);margin-bottom:10px;border-bottom:2px solid var(--color-orange-dark);padding-bottom:5px;}
        .widget-content p{font-size:13px;margin-bottom:5px;color:#555;}

        .data-table-wrapper{overflow-x:auto;padding:15px 0;}
        table{width:100%;border-collapse:collapse;font-size:14px;min-width:0;}
        th{padding:8px 3px;text-align:center;border:1px solid #ccc;font-weight:bold;font-size:12px;}
        td{padding:8px 3px;border:1px solid #ccc;text-align:center;}
        tbody tr:nth-child(even){background:#f9f9f9;}
        .medicine-header{text-align:left;padding-left:8px !important;}
        .medicine-name{text-align:left;padding-left:8px !important;font-weight:bold;color:#333;}
        .total-header{background:var(--color-orange-dark);color:#fff;border-color:var(--color-orange-dark);}
        .total-value{font-weight:bold;background:var(--color-orange-light);}

        .chart-container{padding:15px;background:#fff;border-radius:4px;border:1px solid #eee;position:relative;height:400px;}
        #chart-legend-container,#yearly-chart-legend-container{margin:10px 15px 0 15px;padding:5px 0;border-top:1px solid #eee;font-size:11px;color:#555;}

        .interpretation-area{padding:15px 0 0 0;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #eee;margin-top:15px;}
        .interpretation-box{flex-grow:1;margin-right:20px;padding:10px;border:1px solid #ccc;background:#fff;border-radius:5px;font-size:12px;color:#333;}

        #yearly-view thead{background:#0A2647;color:#fff;}
        #yearly-view .year-row th{background:#1b3d5e;color:#fff;}
        #monthly-view table thead{background:#0A2647;color:#fff;}
        #monthly-view table .month-row th{background:#1b3d5e;color:#fff;}

        @media (max-width:900px){
          .analytics-main-content{flex-direction:column;}
          .forecast-table-container,.growth-widget-container{min-width:100%;}
        }
      `}</style>

      {/* Header inside Admin layout (no extra sidebar) */}
      <div className="page-bar">
        <h2>Inventory Management — Data Analytics</h2>
        <div className="date">DATE TODAY: {dateHeader}</div>
      </div>

      <div className="dashboard-container">
        <h1 className="header-title">Data Analytics</h1>

        {/* Tabs */}
        <header className="table-header-tabs">
          <h2
            className={`section-title-tab ${tab === "monthly" ? "active" : ""}`}
            onClick={() => setTab("monthly")}
          >
            Monthly Forecast
          </h2>
          <h2
            className={`section-title-tab ${tab === "yearly" ? "active" : ""}`}
            onClick={() => setTab("yearly")}
          >
            Yearly Forecast
          </h2>
        </header>

        {/* MONTHLY VIEW */}
        <div id="monthly-view" className={`forecast-section ${tab === "monthly" ? "active" : ""}`}>
          <div className="control-area">
            <div className="control-group">
              <label>Classification:</label>
              <select
                value={classification}
                onChange={(e) => {
                  setClassification(e.target.value);
                  setMedicine("");
                }}
              >
                <option value="">All Classifications</option>
                {classifications.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Medicine:</label>
              <select value={medicine} onChange={(e) => setMedicine(e.target.value)}>
                <option value="">All Medicines</option>
                {(classification ? (medicinesByClass[classification] || []) : Object.values(medicinesByClass).flat())
                  .sort()
                  .map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <button
              id="monthly-toggle-btn"
              className="data-toggle-btn"
              onClick={() => setShowMonthlyTable((s) => !s)}
            >
              {showMonthlyTable ? "Hide Data Table" : "Show Data Table"}
            </button>
          </div>

          <div className="analytics-main-content">
            <div className="forecast-table-container">
              {/* Chart */}
              {!showMonthlyTable && (
                <>
                  <div className="chart-container">
                    <canvas ref={monthlyChartRef} />
                    {monthlyRows.length === 0 && (
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#666",fontSize:13}}>
                        No distributions recorded for {displayYear} with the current filters.
                      </div>
                    )}
                  </div>
                  <div
                    id="chart-legend-container"
                    onClick={onMonthlyLegendClick}
                    dangerouslySetInnerHTML={{ __html: monthlyLegendHtml }}
                  />
                </>
              )}

              {/* Table */}
              {showMonthlyTable && (
                <div id="monthly-table-wrapper" className="data-table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th rowSpan={2} className="medicine-header">Medicine (Dosage/Form)</th>
                        <th colSpan={12} className="monthly-header">Monthly Distribution – {displayYear}</th>
                        <th rowSpan={2} className="total-header">Total (Yearly Distributed)</th>
                      </tr>
                      <tr className="month-row">
                        {MONTHS.map((m) => <th key={m}>{m}</th>)}
                      </tr>
                    </thead>
                    <tbody id="monthly-table-body">
                      {monthlyRows.map((r) => (
                        <tr key={`${r.cls}::${r.med}::${r.form}`}>
                          <td className="medicine-name">{r.med}{r.form ? ` - ${r.form}` : ""}</td>
                          {r.months.map((v, i) => <td key={`${r.med}-${i}`}>{v}</td>)}
                          <td className="total-value">{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Seasonal Widget (current month high/low) */}
            <div className="growth-widget-container">
              <h3 className="widget-title">Seasonal Demand Analysis</h3>
              <div className="widget-content">
                <p>Seasonal fluctuations affect procurement planning. Insights below are based on the selected filters.</p>
                <p dangerouslySetInnerHTML={{ __html: seasonalWidget.highest }} />
                <p dangerouslySetInnerHTML={{ __html: seasonalWidget.lowest }} />
                <hr style={{ margin: "10px 0", borderColor: "#eee" }} />
                <p className="text-danger"
                   dangerouslySetInnerHTML={{ __html: (`<b>Actionable Insight:</b> ${seasonalWidget.actionable}`) }} />
              </div>
            </div>
          </div>

          <div className="interpretation-area">
            <div className="interpretation-box">
              <span className="title">Monthly Data Interpretation (Actionable)</span>
              <div className="interpretation-content">{monthlySpikeMsg}</div>
            </div>
          </div>
        </div>

        {/* YEARLY VIEW */}
        <div id="yearly-view" className={`forecast-section ${tab === "yearly" ? "active" : ""}`}>
          <div className="control-area">
            <div className="control-group">
              <label>Classification:</label>
              <select
                value={classification}
                onChange={(e) => { setClassification(e.target.value); setMedicine(""); }}
              >
                <option value="">All Classifications</option>
                {classifications.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="control-group">
              <label>Medicine:</label>
              <select value={medicine} onChange={(e) => setMedicine(e.target.value)}>
                <option value="">All Medicines</option>
                {classification 
                  ? (medicinesByClass[classification] || []).map((m) => <option key={m} value={m}>{m}</option>)
                  : Object.values(medicinesByClass).flat().sort().map((m) => <option key={m} value={m}>{m}</option>)
                }
              </select>
            </div>

            <div className="control-group">
              <label>View Granularity:</label>
              <select value="year" disabled>
                <option value="year">Yearly Trend</option>
                <option value="5year">5-Year Trend</option>
              </select>
            </div>

            <button
              id="yearly-toggle-btn"
              className="data-toggle-btn"
              onClick={() => setShowYearlyTable((s) => !s)}
            >
              {showYearlyTable ? "Hide Data Table" : "Show Data Table"}
            </button>
          </div>

          <div className="analytics-main-content">
            <div className="forecast-table-container">
              {/* Chart */}
              {!showYearlyTable && (
                <>
                  <div className="chart-container">
                    <canvas ref={yearlyChartRef} />
                  </div>
                  <div
                    id="yearly-chart-legend-container"
                    onClick={onYearlyLegendClick}
                    dangerouslySetInnerHTML={{ __html: yearlyLegendHtml }}
                  />
                </>
              )}

              {/* Table */}
              {showYearlyTable && (
                <div id="yearly-table-wrapper" className="data-table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th className="medicine-header">Medicine (Dosage/Form)</th>
                        {yearlyYears.map((y) => <th key={y}>{y} Distribution</th>)}
                        <th>Average Growth %</th>
                        <th className="total-header">
                          {currentYear} Prediction<br />(Forecasted Total Prescription)
                        </th>
                      </tr>
                    </thead>
                    <tbody id="yearly-table-body">
                      {yearlyRows.map((r) => (
                        <tr key={`${r.cls}::${r.med}::${r.form}`}>
                          <td className="medicine-name">{r.med}{r.form ? ` - ${r.form}` : ""}</td>
                          {yearlyYears.map((y) => <td key={`${r.med}-${y}`}>{r.y[y] || 0}</td>)}
                          <td>{`${(r.avgGrowthPct || 0).toFixed(2)}%`}</td>
                          <td className="total-value">{r.pred?.toLocaleString("en-US") || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Growth Velocity & Risk */}
            <div className="growth-widget-container">
              <h3 className="widget-title">Growth Velocity & Risk Summary</h3>
              <div className="widget-content">
                <p style={{ color: "green" }}>🚀 <b>Top Projected Growth (Action Required):</b></p>
                {(() => {
                  const list = [...yearlyRows]
                    .sort((a,b) => b.avgGrowthPct - a.avgGrowthPct)
                    .slice(0, 3)
                    .map((g, i) => `${i+1}. <b>${g.med}${g.form ? ` - ${g.form}` : ""}</b>: ${g.avgGrowthPct.toFixed(2)}%`)
                    .join("<br/>");
                  return <p dangerouslySetInnerHTML={{ __html: list || "None" }} />;
                })()}

                <hr style={{ margin: "10px 0", borderColor: "#eee" }} />

                <p style={{ color: "#E85D24" }}>⚠️ <b>High Volatility/Risk Summary:</b></p>
                {(() => {
                  const vols = yearlyRows.map((r) => {
                    const y = r.y;
                    const v =
                      Math.abs((y[yearlyYears[1]] || 0) - (y[yearlyYears[0]] || 0)) +
                      Math.abs((y[yearlyYears[2]] || 0) - (y[yearlyYears[1]] || 0));
                    return { name: `${r.med}${r.form ? ` - ${r.form}` : ""}`, volatility: v, growth: r.avgGrowthPct };
                  }).sort((a, b) => b.volatility - a.volatility);

                  const risk = [];
                  if (vols[0]) risk.push(`1. <b>${vols[0].name}</b>: Highest volatility detected.`);
                  const minGrowth = [...yearlyRows].sort((a, b) => a.avgGrowthPct - b.avgGrowthPct)[0];
                  if (minGrowth) {
                    const mgName = `${minGrowth.med}${minGrowth.form ? ` - ${minGrowth.form}` : ""}`;
                    if (!vols[0] || vols[0].name !== mgName) {
                      risk.push(`2. <b>${mgName}</b>: Lowest Projected Growth (${minGrowth.avgGrowthPct.toFixed(2)}%)`);
                    }
                  }
                  return <p dangerouslySetInnerHTML={{ __html: risk.join("<br/>") || "No critical volatility detected." }} />;
                })()}
              </div>
            </div>
          </div>

          <div className="interpretation-area">
            <div className="interpretation-box">
              <span className="title">Yearly Data Interpretation (Actionable)</span>
              <div className="interpretation-content">
                {(() => {
                  if (yearlyRows.length === 0) return "Select a Classification or Medicine to view yearly insights.";
                  const maxG = [...yearlyRows].sort((a, b) => b.avgGrowthPct - a.avgGrowthPct)[0];
                  return maxG
                    ? `Highest projected growth: ${maxG.med}${maxG.form ? ` - ${maxG.form}` : ""} (${maxG.avgGrowthPct.toFixed(2)}%). Forecast ${(maxG.pred || 0).toLocaleString("en-US")} units in ${currentYear}. Keep a 5% buffer to avoid stockouts.`
                    : "No projected growth available.";
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && <p style={{ marginTop: 12 }}>Loading analytics…</p>}
      {err && <p style={{ color: "crimson", marginTop: 12 }}>Error: {err}</p>}
      {!loading && !err && filteredItems.length === 0 && (
        <p style={{ marginTop: 12 }}>
          No records match the current filters. Try broadening your selection.
        </p>
      )}
    </div>
  );
}

/** helper kept at bottom (so buildLegendHtml is available above too) */
function buildLegendHtml(chart) {
  if (!chart) return "";
  const items = chart.data.datasets || [];
  let html = "<ul style='list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:4px 10px;justify-content:center;'>";
  items.forEach((ds, idx) => {
    const visible = chart.isDatasetVisible(idx);
    html += `
      <li data-idx="${idx}" style="display:flex;align-items:center;cursor:pointer;font-weight:bold;padding:1px 3px;border-radius:3px;transition:opacity .2s;user-select:none;${visible ? "" : "opacity:.5;text-decoration:line-through;"}">
        <span style="width:10px;height:10px;border-radius:2px;margin-right:4px;border:1px solid rgba(0,0,0,.1);background:${ds.borderColor}"></span>
        ${ds.label}
      </li>`;
  });
  html += "</ul>";
  return html;
}
