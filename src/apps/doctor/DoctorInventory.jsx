import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./DoctorInventory.css"; // Custom CSS file

export default function DoctorInventory() {
  const [tab, setTab] = useState("stock"); // 'stock' | 'dispense'
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ stock: 0, distributed: 0 });
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [q, setQ] = useState("");

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dispenseRows, setDispenseRows] = useState([]);
  const [distributedOnSelected, setDistributedOnSelected] = useState(0);
  const MIN_DATE = "2000-01-01";
  const MAX_DATE = todayStr;

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

  useEffect(() => {
    loadCatalog();
    loadInventory();
    loadTotals();
    loadDispenseFor(selectedDate);

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
          <div className="mi-metrics">
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine in Stock</div>
              <div className="mi-metric__value">{totals.stock}</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine Distributed</div>
              <div className="mi-metric__value">{totals.distributed}</div>
            </div>
          </div>

          <div className="field">
            <label className="label">Search</label>
            <input
              className="input"
              placeholder="Search classification, name, type…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

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

            <div className="mi-actions">
              <div className="field">
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
