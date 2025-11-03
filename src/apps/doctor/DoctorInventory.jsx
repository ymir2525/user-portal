// src/apps/doctor/DoctorInventory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
// Reuse the existing styles from Admin. Adjust path if needed.
import "../admin/MedicineInventory.css";

export default function DoctorInventory() {
  const [tab, setTab] = useState("stock"); // 'stock' | 'dispense'
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ stock: 0, distributed: 0 });

  // catalog (classification -> medicine list) — currently read-only/for future doctor features
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // search (stock tab)
  const [q, setQ] = useState("");

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  /* ---------- Dispense tab state ---------- */
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dispenseRows, setDispenseRows] = useState([]);
  const [distributedOnSelected, setDistributedOnSelected] = useState(0);
  const MIN_DATE = "2000-01-01";
  const MAX_DATE = todayStr;

  /* ---------- Helpers (Manila day boundaries for Postgres timestamps) ---------- */
  // Format Date to "YYYY-MM-DD HH:MM:SS" (UTC, no 'Z') for Postgres comparisons
  function fmtPgTimestampUTC(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    );
  }
  // Given a Manila date (YYYY-MM-DD), return UTC 'from' (inclusive) and 'to' (exclusive)
  function manilaDayUtcRange(dateStr) {
    const startManila = new Date(`${dateStr}T00:00:00+08:00`);
    const nextManila = new Date(`${dateStr}T00:00:00+08:00`);
    nextManila.setDate(nextManila.getDate() + 1);
    return { from: fmtPgTimestampUTC(startManila), to: fmtPgTimestampUTC(nextManila) };
  }

  /* ---------- Loads ---------- */
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
    // stock from inventory; distributed (lifetime) from transactions
    const [{ data: inv }, { data: tx, error: txErr }] = await Promise.all([
      supabase.from("medicine_inventory").select("quantity, expiration_date"),
      supabase.from("medicine_transactions").select("quantity, direction"),
    ]);
    if (txErr) console.error(txErr);

    const stock = (inv || [])
      .filter((r) => !r.expiration_date || r.expiration_date >= todayStr)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);

    const distributed = (tx || [])
      .filter((t) => t.direction === "out")
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);

    setTotals({ stock, distributed });
  }

  // Load dispense transactions for the selected Manila day, enriched with patient info
  async function loadDispenseFor(dateStr) {
    const { from, to } = manilaDayUtcRange(dateStr);

    // 1) get transactions for the day
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

    // 2) look up patient info for any patient_ids we have
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

    // 3) enrich rows for rendering
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

  /* ---------- Effects (initial + realtime) ---------- */
  useEffect(() => {
    loadCatalog();
    loadInventory();
    loadTotals();
    loadDispenseFor(selectedDate);

    // realtime (read-only listeners for doctor)
    const invCh = supabase
      .channel("realtime_inventory_doctor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_inventory" },
        () => {
          loadInventory();
          loadTotals();
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
          loadDispenseFor(selectedDate); // keep the current pick fresh
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
    // include selectedDate so realtime refresh respects current day
  }, [todayStr, selectedDate]);

  /* ---------- Search filter (stock tab) ---------- */
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
      </div>

      {tab === "stock" && (
        <>
          {/* Metrics (read-only) */}
          <div className="mi-metrics">
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine in Stock</div>
              <div className="mi-metric__value">{totals.stock}</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine Distributed</div>
              <div className="mi-metric__value">{totals.distributed}</div>
            </div>
            {/* No Add Stock / actions for Doctor */}
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

      {tab === "dispense" && (
        <>
          {/* Metrics (distributed reflects selected date) */}
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

            {/* Date picker */}
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
    </section>
  );
}
