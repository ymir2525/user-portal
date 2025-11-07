  import React, { useEffect, useMemo, useState } from "react";
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
    const [tab, setTab] = useState("stock"); // 'stock' | 'dispense' | 'expiry'
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
      Object.values(map).forEach((list) => list.sort((a, b) => a.localeCompare(b)));
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

    /* --------- Remove by SKU modal state --------- */
    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const [removeSku, setRemoveSku] = useState("");
    const [removeCandidate, setRemoveCandidate] = useState(null); // lot row matched by SKU
    const [busyRemove, setBusyRemove] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

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
        .filter((r) => !r.expiration_date || r.expiration_date >= todayStr)
        .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const distributed = (tx || [])
        .filter((t) => t.direction === "out")
        .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      setTotals({ stock, distributed });
    }

    // ---- helpers (dispense day range) ----
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

    // ---- Dispense loader ----
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
      setDistributedOnSelected(enriched.reduce((s, r) => s + (Number(r.quantity) || 0), 0));
    }

    /* --------- SKU helpers for removal --------- */
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

    function resolveSkuToRow(sku, rows) {
      if (!sku) return null;
      const target = sku.trim().toUpperCase();
      const matches = (rows || []).filter((r) => makeSKUFromRow(r) === target);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        return matches.sort((a, b) => Number(b.id) - Number(a.id))[0];
      }
      return null;
    }

    useEffect(() => {
      if (!removeSku) {
        setRemoveCandidate(null);
        return;
      }
      setRemoveCandidate(resolveSkuToRow(removeSku, inventory));
    }, [removeSku, inventory]);

    async function handleRemoveLotBySku() {
      if (!removeCandidate) return;
      setBusyRemove(true);
      try {
        const { error: delErr } = await supabase
          .from("medicine_inventory") 
          .delete()
          .eq("id", removeCandidate.id);
        if (delErr) throw delErr;

        const { data: sess } = await supabase.auth.getSession();
        const staff_id = sess?.session?.user?.id ?? null;

        await supabase.from("medicine_transactions").insert({
          direction: "out",
          classification: removeCandidate.classification,
          medicine_name: removeCandidate.medicine_name,
          dosage_form: removeCandidate.dosage_form,
          quantity: Number(removeCandidate.quantity) || 0,
          staff_id,
          note: `Admin removed lot via SKU ${makeSKUFromRow(removeCandidate)}`,
        });

        flash?.("Stock lot removed.", "success");
        setConfirmRemove(false);
        setShowRemoveModal(false);
        setRemoveSku("");
        setRemoveCandidate(null);
        loadInventory();
        loadTotals();
        loadExpiry();
      } catch (e) {
        console.error(e);
        flash?.("Failed to remove stock.", "error");
      } finally {
        setBusyRemove(false);
      }
    }

    // ---------- Average Expiry Proximity state/logic ---------- //
    const [expiryRows, setExpiryRows] = useState([]); // full dataset
    const [expiryLoading, setExpiryLoading] = useState(false);
    const [expiryNote, setExpiryNote] = useState("");

    const currentYear = new Date().getFullYear();
    const [yearOptions, setYearOptions] = useState(["ALL", String(currentYear)]);
    const [expYear, setExpYear] = useState("ALL"); // "ALL" | number-string
    const [expMonth, setExpMonth] = useState("ALL"); // "ALL" | "01".."12"

    function pad(n) {
      return String(n).padStart(2, "0");
    }
    function addMonths(d, n) {
      const x = new Date(d);
      x.setUTCMonth(x.getUTCMonth() + n);
      return x;
    }

    const recomputeYearOptionsFromRows = (rows) => {
      const maxExpYear = (rows || []).reduce((max, r) => {
        const y = r.expiration_date ? new Date(r.expiration_date).getFullYear() : currentYear;
        return Math.max(max, y);
      }, currentYear);

      const years = ["ALL"];
      for (let y = currentYear; y <= maxExpYear; y++) years.push(String(y));
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
      const targetStart = new Date(`${expYear}-${targetMonth}-01T00:00:00+08:00`);
      const targetEnd = expMonth === "ALL" ? addMonths(targetStart, 12) : addMonths(targetStart, 1);

      const inRange = expiryRows.filter((r) => {
        if (!r.expiration_date) return false;
        const d = new Date(r.expiration_date);
        return d >= targetStart && d < targetEnd;
      });

      if (inRange.length) return { rows: inRange, note: "" };

      const within24 = expiryRows.filter((r) => {
        if (!r.expiration_date) return false;
        const d = new Date(r.expiration_date);
        return d >= targetEnd && d < addMonths(targetEnd, 24);
      });

      const beyond24 = expiryRows.filter((r) => {
        if (!r.expiration_date) return false;
        const d = new Date(r.expiration_date);
        return d >= addMonths(targetEnd, 24);
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

    // initial loads + realtime
    useEffect(() => {
      loadCatalog();
      loadInventory();
      loadTotals();
      loadDispenseFor(selectedDate);
      loadExpiry();

      const invCh = supabase
        .channel("realtime_inventory_admin")
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

      return () => {
        supabase.removeChannel(invCh);
        supabase.removeChannel(txCh);
        supabase.removeChannel(catCh);
      };
    }, [todayStr, selectedDate]);

    // search filter (stock tab)
    const filtered = useMemo(() => {
      const needle = q.trim().toLowerCase();
      if (!needle) return inventory;
      return inventory.filter((r) => {
        const s = [r.classification, r.medicine_name, r.dosage_form, r.expiration_date]
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
      return effectiveClassification ? groupedOptions[effectiveClassification] || [] : [];
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

        await supabase
          .from("medicine_catalog")
          .upsert(
            [{ classification: cls, medicine_name: name, dosage_form: dosageForm }],
            { onConflict: "classification,medicine_name" }
          );

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
        loadExpiry();
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
          <button
            className={`mi-tab ${tab === "expiry" ? "is-active" : ""}`}
            onClick={() => setTab("expiry")}
          >
            Average Expiry Proximity
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
                <button className="btn btn--green" onClick={() => setShowModal(true)}>
                  Add Stock
                </button>

                {/* Remove Stock button */}
                <button
                  className="btn btn--red"
                  onClick={() => {
                    setRemoveSku("");
                    setRemoveCandidate(null);
                    setShowRemoveModal(true);
                  }}
                >
                  Remove Stock
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

        {/* Average Expiry Proximity tab */}
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
                      {(groupedOptions[effectiveClassification] || []).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
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

        {/* Remove Stock Modal */}
        {showRemoveModal && (
          <div className="mi-modal">
            <div className="mi-modal__body" style={{ borderColor: "#b42318" }}>
              <div className="mi-modal__title">Remove Medicine to Stock</div>

              <div className="field">
                <label className="label">SKU *</label>
                <input
                  className="input"
                  placeholder="e.g. AMX-T2509-123"
                  value={removeSku}
                  onChange={(e) => setRemoveSku(e.target.value.toUpperCase())}
                  autoFocus
                />
                <div className="text-xs mt-1" style={{ color: "#666" }}>
                  Use the SKU shown in Analytics &gt; Average Expiry Proximity.
                </div>
              </div>

              <div className="card" style={{ marginTop: 10 }}>
                <h4 className="card__title">Matched Lot</h4>
                {removeCandidate ? (
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div className="text-xs text-gray-600">Medicine</div>
                      <div className="font-medium">{removeCandidate.medicine_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Type</div>
                      <div className="font-medium">{removeCandidate.dosage_form || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Quantity</div>
                      <div className="font-medium">{removeCandidate.quantity}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Expiry</div>
                      <div className="font-medium">
                        {removeCandidate.expiration_date
                          ? new Date(removeCandidate.expiration_date).toLocaleDateString()
                          : "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">No matching lot found for that SKU.</div>
                )}
              </div>

              <div className="mi-modal__actions">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setShowRemoveModal(false);
                    setRemoveSku("");
                    setRemoveCandidate(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={!removeCandidate || busyRemove}
                  className="btn btn--red"
                  onClick={() => setConfirmRemove(true)}
                >
                  {busyRemove ? "Removing…" : "Remove Stock"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Final Confirm Modal */}
        {confirmRemove && (
          <div className="mi-modal">
            <div className="mi-modal__body" style={{ borderColor: "#b42318" }}>
              <div className="mi-modal__title">Remove Medicine to Stock</div>
              <p className="text-center" style={{ margin: "8px 0 16px" }}>
                Are you sure you want to proceed removing this lot?
              </p>
              <div className="mi-modal__actions">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--red"
                  disabled={busyRemove}
                  onClick={handleRemoveLotBySku}
                >
                  {busyRemove ? "Removing…" : "Yes, Remove"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }
