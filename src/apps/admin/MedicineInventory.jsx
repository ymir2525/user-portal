// src/apps/admin/MedicineInventory.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import "./MedicineInventory.css";

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

export default function MedicineInventory({ flash }) {
  const [tab, setTab] = useState("stock"); // 'stock' | 'dispense'
  const [inventory, setInventory] = useState([]);
  const [totals, setTotals] = useState({ stock: 0, distributed: 0 });

  // catalog (classification -> medicine list)
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const groupedOptions = useMemo(() => {
    const map = {};
    for (const row of catalog) {
      const key = row.classification;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(row.medicine_name)) map[key].push(row.medicine_name);
    }
    Object.values(map).forEach(list => list.sort((a,b)=>a.localeCompare(b)));
    return map;
  }, [catalog]);

  // search (stock tab)
  const [q, setQ] = useState("");

  // modal state (add stock)
  const [showModal, setShowModal] = useState(false);
  const [classification, setClassification] = useState("");
  const [customClassification, setCustomClassification] = useState("");
  const [medicineName, setMedicineName] = useState("");
  const [customMedicine, setCustomMedicine] = useState("");
  const [dosageForm, setDosageForm] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveClassification =
    classification === "Others" ? customClassification.trim() : classification;
  const effectiveMedicine =
    medicineName === "Others" ? customMedicine.trim() : medicineName;

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
    // stock from inventory; distributed (lifetime) from transactions
    const [{ data: inv }, { data: tx }] = await Promise.all([
      supabase.from("medicine_inventory").select("quantity, expiration_date"),
      supabase.from("medicine_transactions").select("quantity, direction"),
    ]);
    const stock = (inv || [])
      .filter(r => !r.expiration_date || r.expiration_date >= todayStr)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const distributed = (tx || [])
      .filter(t => t.direction === "out")
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    setTotals({ stock, distributed });
  }

// Format Date to "YYYY-MM-DD HH:MM:SS" (UTC, no 'Z')
function fmtPgTimestampUTC(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

// ---- helpers (put above loadDispenseFor or nearby) ----
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

// ---- REPLACE your loadDispenseFor with this ----
async function loadDispenseFor(dateStr) {
  const { from, to } = manilaDayUtcRange(dateStr);

  // 1) get transactions for the day (no non-existent columns)
  const { data: tx, error } = await supabase
    .from("medicine_transactions")
    .select("id, created_at, direction, classification, medicine_name, dosage_form, quantity, patient_id")
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
  const ids = Array.from(new Set(rows.map(r => r.patient_id).filter(Boolean)));
  let byPatient = new Map();
  if (ids.length) {
    const { data: pats, error: pErr } = await supabase
      .from("patients")
      .select("id, family_number, first_name, middle_name, surname")
      .in("id", ids);
    if (!pErr && pats) {
      byPatient = new Map(pats.map(p => [p.id, p]));
    }
  }

  // 3) enrich rows for rendering
  const enriched = rows.map(r => {
    const p = r.patient_id ? byPatient.get(r.patient_id) : null;
    const patient_name = p ? [p.first_name, p.middle_name, p.surname].filter(Boolean).join(" ") : "—";
    const family_number = p?.family_number || "—";
    return { ...r, patient_name, family_number };
  });

  setDispenseRows(enriched);
  setDistributedOnSelected(enriched.reduce((s, r) => s + (Number(r.quantity) || 0), 0));
}



  useEffect(() => {
    loadCatalog();
    loadInventory();
    loadTotals();

    const invCh = supabase
      .channel("realtime_inventory_admin")
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
      .channel("realtime_transactions_admin")
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
      .channel("realtime_catalog_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_catalog" },
        loadCatalog
      )
      .subscribe();

    // initial load for dispense tab
    loadDispenseFor(selectedDate);

    return () => {
      supabase.removeChannel(invCh);
      supabase.removeChannel(txCh);
      supabase.removeChannel(catCh);
    };
    // intentionally include selectedDate so realtime refresh uses the current pick
  }, [todayStr, selectedDate]);

  // search filter (stock tab)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return inventory;
    return inventory.filter(r => {
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

  // modal helpers
  function resetModal() {
    setClassification("");
    setCustomClassification("");
    setMedicineName("");
    setCustomMedicine("");
    setDosageForm("");
    setQuantity("");
    setExpirationDate("");
  }

  const medicinesForSelectedClass = useMemo(() => {
    return effectiveClassification
      ? groupedOptions[effectiveClassification] || []
      : [];
  }, [effectiveClassification, groupedOptions]);

  const qtyNum = Number(quantity);
  const qtyError =
    quantity === ""
      ? ""
      : !Number.isFinite(qtyNum) || !Number.isInteger(qtyNum) || qtyNum <= 0
      ? "Quantity must be a positive whole number."
      : "";

  const expError = !expirationDate
    ? ""
    : expirationDate < todayStr
    ? "Expiration date cannot be earlier than today."
    : "";

  const hasErrors = !!(qtyError || expError);

  async function handleAddStock(e) {
    e.preventDefault();
    const cls = effectiveClassification;
    const name = (effectiveMedicine || "").trim();
    if (!cls || !name || !dosageForm || !quantity || !expirationDate) {
      flash?.("All fields are required.", "error");
      return;
    }
    if (hasErrors) return;

    if (
      !window.confirm(
        `Please confirm:\n\nClassification: ${cls}\nName: ${name}\nType: ${dosageForm}\nQuantity: ${qtyNum}\nExpiry: ${new Date(
          expirationDate
        ).toLocaleDateString()}`
      )
    )
      return;

    setBusy(true);
    try {
      // 1) Add/merge to inventory as a new lot
      const { error } = await supabase.from("medicine_inventory").insert([
        {
          classification: cls,
          medicine_name: name,
          dosage_form: dosageForm,
          quantity: qtyNum,
          expiration_date: expirationDate,
        },
      ]);
      if (error) throw error;

      // 2) Ensure catalog knows about it (with dosage_form)
      await supabase
        .from("medicine_catalog")
        .upsert(
          [{ classification: cls, medicine_name: name, dosage_form: dosageForm }],
          { onConflict: "classification,medicine_name" }
        );

      // 3) Log transaction
      const { data: sess } = await supabase.auth.getSession();
      const staff_id = sess?.session?.user?.id ?? null;
      await supabase.from("medicine_transactions").insert({
        direction: "in",
        classification: cls,
        medicine_name: name,
        dosage_form: dosageForm,
        quantity: qtyNum,
        staff_id,
        note: "Admin add stock",
      });

      flash?.("Stock added.", "success");
      setShowModal(false);
      resetModal();
      loadTotals();
    } catch (err) {
      console.error(err);
      flash?.("Failed to add stock.", "error");
    } finally {
      setBusy(false);
    }
  }

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
          {/* Metrics + actions */}
          <div className="mi-metrics">
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine in Stock</div>
              <div className="mi-metric__value">{totals.stock}</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric__label">Total Medicine Distributed</div>
              <div className="mi-metric__value">{totals.distributed}</div>
            </div>
            <div className="mi-actions">
              <button
                className="btn btn--green"
                onClick={() => setShowModal(true)}
              >
                Add Stock
              </button>
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

      {/* Add Stock Modal */}
      {showModal && (
        <div className="mi-modal">
          <div className="mi-modal__body">
            <div className="mi-modal__title">Add Medicine to Stock</div>

            <form onSubmit={handleAddStock}>
              <div className="grid">
                <div className="field">
                  <label className="label">Classification *</label>
                  <select
                    className="input"
                    value={classification}
                    onChange={(e) => {
                      setClassification(e.target.value);
                      setCustomClassification("");
                      setMedicineName("");
                      setCustomMedicine("");
                    }}
                    required
                  >
                    <option value="">
                      {loadingCatalog ? "Loading..." : "Select classification"}
                    </option>
                    {BASE_CLASSIFICATIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {classification === "Others" && (
                    <input
                      className="input mt-2"
                      placeholder="Type classification"
                      value={customClassification}
                      onChange={(e) => setCustomClassification(e.target.value)}
                      required
                    />
                  )}
                </div>

                <div className="field">
                  <label className="label">Name of Medicine *</label>
                  <select
                    className="input"
                    value={medicineName}
                    onChange={(e) => setMedicineName(e.target.value)}
                    disabled={!effectiveClassification}
                    required
                  >
                    <option value="">
                      {effectiveClassification
                        ? "Select medicine"
                        : "Select classification first"}
                    </option>
                    {(groupedOptions[effectiveClassification] || []).map(
                      (m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      )
                    )}
                    {effectiveClassification && (
                      <option value="Others">Others</option>
                    )}
                  </select>
                  {medicineName === "Others" && (
                    <input
                      className="input mt-2"
                      placeholder="Type medicine name"
                      value={customMedicine}
                      onChange={(e) => setCustomMedicine(e.target.value)}
                      required
                    />
                  )}
                </div>

                <div className="field">
                  <label className="label">Type of Medicine *</label>
                  <select
                    className="input"
                    value={dosageForm}
                    onChange={(e) => setDosageForm(e.target.value)}
                    required
                  >
                    <option value="">Select type</option>
                    {DOSAGE_FORMS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Number of Stock *</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={`input ${qtyError ? "input--error" : ""}`}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    aria-invalid={qtyError ? "true" : "false"}
                  />
                  {qtyError && (
                    <p className="error-text" role="alert">
                      {qtyError}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label className="label">Expiry Date *</label>
                  <input
                    type="date"
                    min={todayStr}
                    className={`input ${expError ? "input--error" : ""}`}
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    required
                    aria-invalid={expError ? "true" : "false"}
                  />
                  {expError && (
                    <p className="error-text" role="alert">
                      {expError}
                    </p>
                  )}
                </div>
              </div>

              <div className="mi-modal__actions">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setShowModal(false);
                    resetModal();
                  }}
                >
                  Discard
                </button>
                <button disabled={busy || hasErrors} className="btn btn--green">
                  {busy ? "Adding…" : "Add Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
