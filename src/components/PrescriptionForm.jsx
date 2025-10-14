// src/components/PrescriptionForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDate, fullName } from "../lib/utils";
import { supabase } from "../lib/supabase";
import SignatureDialog from "./signaturePad/SignatureDialog"; // ← NEW

export default function PrescriptionForm({ active, onBack, onSavePdf }) {
  const nav = useNavigate();

  // --- MEDICINE INVENTORY STATE ---
  const [medicines, setMedicines] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [medErr, setMedErr] = useState("");

  // Fetch from Supabase once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingMeds(true);
        setMedErr("");

        const { data, error } = await supabase
          .from("medicine_inventory")
          .select("id, classification, medicine_name, quantity, expiration_date")
          .order("medicine_name", { ascending: true });

        if (error) throw error;
        if (!alive) return;
        setMedicines(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setMedErr(e.message || "Failed to load medicines");
        setMedicines([]);
      } finally {
        if (alive) setLoadingMeds(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const [date, setDate] = useState(() => fmtDate(new Date()));
  const [doctorName, setDoctorName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [items, setItems] = useState([{ med_id: null, name: "", sig: "", qty: "" }]);

  // --- Signature (NEW) ---
  const [doctorSignaturePng, setDoctorSignaturePng] = useState("");
  const [sigOpen, setSigOpen] = useState(false);

  // ---------------- Month-rule + sex helpers ----------------
  const ageDisplayFromBirthdate = (birthdate, fallbackAge) => {
    if (!birthdate) return (fallbackAge ?? "") === "" ? "" : String(fallbackAge);
    const bd = new Date(birthdate);
    if (isNaN(bd)) return (fallbackAge ?? "") === "" ? "" : String(fallbackAge);

    const now = new Date();
    let months =
      (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
    if (now.getDate() < bd.getDate()) months -= 1;
    months = Math.max(0, months);

    if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
    const years = Math.floor(months / 12);
    return `${years}`;
  };

  const sexDisplay = (sex) => {
    if (!sex) return "";
    const s = String(sex).toUpperCase();
    if (s === "MEN") return "MALE";
    if (s === "WOMEN") return "FEMALE";
    return s;
  };

  // Build dropdown options (use string values for <select>)
  const medOptions = useMemo(
    () =>
      medicines.map((m) => ({
        id: m.id,
        value: String(m.id),
        label: `${m.medicine_name} — ${m.classification} (qty: ${m.quantity})`,
        name: m.medicine_name,
      })),
    [medicines]
  );

  const setItem = (idx, patch) =>
    setItems((list) => list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addRow = () => setItems((l) => [...l, { med_id: null, name: "", sig: "", qty: "" }]);
  const removeRow = (i) => setItems((l) => l.filter((_, idx) => idx !== i));

  // Month rule applied here
  const computeAge = () => ageDisplayFromBirthdate(active?.birthdate, active?.age);

  const payload = {
    patient: {
      id: active?.patient_id,
      name: fullName(active),
      sex: sexDisplay(active?.sex) || "",
      age: computeAge() || "",
    },
    date,
    doctor_name: doctorName,
    license_no: licenseNo,
    signature_png: doctorSignaturePng || "", // ← NEW: include in payload sent to onSavePdf
    items: items
      .filter((r) => r.med_id || r.name || r.sig || r.qty)
      .map((r) => ({ med_id: r.med_id, name: r.name, sig: r.sig, qty: r.qty })),
  };

  // -------- Validation before saving/printing --------
  const validateBeforeSave = () => {
    const missing = [];

    if (!String(date).trim()) missing.push("Date");
    if (!String(doctorName).trim()) missing.push("Physician");
    if (!String(licenseNo).trim()) missing.push("License No.");
    // If you want the drawn signature to be mandatory, uncomment:
    // if (!doctorSignaturePng) missing.push("Physician Signature");

    // at least one medicine with name + qty + sig
    const cleaned = items
      .map((r) => ({
        name: String(r.name || "").trim(),
        qty: String(r.qty || "").trim(),
        sig: String(r.sig || "").trim(),
      }))
      .filter((r) => r.name || r.qty || r.sig);

    if (cleaned.length === 0) {
      missing.push("At least one medicine row (Name, Directions, Quantity)");
    } else {
      const badRows = [];
      cleaned.forEach((r, idx) => {
        const problems = [];
        if (!r.name) problems.push("Name");
        if (!r.sig) problems.push("Directions");
        if (!r.qty) problems.push("Quantity");
        else if (!/^\d+$/.test(r.qty) || Number(r.qty) <= 0) problems.push("Quantity must be a positive number");
        if (problems.length) badRows.push(`Row ${idx + 1}: ${problems.join(", ")}`);
      });
      if (badRows.length) missing.push(...badRows);
    }

    if (missing.length) {
      alert(
        "Please complete the following before saving as PDF:\n\n• " +
          missing.join("\n• ")
      );
      return false;
    }
    return true;
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validateBeforeSave()) return;
    onSavePdf(payload);
    window.print(); // we isolate printing to the sheet via @media print rules below
  };

  return (
    <div className="max-w-[960px] mx-auto">
      {/* ---------- SCREEN ENTRY (hidden on print) ---------- */}
      <div className="print:hidden">
        {/* Top bar with only one Save button */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Prescription</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 rounded bg-orange-200 hover:bg-orange-300 text-sm"
            >
              Back
            </button>
            <button
              type="submit"
              form="rx-form"
              className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-sm"
            >
              Save as PDF
            </button>
          </div>
        </div>

        {/* Card like the referral form */}
        <div className="mx-auto bg-white border rounded shadow-sm">
          <div className="p-6">
            <div className="text-center leading-tight mb-4">
              <div className="font-semibold">Caybiga Health Center</div>
              <div className="text-xs text-gray-600 tracking-wide">PRESCRIPTION FORM</div>
            </div>

            <form id="rx-form" onSubmit={submit} className="space-y-6" autoComplete="off">
              {/* Patient row */}
              <section className="grid md:grid-cols-3 gap-4">
                <Field label="Patient Name">
                  <input className="w-full h-10 border rounded px-3 bg-gray-50" readOnly value={fullName(active)} />
                </Field>
                <Field label="Sex">
                  <input className="w-full h-10 border rounded px-3 bg-gray-50" readOnly value={sexDisplay(active?.sex) || ""} />
                </Field>
                <Field label="Age">
                  <input className="w-full h-10 border rounded px-3 bg-gray-50" readOnly value={computeAge() || ""} />
                </Field>
              </section>

              {/* Meta row */}
              <section className="grid md:grid-cols-3 gap-4">
                <Field label="Date">
                  <input className="w-full h-10 border rounded px-3" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Physician" required>
                  <input className="w-full h-10 border rounded px-3" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} required />
                </Field>
                <Field label="License No." required>
                  <input className="w-full h-10 border rounded px-3" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} required />
                </Field>
              </section>

              {/* Signature capture (NEW) */}
              <section className="text-sm">
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => setSigOpen(true)}
                    className="rounded-md border px-3 py-1 hover:bg-slate-50"
                  >
                    {doctorSignaturePng ? "Retake Signature" : "Capture Signature"}
                  </button>

                  {doctorSignaturePng && (
                    <div className="flex items-center gap-3">
                      <img
                        src={doctorSignaturePng}
                        alt="Physician Signature"
                        className="max-h-20 border rounded bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setDoctorSignaturePng("")}
                        className="rounded-md border px-3 py-1 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Signature will print above the “Signature” line.
                </div>
              </section>

              {/* Medicines section */}
              <section className="space-y-4">
                <div className="text-sm font-semibold">Medicines to prescribe</div>

                {items.map((row, i) => (
                  <div key={i} className="border rounded p-4 bg-white space-y-3">
                    {/* stacked fields – full width */}
                    <Field label="Select from inventory">
                      <select
                        className="w-full h-10 border rounded px-3"
                        value={row.med_id ? String(row.med_id) : ""}  // select uses string values
                        onChange={(e) => {
                          const strVal = e.target.value;
                          const id = strVal ? Number(strVal) : null;
                          const picked = medOptions.find((m) => m.id === id);
                          // set both med_id and name when selected
                          setItem(i, { med_id: id, name: picked?.name || "" });
                        }}
                      >
                        <option value="">— Select —</option>
                        {medOptions.map((m) => (
                          <option key={m.id} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                      {loadingMeds && <div className="text-xs text-gray-500 mt-1">Loading…</div>}
                      {medErr && <div className="text-xs text-red-600 mt-1">{medErr}</div>}
                    </Field>

                    <Field label="Medicine name">
                      <input
                        className="w-full h-10 border rounded px-3"
                        placeholder="Type medicine name"
                        value={row.name}
                        onChange={(e) => setItem(i, { name: e.target.value, med_id: row.med_id })}
                      />
                    </Field>

                    <Field label="Quantity">
                      <input
                        className="w-full h-10 border rounded px-3"
                        value={row.qty}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) => setItem(i, { qty: e.target.value.replace(/\D+/g, "") })}
                      />
                    </Field>

                    <Field label="Directions of use">
                      <input
                        className="w-full h-10 border rounded px-3"
                        placeholder="e.g., 1 tab BID x 7 days"
                        value={row.sig}
                        onChange={(e) => setItem(i, { sig: e.target.value })}
                      />
                    </Field>

                    <div className="pt-1 flex justify-end">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="text-xs underline text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRow} className="text-sm underline">
                  + Add another medicine
                </button>
              </section>
            </form>
          </div>
        </div>
      </div>

      {/* ---------- PRINT SHEET (shown only on print/PDF) ---------- */}
      <div id="rx-print">
        <RxPrintSheet payload={payload} />
      </div>

      {/* Print isolation so only #rx-print renders */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #rx-print, #rx-print * { visibility: visible !important; }
          #rx-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* Reusable Signature Dialog */}
      <SignatureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        initialValue={doctorSignaturePng}
        onDone={(png) => setDoctorSignaturePng(png)}
        title="Physician Signature"
        heightClass="h-56"
      />
    </div>
  );
}

/* Small helpers */
function Field({ label, span = 4, required, children }) {
  return (
    <div className={`md:col-span-${span}`}>
      <label className="block text-xs mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

function LabeledLine({ label, value, className = "" }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="font-semibold">{label}</span>
      <div className="flex-1 border-b border-gray-400 h-[18px] leading-[18px] px-2">
        {value || ""}
      </div>
    </div>
  );
}

/* Print/PDF sheet */
function RxPrintSheet({ payload }) {
  const p = payload || {};
  const items = p.items || [];
  const rows = Array.from({ length: Math.max(items.length, 5) });

  return (
    <div className="hidden print:block">
      <div className="mx-auto w-[730px] border rounded p-6 print:m-0">
        <div className="text-center leading-tight mb-3">
          <div className="font-semibold">Caybiga Health Center</div>
          <div className="text-xs">PRESCRIPTION FORM</div>
        </div>
        <div className="border-t border-orange-400 my-3" />
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-7"><LabeledLine label="Name:" value={p.patient?.name} /></div>
          <div className="col-span-2"><LabeledLine label="Age:" value={p.patient?.age} /></div>
          <div className="col-span-3"><LabeledLine label="Date:" value={p.date} /></div>
          <div className="col-span-7"><LabeledLine label="Sex:" value={p.patient?.sex} /></div>
        </div>
        <div className="font-bold text-2xl text-orange-600 mb-2">℞</div>
        <div className="mb-10">
          {rows.map((_, i) => {
            const row = items[i] || {};
            return (
              <div key={i} className="grid grid-cols-12 items-start text-xs mb-3">
                <div className="col-span-10">
                  <div className="flex items-center">
                    <div className="w-5 text-right pr-1">{i + 1}.</div>
                    <div className="flex-1 border-b border-gray-400 min-h-[18px] leading-[18px] px-2">{row.name || ""}</div>
                  </div>
                  <div className="pl-6 mt-1">
                    <span className="font-semibold">Sig:</span>{" "}
                    <span className="inline-block align-baseline w-[85%] border-b border-gray-400 min-h-[18px] leading-[18px] px-2">
                      {row.sig || ""}
                    </span>
                  </div>
                </div>
                <div className="col-span-2 text-right pr-2">
                  <div className="font-semibold">#</div>
                  <div className="min-h-[18px]">{row.qty || ""}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-12 text-xs">
          <div className="col-span-7" />
          <div className="col-span-5 text-right">
            <div className="mb-6">
              {/* Signature image if available; else show the plain line */}
              {p.signature_png ? (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                  <img
                    src={p.signature_png}
                    alt="Physician Signature"
                    style={{ maxHeight: "80px", maxWidth: "70%", objectFit: "contain" }}
                  />
                </div>
              ) : null}
              <div className="border-b border-gray-400 h-[18px]" />
              <div className="mt-1">Signature</div>
            </div>
            <div className="font-semibold">Physician: {p.doctor_name || "_____________________________"}</div>
            <div>License No.: {p.license_no || "_________________"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
