// src/components/LabRequestForm.jsx
import React, { useEffect, useState } from "react";
import { fullName } from "../lib/utils";
import SignatureDialog from "./signaturePad/SignatureDialog";
import "./LabRequestForm.css"; // <-- external CSS (no Tailwind)

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
    doctorSignaturePng: "", // drawn signature PNG
  });

  // modal open/close
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
    <div className="lr-wrap">
      {/* Toolbar */}
      <div className="lr-toolbar">
        <div className="lr-toolbar__title">Laboratory Request Form</div>
        <div className="lr-toolbar__actions">
          <button onClick={onBack} className="btn btn--light">Back</button>
          <button onClick={onSave} className="btn btn--primary">Save as PDF</button>
        </div>
      </div>

      {/* Screen form */}
      <div className="screen-only">
        <div className="lr-form">
          <div className="grid-two">
            {/* READ-ONLY fetched fields */}
            <Field label="Patient’s Name">
              <ReadOnlyInput value={form.patientName} />
            </Field>
            <Field label="Date">
              <ReadOnlyInput value={form.date} />
            </Field>
            <Field label="Age">
              <ReadOnlyInput value={form.age} />
            </Field>
            <Field label="Gender">
              <ReadOnlyInput value={form.gender} />
            </Field>
          </div>

          <h3 className="lr-title">LABORATORY REQUEST FORM</h3>

          <div className="grid-two gap-wide">
            <TestColumn tests={LEFT_TESTS} isChecked={isChecked} toggle={toggleTest} />
            <TestColumn tests={RIGHT_TESTS} isChecked={isChecked} toggle={toggleTest} />
          </div>

          <div className="grid-two">
            <Field label="Others">
              <input
                className="input"
                value={form.others}
                onChange={(e) => set("others", e.target.value)}
              />
            </Field>
            <div />
          </div>

          <div className="grid-two">
            <Field label="Physician (MD)">
              <input
                className="input"
                value={form.doctorName}
                onChange={(e) => set("doctorName", e.target.value)}
              />
            </Field>
            <div />

            {/* --- Signature capture UI (below Physician field) --- */}
            <div className="sig-capture">
              <div className="sig-caption-screen">
                Capture physician’s handwritten signature (prints above MD label)
              </div>

              <div className="sig-actions">
                <button type="button" onClick={() => setSigOpen(true)} className="btn btn--outline">
                  {form.doctorSignaturePng ? "Retake Signature" : "Capture Signature"}
                </button>

                {form.doctorSignaturePng && (
                  <div className="sig-preview">
                    <img
                      src={form.doctorSignaturePng}
                      alt="Physician Signature"
                      className="sig-img"
                    />
                    <button
                      type="button"
                      onClick={() => set("doctorSignaturePng", "")}
                      className="btn btn--outline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Field label="Lic. No.">
              <input
                className="input"
                value={form.licNo}
                onChange={(e) => set("licNo", e.target.value)}
              />
            </Field>
            <Field label="PTR No.">
              <input
                className="input"
                value={form.ptrNo}
                onChange={(e) => set("ptrNo", e.target.value)}
              />
            </Field>
            <Field label="S2 No.">
              <input
                className="input"
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

            <div className="lr-title-print">LABORATORY REQUEST FORM</div>

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
                {v(form.doctorSignaturePng) ? (
                  <div className="sig-print-imgwrap">
                    <img
                      src={form.doctorSignaturePng}
                      alt="Physician Signature"
                      className="sig-print-img"
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

      {/* Signature modal lives outside the screen/print sections */}
      <SignatureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        initialValue={form.doctorSignaturePng}
        onDone={(png) => set("doctorSignaturePng", png)}
        title="Physician Signature"
        heightClass="h-56" /* (kept prop name; dialog handles it) */
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <div className="field__label">{label}</div>
      {children}
    </label>
  );
}

function ReadOnlyInput({ value }) {
  return (
    <div className="readonly" tabIndex={-1} aria-readonly="true">
      {value || ""}
    </div>
  );
}

function TestColumn({ tests, isChecked, toggle }) {
  return (
    <div>
      {tests.map((t) => (
        <label key={t} className="checkline">
          <input type="checkbox" className="checkline__box" checked={isChecked(t)} onChange={() => toggle(t)} />
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
