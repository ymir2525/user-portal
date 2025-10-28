// src/components/PrescriptionForm.jsx
import React, { useRef, useState } from "react";
import { fmtDate, fullName } from "../lib/utils";
import SignatureDialog from "./signaturePad/SignatureDialog";
import "./PrescriptionForm.css"; // ← external CSS (no Tailwind)

export default function PrescriptionForm({ active, onBack, onSavePdf }) {
  // --- Date / Doctor / Items (free-text only) ---
  const [date] = useState(() => fmtDate(new Date())); // read-only now
  const [doctorName, setDoctorName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [items, setItems] = useState([{ name: "", sig: "", qty: "" }]);

  // --- Signature ---
  const [doctorSignaturePng, setDoctorSignaturePng] = useState("");
  const [sigOpen, setSigOpen] = useState(false);

  // --- Print re-entry guard to prevent double dialogs ---
  const printingRef = useRef(false);

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

  const setItem = (idx, patch) =>
    setItems((list) => list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addRow = () => setItems((l) => [...l, { name: "", sig: "", qty: "" }]);
  const removeRow = (i) => setItems((l) => l.filter((_, idx) => idx !== i));

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
    signature_png: doctorSignaturePng || "",
    items: items
      .map((r) => ({
        name: String(r.name || "").trim(),
        sig: String(r.sig || "").trim(),
        qty: String(r.qty || "").trim(),
      }))
      .filter((r) => r.name || r.sig || r.qty),
  };

  // -------- Validation before saving/printing --------
  const validateBeforeSave = () => {
    const missing = [];
    if (!String(date).trim()) missing.push("Date");
    if (!String(doctorName).trim()) missing.push("Physician");
    if (!String(licenseNo).trim()) missing.push("License No.");

    const cleaned = payload.items;
    if (cleaned.length === 0) {
      missing.push("At least one medicine row (Name, Directions, Quantity)");
    } else {
      const badRows = [];
      cleaned.forEach((r, idx) => {
        const problems = [];
        if (!r.name) problems.push("Name");
        if (!r.sig) problems.push("Directions");
        if (!r.qty) problems.push("Quantity");
        else if (!/^\d+$/.test(r.qty) || Number(r.qty) <= 0)
          problems.push("Quantity must be a positive number");
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

  // Call from button (not form submit) to avoid double-submit.
  const submit = (e) => {
    if (e) e.preventDefault();
    if (!validateBeforeSave()) return;

    onSavePdf(payload);

    // Guard against duplicate print dialogs (after cancel/save)
    if (printingRef.current) return;
    printingRef.current = true;

    const finish = () => {
      printingRef.current = false;
      window.removeEventListener("afterprint", finish);
    };
    window.addEventListener("afterprint", finish);

    window.print();
  };

  return (
    <div className="rx-wrap">
      {/* ---------- SCREEN ENTRY (hidden on print) ---------- */}
      <div className="screen-only">
        <div className="rx-toolbar">
          <h1 className="rx-toolbar__title">Prescription</h1>
          <div className="rx-toolbar__actions">
            <button type="button" onClick={onBack} className="btn btn--light">
              Back
            </button>
            <button type="button" onClick={submit} className="btn btn--primary">
              Save as PDF
            </button>
          </div>
        </div>

        <div className="rx-card">
          <div className="rx-card__inner">
            <div className="rx-heading">
              <div className="rx-heading__clinic">Caybiga Health Center</div>
              <div className="rx-heading__form">PRESCRIPTION FORM</div>
            </div>

            {/* Using a form for layout only; no onSubmit */}
            <form id="rx-form" className="rx-form" autoComplete="off">
              {/* Patient row (all read-only) */}
              <section className="grid-3">
                <Field label="Patient Name">
                  <input
                    className="input input--ro"
                    readOnly
                    value={fullName(active)}
                    tabIndex={-1}
                  />
                </Field>
                <Field label="Sex">
                  <input
                    className="input input--ro"
                    readOnly
                    value={sexDisplay(active?.sex) || ""}
                    tabIndex={-1}
                  />
                </Field>
                <Field label="Age">
                  <input
                    className="input input--ro"
                    readOnly
                    value={computeAge() || ""} tabIndex={-1}
                  />
                </Field>
              </section>

              {/* Meta row (Date is read-only now) */}
              <section className="grid-3">
                <Field label="Date">
                  <input className="input input--ro" readOnly value={date} tabIndex={-1} />
                </Field>
                <Field label="Physician" required>
                  <input
                    className="input"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    required
                  />
                </Field>
                <Field label="License No." required>
                  <input
                    className="input"
                    value={licenseNo}
                    onChange={(e) => setLicenseNo(e.target.value)}
                    required
                  />
                </Field>
              </section>

              {/* Signature capture */}
              <section className="sig-block">
                <div className="sig-actions">
                  <button
                    type="button"
                    onClick={() => setSigOpen(true)}
                    className="btn btn--outline"
                  >
                    {doctorSignaturePng ? "Retake Signature" : "Capture Signature"}
                  </button>

                  {doctorSignaturePng && (
                    <div className="sig-preview">
                      <img
                        src={doctorSignaturePng}
                        alt="Physician Signature"
                        className="sig-img"
                      />
                      <button
                        type="button"
                        onClick={() => setDoctorSignaturePng("")}
                        className="btn btn--outline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="muted small mt-1">
                  Signature will print above the “Signature” line.
                </div>
              </section>

              {/* Medicines section — FREE TEXT ONLY */}
              <section className="meds">
                <div className="meds__title">Medicines to prescribe</div>

                {items.map((row, i) => (
                  <div key={i} className="med-row">
                    <Field label="Medicine name">
                      <input
                        className="input"
                        placeholder="Type medicine name"
                        value={row.name}
                        onChange={(e) => setItem(i, { name: e.target.value })}
                      />
                    </Field>

                    <Field label="Quantity">
                      <input
                        className="input"
                        value={row.qty}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) =>
                          setItem(i, { qty: e.target.value.replace(/\D+/g, "") })
                        }
                      />
                    </Field>

                    <Field label="Directions of use">
                      <input
                        className="input"
                        placeholder="e.g., 1 tab BID x 7 days"
                        value={row.sig}
                        onChange={(e) => setItem(i, { sig: e.target.value })}
                      />
                    </Field>

                    <div className="med-row__end">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="link link--danger"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRow} className="link">
                  + Add another medicine
                </button>
              </section>
            </form>
          </div>
        </div>
      </div>

      {/* ---------- PRINT SHEET (shown only on print/PDF) ---------- */}
      <div id="rx-print" className="print-only">
        <RxPrintSheet payload={payload} />
      </div>

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
    <div className="field" data-span={span}>
      <label className="field__label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  );
}

function LabeledLine({ label, value, className = "" }) {
  return (
    <div className={`line-row ${className}`}>
      <span className="line-row__label">{label}</span>
      <div className="line-row__line">{value || ""}</div>
    </div>
  );
}

/* Print/PDF sheet */
function RxPrintSheet({ payload }) {
  const p = payload || {};
  const items = p.items || [];
  const rows = Array.from({ length: Math.max(items.length, 5) });

  return (
    <div className="rx-print-sheet">
      <div className="rx-print-card">
        <div className="rx-print-head">
          <div className="rx-print-clinic">Caybiga Health Center</div>
          <div className="rx-print-sub">PRESCRIPTION FORM</div>
        </div>

        <div className="rx-print-div" />

        <div className="rx-print-grid">
          <div className="rx-print-col rx-print-col--wide">
            <LabeledLine label="Name:" value={p.patient?.name} />
          </div>
          <div className="rx-print-col">
            <LabeledLine label="Age:" value={p.patient?.age} />
          </div>
          <div className="rx-print-col">
            <LabeledLine label="Date:" value={p.date} />
          </div>
          <div className="rx-print-col rx-print-col--wide">
            <LabeledLine label="Sex:" value={p.patient?.sex} />
          </div>
        </div>

        <div className="rx-symbol">℞</div>

        <div className="rx-print-items">
          {rows.map((_, i) => {
            const row = items[i] || {};
            return (
              <div key={i} className="rx-print-itemrow">
                <div className="rx-print-itemrow__left">
                  <div className="rx-print-itemrow__top">
                    <div className="rx-print-index">{i + 1}.</div>
                    <div className="rx-print-line">{row.name || ""}</div>
                  </div>
                  <div className="rx-print-itemrow__sig">
                    <span className="rx-print-siglabel">Sig:</span>
                    <span className="rx-print-line rx-print-line--wide">
                      {row.sig || ""}
                    </span>
                  </div>
                </div>
                <div className="rx-print-itemrow__qty">
                  <div className="rx-print-qtylabel">#</div>
                  <div className="rx-print-qty">{row.qty || ""}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rx-print-footer">
          <div />
          <div className="rx-print-signblock">
            {p.signature_png ? (
              <div className="rx-print-signimgwrap">
                <img
                  src={p.signature_png}
                  alt="Physician Signature"
                  className="rx-print-signimg"
                />
              </div>
            ) : null}
            <div className="rx-print-signline" />
            <div className="rx-print-sigcaption">Signature</div>

            <div className="rx-print-doc">
              <div className="rx-print-docname">
                Physician: {p.doctor_name || "_____________________________"}
              </div>
              <div className="rx-print-doclic">
                License No.: {p.license_no || "_________________"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
