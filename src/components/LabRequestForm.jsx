// src/components/LabRequestForm.jsx
import React, { useEffect, useState } from "react";
import { fullName } from "../lib/utils";
import SignatureDialog from "./signaturePad/SignatureDialog"; // ← NEW

const LEFT_TESTS = [
  "CBC",
  "FBS",
  "HbA1C",
  "LIPID PROFILE",
  "ALT/SGPT",
  "AST/SGOT",
  "BLOOD URIC ACID",
  "BUN",
  "CREATININE",
  "CHOLESTEROL",
  "SODIUM",
  "POTASSIUM",
  "X-RAY",
  "ULTRASOUND",
];

const RIGHT_TESTS = [
  "PERIPHERAL BLOOD SMEAR",
  "ALKALINE PHOSPHATASE",
  "TSH",
  "T3",
  "T4",
  "HBsAg (Screening/Titer)",
  "URINALYSIS",
  "12 L - ECG",
];

/* -------------------- helpers (month rule + sex normalize) -------------------- */
function ageDisplayFromBirthdate(birthdate, fallbackAge) {
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
}

function sexDisplay(sex) {
  if (!sex) return "";
  const s = String(sex).toUpperCase();
  if (s === "MEN") return "MALE";
  if (s === "WOMEN") return "FEMALE";
  return s;
}

export default function LabRequestForm({ active, onBack, onSavePdf }) {
  const todayStr = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()}`;
  };

  const [form, setForm] = useState({
    patientName: fullName(active),
    age: ageDisplayFromBirthdate(active?.birthdate, active?.age),
    gender: sexDisplay(active?.sex),
    date: todayStr(),
    tests: {}, // { testName: true }
    others: "",
    doctorName: "",
    licNo: "",
    ptrNo: "",
    s2No: "",
    doctorSignaturePng: "", // ← NEW: drawn signature PNG
  });

  // modal open/close (NEW)
  const [sigOpen, setSigOpen] = useState(false);

  useEffect(() => {
    setForm((s) => ({
      ...s,
      patientName: fullName(active) || s.patientName,
      age: ageDisplayFromBirthdate(active?.birthdate, active?.age) || s.age,
      gender: sexDisplay(active?.sex) || s.gender,
      date: s.date || todayStr(),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.record_id, active?.birthdate, active?.age, active?.sex]);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const toggleTest = (name) =>
    setForm((s) => ({ ...s, tests: { ...s.tests, [name]: !s.tests[name] } }));

  const isChecked = (name) => !!form.tests[name];
  const v = (x) => (x && String(x).trim()) || "";

  // -------------- Validation: required fields + at least one test --------------
  const validateBeforeSave = () => {
    const missing = [];

    if (!v(form.patientName)) missing.push("Patient’s Name");
    if (!v(form.date)) missing.push("Date");
    if (!v(form.age)) missing.push("Age");
    if (!v(form.gender)) missing.push("Gender");
    if (!v(form.doctorName)) missing.push("Physician (MD)");
    if (!v(form.licNo)) missing.push("Lic. No.");
    // If you want drawn signature to be required, uncomment:
    // if (!v(form.doctorSignaturePng)) missing.push("Physician Signature (drawn)");

    const anyChecked = Object.values(form.tests || {}).some(Boolean);
    const othersFilled = !!v(form.others);
    if (!anyChecked && !othersFilled) {
      missing.push("At least one laboratory test (check a box) or fill 'Others'");
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

  const onSave = () => {
    if (!validateBeforeSave()) return;
    onSavePdf(form); // includes doctorSignaturePng now
  };

  return (
    <div className="bg-white border rounded p-4 print:p-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 print:hidden">
        <div className="text-lg font-semibold">Laboratory Request Form</div>
        <div className="space-x-2">
          <button
            onClick={onBack}
            className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm"
          >
            Back
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-sm"
          >
            Save as PDF
          </button>
        </div>
      </div>

      {/* Screen form */}
      <div className="screen-only">
        <div className="max-w-4xl mx-auto border p-6">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Patient’s Name">
              <input className="w-full border rounded px-3 py-2"
                value={form.patientName} onChange={(e)=>set("patientName", e.target.value)} />
            </Field>
            <Field label="Date">
              <input className="w-full border rounded px-3 py-2"
                value={form.date} onChange={(e)=>set("date", e.target.value)} />
            </Field>
            <Field label="Age">
              <input className="w-full border rounded px-3 py-2"
                value={form.age} onChange={(e)=>set("age", e.target.value)} />
            </Field>
            <Field label="Gender">
              <input className="w-full border rounded px-3 py-2"
                value={form.gender} onChange={(e)=>set("gender", e.target.value)} />
            </Field>
          </div>

          <h3 className="text-center font-semibold text-orange-600 my-4">
            LABORATORY REQUEST FORM
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            <TestColumn
              tests={LEFT_TESTS}
              isChecked={isChecked}
              toggle={toggleTest}
            />
            <TestColumn
              tests={RIGHT_TESTS}
              isChecked={isChecked}
              toggle={toggleTest}
            />
          </div>

          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <Field label="Others">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.others}
                onChange={(e) => set("others", e.target.value)}
              />
            </Field>
            <div />
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-3">
            <Field label="Physician (MD)">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.doctorName}
                onChange={(e) => set("doctorName", e.target.value)}
              />
            </Field>
            <div />

            {/* --- Signature capture UI (NEW, below Physician field) --- */}
            <div className="md:col-span-2">
              <div className="text-xs text-slate-600 mb-1">
                Capture physician’s handwritten signature (prints above MD label)
              </div>
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => setSigOpen(true)}
                  className="rounded-md border px-3 py-1 hover:bg-slate-50"
                >
                  {form.doctorSignaturePng ? "Retake Signature" : "Capture Signature"}
                </button>

                {form.doctorSignaturePng && (
                  <div className="flex items-center gap-3">
                    <img
                      src={form.doctorSignaturePng}
                      alt="Physician Signature"
                      className="max-h-20 border rounded bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => set("doctorSignaturePng", "")}
                      className="rounded-md border px-3 py-1 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Field label="Lic. No.">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.licNo}
                onChange={(e) => set("licNo", e.target.value)}
              />
            </Field>
            <Field label="PTR No.">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.ptrNo}
                onChange={(e) => set("ptrNo", e.target.value)}
              />
            </Field>
            <Field label="S2 No.">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.s2No}
                onChange={(e) => set("s2No", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Print layout */}
      <div id="print-labreq" className="print-only">
        <div className="lr-sheet">
          <div className="lr-box">
            <div className="lr-row">
              <span>Patient’s Name:</span> <span className="line wide">{v(form.patientName)}</span>
            </div>
            <div className="lr-row">
              <span>Age:</span> <span className="line">{v(form.age)}</span>
            </div>
            <div className="lr-row">
              <span>Gender:</span> <span className="line">{v(form.gender)}</span>
            </div>
            <div className="lr-row">
              <span>Date:</span> <span className="line">{v(form.date)}</span>
            </div>

            <div className="lr-title">LABORATORY REQUEST FORM</div>

            <div className="lr-grid">
              <div>
                {LEFT_TESTS.map((t) => (
                  <CheckLine key={t} label={t} checked={isChecked(t)} />
                ))}
                <div className="lr-row">
                  <span>OTHERS:</span> <span className="line wide">{v(form.others)}</span>
                </div>
              </div>
              <div>
                {RIGHT_TESTS.map((t) => (
                  <CheckLine key={t} label={t} checked={isChecked(t)} />
                ))}
              </div>
            </div>

            <div className="lr-sign">
              <div className="sig-right">
                {/* NEW: show signature image if available */}
                {v(form.doctorSignaturePng) ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                    <img
                      src={form.doctorSignaturePng}
                      alt="Physician Signature"
                      style={{ maxHeight: "80px", maxWidth: "70%", objectFit: "contain" }}
                    />
                  </div>
                ) : null}
                <div className="sig-name">{v(form.doctorName) || "\u00A0"}</div>
                <div className="sig-caption">MD</div>
              </div>
              <div className="sig-nums">
                <div>Lic. No.: <span className="line small">{v(form.licNo)}</span></div>
                <div>PTR No.: <span className="line small">{v(form.ptrNo)}</span></div>
                <div>S2 No.: <span className="line small">{v(form.s2No)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        .screen-only { display: block; }

        .lr-sheet { font-family: "Times New Roman", Georgia, serif; font-size: 12.5px; padding: 16px; }
        .lr-box { border: 3px solid #f59e0b; padding: 14px 16px; }
        .lr-row { margin: 6px 0; }
        .lr-title { text-align: center; font-weight: 700; color: #e76f00; margin: 10px 0 14px; }
        .lr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 50px; }

        .line { display:inline-block; border-bottom:1px solid #000; min-width:140px; margin-left:6px; }
        .line.wide { min-width: 280px; }
        .line.small { min-width: 120px; }

        .lr-check { display:flex; align-items:flex-start; gap:8px; margin: 4px 0; }
        .box { width: 11px; height: 11px; border: 1px solid #000; display:inline-block; position: relative; top: 2px; }
        .box.checked::after { content: "✕"; position:absolute; left: 0; right: 0; top:-4px; text-align:center; font-size:12px; }

        .lr-sign { display:flex; justify-content: space-between; align-items:flex-end; margin-top: 24px; }
        .sig-right { text-align: right; }
        .sig-name { display:inline-block; min-width:220px; border-top:1px solid #000; text-align:center; padding-top:3px; font-weight:700; }
        .sig-caption { text-align:center; margin-top:2px; }
        .sig-nums > div { margin: 4px 0; }

        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          header, aside { display: none !important; }
          #print-labreq, #print-labreq * { visibility: visible !important; }
          #print-labreq { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>

      {/* Signature modal lives outside the screen/print sections */}
      <SignatureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        initialValue={form.doctorSignaturePng}
        onDone={(png) => set("doctorSignaturePng", png)}
        title="Physician Signature"
        heightClass="h-56"
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold mb-1">{label}</div>
      {children}
    </label>
  );
}

function TestColumn({ tests, isChecked, toggle }) {
  return (
    <div>
      {tests.map((t) => (
        <label key={t} className="flex items-center gap-2 mb-1">
          <input type="checkbox" className="accent-orange-500" checked={isChecked(t)} onChange={() => toggle(t)} />
          <span>{t}</span>
        </label>
      ))}
    </div>
  );
}

function CheckLine({ label, checked }) {
  return (
    <div className="lr-check">
      <span className={`box ${checked ? "checked" : ""}`} />
      <span>{label}</span>
    </div>
  );
}
