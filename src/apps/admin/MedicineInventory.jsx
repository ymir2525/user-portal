// src/apps/admin/MedicineInventory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./MedicineInventory.css"; // ← NEW: external stylesheet

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

export default function MedicineInventory({ flash }) {
  const [classification, setClassification] = useState("");
  const [customClassification, setCustomClassification] = useState("");
  const [medicineName, setMedicineName] = useState("");
  const [customMedicine, setCustomMedicine] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [inventory, setInventory] = useState([]);
  const [busy, setBusy] = useState(false);

  const [catalog, setCatalog] = useState([]); // [{ classification, medicine_name }]
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const groupedOptions = useMemo(() => {
    const map = {};
    for (const row of catalog) {
      if (!map[row.classification]) map[row.classification] = [];
      map[row.classification].push(row.medicine_name);
    }
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.localeCompare(b)));
    return map;
  }, [catalog]);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    const { data, error } = await supabase
      .from("medicine_catalog")
      .select("classification, medicine_name")
      .order("classification", { ascending: true })
      .order("medicine_name", { ascending: true });
    if (error) console.error("❌ Error loading catalog:", error);
    setCatalog(data || []);
    setLoadingCatalog(false);
  };

  const loadInventory = async () => {
    const { data, error } = await supabase
      .from("medicine_inventory")
      .select("*")
      .order("id", { ascending: false });
    if (error) console.error("❌ Error loading inventory:", error);
    setInventory(data || []);
  };

  useEffect(() => {
    loadCatalog();
    loadInventory();

    const invCh = supabase
      .channel("realtime_inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_inventory" }, loadInventory)
      .subscribe();

    const catCh = supabase
      .channel("realtime_catalog")
      .on("postgres_changes", { event: "*", schema: "public", table: "medicine_catalog" }, loadCatalog)
      .subscribe();

    return () => {
      supabase.removeChannel(invCh);
      supabase.removeChannel(catCh);
    };
  }, []);

  const onClassificationChange = (val) => {
    setClassification(val);
    setCustomClassification("");
    setMedicineName("");
    setCustomMedicine("");
  };

  const effectiveClassification =
    classification === "Others" ? customClassification.trim() : classification;

  const medicinesForSelectedClass = useMemo(() => {
    return effectiveClassification ? groupedOptions[effectiveClassification] || [] : [];
  }, [effectiveClassification, groupedOptions]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const qtyNum = Number(quantity);
  const qtyError =
    quantity === ""
      ? ""
      : !Number.isFinite(qtyNum) || !Number.isInteger(qtyNum) || qtyNum <= 0
      ? "Quantity must be a positive whole number."
      : "";

  const expError =
    !expirationDate ? "" : expirationDate < todayStr ? "Expiration date cannot be earlier than today." : "";

  const hasErrors = Boolean(qtyError || expError);

  const handleAddInventory = async (e) => {
    e.preventDefault();
    if (!effectiveClassification) return flash?.("Classification is required.", "error");

    const finalMedicine =
      medicineName === "Others" ? customMedicine.trim() : (medicineName || "").trim();

    if (!finalMedicine || !quantity || !expirationDate) {
      return flash?.("All fields are required.", "error");
    }
    if (!Number.isFinite(qtyNum) || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      return flash?.("Quantity must be a positive whole number.", "error");
    }
    if (expirationDate < todayStr) {
      return flash?.("Expiration date cannot be earlier than today.", "error");
    }

    if (
      !window.confirm(
        `Please confirm:\n\nClassification: ${effectiveClassification}\nMedicine: ${finalMedicine}\nQuantity: ${qtyNum}\nExpiration: ${new Date(
          expirationDate
        ).toLocaleDateString()}`
      )
    )
      return;

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("medicine_inventory")
        .insert([
          {
            classification: effectiveClassification,
            medicine_name: finalMedicine,
            quantity: qtyNum,
            expiration_date: expirationDate,
          },
        ])
        .select();
      if (error) throw error;

      await supabase
        .from("medicine_catalog")
        .upsert(
          [{ classification: effectiveClassification, medicine_name: finalMedicine }],
          { onConflict: "classification,medicine_name" }
        );

      setInventory((prev) => [...data, ...prev]);
      flash?.("Medicine added to inventory.", "success");

      setClassification("");
      setCustomClassification("");
      setMedicineName("");
      setCustomMedicine("");
      setQuantity("");
      setExpirationDate("");
    } catch (err) {
      console.error("❌ Insert error:", err);
      flash?.("Failed to add medicine to inventory.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mi-section">
      <h3 className="mi-title">Medicine Inventory Management</h3>

      <form onSubmit={handleAddInventory} className="card card--form">
        <div className="grid">
          <div className="field">
            <label className="label">Classification of Medicine *</label>
            <select
              className="input"
              value={classification}
              onChange={(e) => onClassificationChange(e.target.value)}
              required
              disabled={loadingCatalog}
            >
              <option value="">{loadingCatalog ? "Loading..." : "Select Classification"}</option>
              {BASE_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {classification === "Others" && (
              <input
                className="input mt-2"
                placeholder="Type classification (e.g., Antitubercular)"
                value={customClassification}
                onChange={(e) => setCustomClassification(e.target.value)}
                required
              />
            )}
          </div>

          <div className="field">
            <label className="label">Search or Select Medicine *</label>
            <select
              className="input"
              value={medicineName}
              onChange={(e) => setMedicineName(e.target.value)}
              disabled={
                loadingCatalog || (!classification ? true : classification === "Others" && !customClassification.trim())
              }
              required
            >
              <option value="">{!classification ? "Select classification first" : "Select Medicine"}</option>
              {medicinesForSelectedClass.map((med) => (
                <option key={med} value={med}>
                  {med}
                </option>
              ))}
              {effectiveClassification && <option value="Others">Others</option>}
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
            <label className="label">Quantity *</label>
            <input
              type="number"
              inputMode="numeric"
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
            <label className="label">Expiration Date *</label>
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

        <button disabled={busy || hasErrors} className="btn btn--orange mt-5">
          {busy ? "Adding..." : "Add to Inventory"}
        </button>
      </form>

      <div className="card">
        <h4 className="card__title">Current Inventory</h4>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Medicine Name</th>
                <th>Quantity</th>
                <th>Expiration Date</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length ? (
                inventory.map((item, i) => (
                  <tr key={item.id} className={i % 2 ? "is-even" : "is-odd"}>
                    <td>{item.classification}</td>
                    <td>{item.medicine_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="table-empty">
                    No medicines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
