import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
// Reuse the existing styles from Admin. Adjust path if needed.
import "../admin/MedicineInventory.css";

const BASE_CLASSIFICATIONS = [
  "Antibiotics",
  "Antihistamine",
  "NSAID",
  "Herbal",
  "Multivitamins",
  "Proton Pump Inhibitor (PPI)",
  "Anti - hypertensive",
  "Anti - Diabetic",
  "Others",
];

const DOSAGE_FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "ointment",
  "drops",
  "injection",
  "other",
];

export default function DoctorInventory() {
  const [tab, setTab] = useState("stock"); // 'stock' | 'dispense' | 'expiry'
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ stock: 0, distributed: 0 });

  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [expiryRows, setExpiryRows] = useState([]);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryNote, setExpiryNote] = useState("");

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const [q, setQ] = useState(""); // This initializes the search query state

  /* ---------- Dispense tab state ---------- */
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dispenseRows, setDispenseRows] = useState([]);
  const [distributedOnSelected, setDistributedOnSelected] = useState(0);
  const MIN_DATE = "2000-01-01";
  const MAX_DATE = todayStr;

  /* ---------- Expiry Proximity logic ---------- */
  const currentYear = new Date().getFullYear();
  const [yearOptions, setYearOptions] = useState(["ALL", String(currentYear)]);
  const [expYear, setExpYear] = useState("ALL");
  const [expMonth, setExpMonth] = useState("ALL");

  // ----- Helper functions -----
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // FIXED: Ensure addMonths maintains the UTC context when calculating the next month/year.
  function addMonths(d, n) {
    const x = new Date(d);
    
    // Check for "Invalid Date" before proceeding
    if (isNaN(x.getTime())) return new Date(NaN); 
    
    // Preserve the date as a date-only string before setting month, 
    // and use setUTCMonth to avoid local time zone shift issues.
    x.setUTCDate(1); // Set to 1st to prevent rollover issues (e.g., adding 1 month to Jan 31st)
    x.setUTCMonth(x.getUTCMonth() + n);
    return x;
  }

  function makeSKUFromRow(row) {
    const pad2 = (n) => String(n).padStart(2, "0");
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
    const mm = d ? pad2(d.getMonth() + 1) : "00";
    const tail = String((row.id ?? 0) % 1000).padStart(3, "0");
    return `${code}-${t}${yy}${mm}-${tail}`;
  }

  function fmtPgTimestampUTC(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    );
  }

  function manilaDayUtcRange(dateStr) {
    const startManila = new Date(`${dateStr}T00:00:00+08:00`);
    const nextManila = new Date(`${dateStr}T00:00:00+08:00`);
    nextManila.setDate(nextManila.getDate() + 1);
    return { from: fmtPgTimestampUTC(startManila), to: fmtPgTimestampUTC(nextManila) };
  }

  // Load inventory and catalog
  async function loadCatalog() {
    setLoadingCatalog(true);
    const { data, error } = await supabase
      .from("medicine_catalog")
      .select("classification, medicine_name, dosage_form")
      .order("classification")
      .order("medicine_name");
    if (error) console.error(error);
    setCatalog(data || []);
    setLoadingCatalog(false);
  }

  async function loadInventory() {
    const { data, error } = await supabase
      .from("medicine_inventory")
      .select("*")
      .order("id", { ascending: false });
    if (error) console.error(error);
    setInventory(data || []);
  }

  async function loadTotals() {
    const [{ data: inv }, { data: tx }] = await Promise.all([
      supabase.from("medicine_inventory").select("quantity, expiration_date"),
      supabase.from("medicine_transactions").select("quantity, direction"),
    ]);
    const stock = (inv || [])
      .filter((r) => !r.expiration_date || r.expiration_date >= todayStr)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const distributed = (tx || [])
      .filter((t) => t.direction === "out")
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    setTotals({ stock, distributed });
  }

  // Load dispense transactions for the selected Manila day
  async function loadDispenseFor(dateStr) {
    const { from, to } = manilaDayUtcRange(dateStr);

    const { data: tx, error } = await supabase
      .from("medicine_transactions")
      .select(
        "id, created_at, direction, classification, medicine_name, dosage_form, quantity, patient_id"
      )
      .eq("direction", "out")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Dispense fetch failed:", error.message, error.details || "");
      setDispenseRows([]);
      setDistributedOnSelected(0);
      return;
    }

    const rows = tx || [];

    const ids = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean)));
    let byPatient = new Map();
    if (ids.length) {
      const { data: pats, error: pErr } = await supabase
        .from("patients")
        .select("id, family_number, first_name, middle_name, surname")
        .in("id", ids);
      if (!pErr && pats) {
        byPatient = new Map(pats.map((p) => [p.id, p]));
      }
    }

    const enriched = rows.map((r) => {
      const p = r.patient_id ? byPatient.get(r.patient_id) : null;
      const patient_name = p
        ? [p.first_name, p.middle_name, p.surname].filter(Boolean).join(" ")
        : "—";
      const family_number = p?.family_number || "—";
      return { ...r, patient_name, family_number };
    });

    setDispenseRows(enriched);
    setDistributedOnSelected(
      enriched.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    );
  }

  // ----- Expiry Proximity Logic -----
  const recomputeYearOptionsFromRows = (rows) => {
    const maxExpYear = (rows || []).reduce((max, r) => {
      const y = r.expiration_date ? new Date(r.expiration_date).getFullYear() : currentYear;
      return Math.max(max, y);
    }, currentYear);

    const years = ["ALL"];
    for (let y = currentYear; y <= maxExpYear + 5; y++) years.push(String(y)); // Supporting 5 years range
    setYearOptions(years);

    setExpYear((prev) => {
      if (prev === "ALL") return prev;
      const py = Number(prev);
      if (Number.isNaN(py) || py < currentYear) return String(currentYear);
      if (py > maxExpYear) return String(maxExpYear);
      return prev;
    });
  };

  const loadExpiry = async () => {
    try {
      setExpiryLoading(true);
      const { data, error } = await supabase
        .from("medicine_inventory")
        .select("id, medicine_name, dosage_form, quantity, expiration_date")
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      const rows = (data || []).map((r) => ({ ...r, sku: makeSKUFromRow(r) }));
      setExpiryRows(rows);
      recomputeYearOptionsFromRows(rows);
    } catch (e) {
      console.error("expiry fetch failed:", e?.message || e);
      setExpiryRows([]);
    } finally {
      setExpiryLoading(false);
    }
  };

  const expiryCalc = useMemo(() => {
    if (!expiryRows.length) return { rows: [], note: "" };

    if (expYear === "ALL") return { rows: expiryRows, note: "" };

    const targetMonth = expMonth === "ALL" ? "01" : expMonth;
    
    // FIX: Construct dates in a way that forces them to be interpreted consistently (as UTC midnight)
    // When passed a YYYY-MM-DD string, JS Date treats it as UTC midnight.
    const targetStart = new Date(`${expYear}-${targetMonth}-01`);
    
    // Use the corrected addMonths to get a UTC-consistent end date
    const targetEnd = expMonth === "ALL" ? addMonths(targetStart, 12) : addMonths(targetStart, 1);

    const inRange = expiryRows.filter((r) => {
      if (!r.expiration_date) return false;
      
      // r.expiration_date (YYYY-MM-DD) is automatically parsed as UTC midnight (00:00:00Z)
      const d = new Date(r.expiration_date); 
      
      // All dates are now comparable in UTC
      return d >= targetStart && d < targetEnd;
    });

    if (inRange.length) return { rows: inRange, note: "" };

    // The filtering logic for "within 24 months" and "beyond 24 months"
    const next24Start = targetEnd;
    const next24End = addMonths(targetEnd, 24);

    const within24 = expiryRows.filter((r) => {
      if (!r.expiration_date) return false;
      const d = new Date(r.expiration_date);
      return d >= next24Start && d < next24End;
    });

    const beyond24 = expiryRows.filter((r) => {
      if (!r.expiration_date) return false;
      const d = new Date(r.expiration_date);
      return d >= next24End;
    });

    const note =
      within24.length || beyond24.length
        ? "No exact matches. Showing the closest future expiries: first within the next 2 years, then more than 2 years ahead."
        : "No future expiries found.";

    return { rows: [...within24, ...beyond24], note };
  }, [expiryRows, expYear, expMonth]);

  useEffect(() => {
    setExpiryNote(expiryCalc.note || "");
  }, [expiryCalc.note]);

  // Initial loads + realtime updates
  useEffect(() => {
    loadCatalog();
    loadInventory();
    loadTotals();
    loadDispenseFor(selectedDate);
    loadExpiry();

    // Realtime subscriptions
    const invCh = supabase
      .channel("realtime_inventory_doctor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_inventory" },
        () => {
          loadInventory();
          loadTotals();
          loadExpiry();
        }
      )
      .subscribe();

    const txCh = supabase
      .channel("realtime_transactions_doctor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_transactions" },
        () => {
          loadTotals();
          loadDispenseFor(selectedDate);
        }
      )
      .subscribe();

    const catCh = supabase
      .channel("realtime_catalog_doctor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_catalog" },
        loadCatalog
      )
      .subscribe();

    return () => {
      supabase.removeChannel(invCh);
      supabase.removeChannel(txCh);
      supabase.removeChannel(catCh);
    };
  }, [todayStr, selectedDate]);

  /* ---------- Search filter ---------- */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return inventory;
    return inventory.filter((r) => {
      const s = [
        r.classification,
        r.medicine_name,
        r.dosage_form,
        r.expiration_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return s.includes(needle);
    });
  }, [q, inventory]);

  return (
    <section className="mi-section">
      <h3 className="mi-title">Medicine Inventory</h3>

      {/* Tabs */}
      <div className="mi-tabs">
        <button
          className={`mi-tab ${tab === "stock" ? "is-active" : ""}`}
          onClick={() => setTab("stock")}
        >
          Medicine Stock
        </button>
        <button
          className={`mi-tab ${tab === "dispense" ? "is-active" : ""}`}
          onClick={() => setTab("dispense")}
        >
          Dispense List
        </button>
        <button
          className={`mi-tab ${tab === "expiry" ? "is-active" : ""}`}
          onClick={() => setTab("expiry")}
        >
          Average Expiry Proximity
        </button>
      </div>

      {/* --- Stock Tab --- */}
      {tab === "stock" && (
        <>
          {/* Metrics */}
          <div className="mi-metrics">
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine in Stock</div>
              <div className="mi-metric__value">{totals.stock}</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine Distributed (Lifetime)</div>
              <div className="mi-metric__value">{totals.distributed}</div>
            </div>
          </div>

          {/* Search */}
          <div className="field" style={{ maxWidth: 360, marginTop: 6 }}>
            <label className="label">Search</label>
            <input
              className="input"
              placeholder="Search classification, name, type…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="card">
            <h4 className="card__title">Current Inventory</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Medicine Type</th>
                    <th>Medicine Name</th>
                    <th>QTY</th>
                    <th>Expiry Date</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length ? (
                    filtered.map((item, i) => (
                      <tr key={item.id} className={i % 2 ? "is-even" : "is-odd"}>
                        <td>{item.classification}</td>
                        <td>{item.medicine_name}</td>
                        <td>{item.quantity}</td>
                        <td>
                          {item.expiration_date
                            ? new Date(item.expiration_date).toLocaleDateString()
                            : ""}
                        </td>
                        <td>{item.dosage_form || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        No medicines found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --- Dispense Tab --- */}
      {tab === "dispense" && (
        <>
          {/* Dispense metrics */}
          <div className="mi-metrics">
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine in Stock</div>
              <div className="mi-metric__value">{totals.stock}</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric__label">
                Total Medicine Distributed (Selected Day)
              </div>
              <div className="mi-metric__value">{distributedOnSelected}</div>
            </div>

            {/* Date picker for Dispense tab */}
            <div className="mi-actions" style={{ gap: 8 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Select Day</label>
                <input
                  type="date"
                  className="input"
                  min={MIN_DATE}
                  max={MAX_DATE}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Dispense table */}
          <div className="card">
            <h4 className="card__title">
              Dispense List — {new Date(selectedDate).toLocaleDateString()}
            </h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Family Number</th>
                    <th>Medicine</th>
                    <th>Type</th>
                    <th>Number of Medicine</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dispenseRows.length ? (
                    dispenseRows.map((row, i) => (
                      <tr key={row.id} className={i % 2 ? "is-even" : "is-odd"}>
                        <td>{row.patient_name || "—"}</td>
                        <td>{row.family_number || "—"}</td>
                        <td>{row.medicine_name || "—"}</td>
                        <td>{row.dosage_form || "—"}</td>
                        <td>{row.quantity}</td>
                        <td>
                          {row.created_at
                            ? new Date(row.created_at).toLocaleTimeString()
                            : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        No dispense records for this day.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --- Average Expiry Proximity tab --- */}
      {tab === "expiry" && (
        <>
          <div className="mi-metrics">
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine in Stock</div>
              <div className="mi-metric__value">{totals.stock}</div>
            </div>
            {expiryLoading && (
              <div className="mi-metric">
                <div className="mi-metric__label">Status</div>
                <div className="mi-metric__value" style={{ fontSize: 14 }}>
                  Loading…
                </div>
              </div>
            )}
            <div className="mi-actions" style={{ gap: 8 }}>
              {/* Year filter */}
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Year</label>
                <select
                  className="input"
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
              </div>
              {/* Month filter */}
              <div
                className="field"
                style={{ margin: 0, opacity: expYear === "ALL" ? 0.6 : 1 }}
              >
                <label className="label">Month</label>
                <select
                  className="input"
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  disabled={expYear === "ALL"}
                >
                  <option value="ALL">All months</option>
                  {Array.from({ length: 12 }, (_, i) => pad(i + 1)).map((m) => (
                    <option key={m} value={m}>
                      {new Date(`2025-${m}-01`).toLocaleString("en-US", {
                        month: "long",
                      })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {expiryNote && (
            <div className="text-xs" style={{ color: "#666", marginBottom: 8 }}>
              {expiryNote}
            </div>
          )}

          <div className="card">
            <h4 className="card__title">Average Expiry Proximity</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU #</th>
                    <th>Medicine Name</th>
                    <th>Medicine Type</th>
                    <th>Quantity</th>
                    <th>Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(expiryCalc.rows.length ? expiryCalc.rows : expiryRows).length ? (
                    (expiryCalc.rows.length ? expiryCalc.rows : expiryRows).map((r) => (
                      <tr key={r.id}>
                        <td>{r.sku}</td>
                        <td>{r.medicine_name}</td>
                        <td>{r.dosage_form || "—"}</td>
                        <td>{r.quantity}</td>
                        <td>
                          {r.expiration_date
                            ? new Date(r.expiration_date).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        No expiring medicines found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}