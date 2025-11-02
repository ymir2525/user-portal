// src/apps/doctor/DoctorInventory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
// Reuse the existing styles from Admin. Adjust path if you moved the CSS.
import "../admin/MedicineInventory.css";

export default function DoctorInventory() {
  const [tab, setTab] = useState("stock"); // 'stock' | 'dispense'
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ stock: 0, distributed: 0 });

  // catalog (classification -> medicine list) — used only for future doctor features
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // search
  const [q, setQ] = useState("");

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  // loads
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
    // stock from inventory; distributed from transactions
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

  useEffect(() => {
    loadCatalog();
    loadInventory();
    loadTotals();

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
        loadTotals
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
  }, [todayStr]);

  // search filter
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
        <div className="card">
          <h4 className="card__title">Dispense List</h4>
          <div className="muted small">
            Coming next (read-only history of “out” transactions per patient).
          </div>
        </div>
      )}
    </section>
  );
}
