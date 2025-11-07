// src/components/MedCertForm.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import SignatureDialog from "./signaturePad/SignatureDialog"; // ← NEW
import "./MedCertForm.css"; // ← external CSS (no Tailwind)

export default function MedCertForm({ active, onBack, onSavePdf }) {
  const today = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()}`;
  };

  const patientName = () =>
    [active?.first_name, active?.middle_name, active?.surname].filter(Boolean).join(" ");

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

  // Prefill from Supabase auth/profile
  const [prefillDocName, setPrefillDocName] = useState("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) return;

        const { data: prof } = await supabase
          .from("profiles")
          .select("firstname,surname,full_name")
          .eq("id", uid)
          .single();

        const dn =
          prof?.full_name || `${prof?.firstname ?? ""} ${prof?.surname ?? ""}`.trim();
        if (mounted && dn) setPrefillDocName(dn);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const [form, setForm] = useState({
    // fetched + read-only
    date: today(),
    name: patientName(),
    age: ageDisplayFromBirthdate(active?.birthdate, active?.age),
    sex: sexDisplay(active?.sex),

    // editable (consultedOn is now manual)
    consultedOn: "",
    address: "",
    consultVerb: "was examined",
    reasonFor: "",
    assessment: "",
    recommendation: "",

    // doctor
    doctorName: "",
    licenseNo: "",
    doctorSignaturePng: "", // ← NEW: drawn signature
  });

  // modal state (NEW)
  const [sigOpen, setSigOpen] = useState(false);

  // refresh patient basics when switching queue rows
  useEffect(() => {
    setForm((s) => ({
      ...s,
      date: s.date || today(), // read-only
      name: patientName() || s.name,
      age: ageDisplayFromBirthdate(active?.birthdate, active?.age) || s.age || "",
      sex: sexDisplay(active?.sex) || s.sex || "",
      // consultedOn stays as the user typed; no auto-fill
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.record_id, active?.birthdate, active?.age, active?.sex]);

  // apply doctor prefill once it arrives (don’t overwrite if user already typed)
  useEffect(() => {
    if (prefillDocName) {
      setForm((s) => ({ ...s, doctorName: s.doctorName || prefillDocName }));
    }
  }, [prefillDocName]);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const v = (x) => (x && String(x).trim()) || "";

  /* ------------------------ Required fields validation ------------------------ */
  const validateBeforeSave = () => {
    const missing = [];
    if (!v(form.date)) missing.push("Date");
    if (!v(form.name)) missing.push("Patient Name");
    if (!v(form.age)) missing.push("Age");
    if (!v(form.sex)) missing.push("Sex");
    if (!v(form.consultedOn)) missing.push("Consulted/Examined/Treated/Confined on (date)");
    if (!v(form.reasonFor)) missing.push("For (reason/diagnosis)");
    if (!v(form.assessment)) missing.push("Assessment/Impression");
    if (!v(form.recommendation)) missing.push("Recommendation/s");
    if (!v(form.doctorName)) missing.push("Physician Name");
    if (!v(form.licenseNo)) missing.push("License No.");
    // If you want the drawn signature mandatory, uncomment:
    // if (!v(form.doctorSignaturePng)) missing.push("Physician Signature (drawn)");

    if (missing.length) {
      alert(
        "Please complete the following before saving as PDF:\n\n• " +
          missing.join("\n• ")
      );
      return false;
    }
    return true;
  };

  const handleSaveClick = () => {
    if (!validateBeforeSave()) return;
    onSavePdf(form); // includes doctorSignaturePng now
  };

  return (
    <div className="mc-wrap">
      {/* Toolbar (hidden on print) */}
      <div className="mc-toolbar">
        <div className="mc-toolbar__title">Medical Certificate</div>
        <div className="mc-toolbar__actions">
          <button onClick={onBack} className="btn btn--light">Back</button>
          <button onClick={handleSaveClick} className="btn btn--primary">Save as PDF</button>
        </div>
      </div>

      {/* Screen form */}
      <div className="screen-only">
        <div className="mc-form">
          <HeaderPreview />

          {/* Fetched, read-only fields */}
          <div className="grid-two">
            <L label="Date">
              <ReadOnlyInput value={form.date} />
            </L>
            <div />
          </div>

          <L label="Patient Name">
            <ReadOnlyInput value={form.name} />
          </L>

          <div className="grid-three">
            <L label="Age">
              <ReadOnlyInput value={form.age} />
            </L>
            <L label="Sex">
              <ReadOnlyInput value={form.sex} />
            </L>
            <L label="Address">
              <input
                className="input"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </L>
          </div>

          <div className="grid-three">
            <L label="Consult phrase">
              <select
                className="input"
                value={form.consultVerb}
                onChange={(e) => set("consultVerb", e.target.value)}
              >
                <option>was consulted</option>
                <option>was examined</option>
                <option>treated</option>
                <option>confined</option>
              </select>
            </L>

            {/* Consulted date — now manual input */}
            <L label="Consulted/Examined/Treated/Confined on (date)">
              <input
                className="input"
                placeholder="MM/DD/YYYY"
                value={form.consultedOn}
                onChange={(e) => set("consultedOn", e.target.value)}
              />
            </L>

            <L label="For (reason/diagnosis)">
              <input
                className="input"
                value={form.reasonFor}
                onChange={(e) => set("reasonFor", e.target.value)}
              />
            </L>
          </div>

          <L label="Assessment/Impression">
            <textarea
              className="textarea"
              value={form.assessment}
              onChange={(e) => set("assessment", e.target.value)}
            />
          </L>

          <L label="Recommendation/s">
            <textarea
              className="textarea"
              value={form.recommendation}
              onChange={(e) => set("recommendation", e.target.value)}
            />
          </L>

          <div className="grid-two">
            <L label="Physician Name (manual)">
              <input
                className="input"
                value={form.doctorName}
                onChange={(e) => set("doctorName", e.target.value)}
              />
              {/* --- Signature capture lives directly under Physician Name --- */}
              <div className="sig-capture">
                <div className="sig-caption-screen">
                  Capture physician’s handwritten signature (prints above the name)
                </div>
                <div className="sig-actions">
                  <button
                    type="button"
                    onClick={() => setSigOpen(true)}
                    className="btn btn--outline"
                  >
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
            </L>

            <L label="License No.">
              <input
                className="input"
                value={form.licenseNo}
                onChange={(e) => set("licenseNo", e.target.value)}
              />
            </L>
          </div>
        </div>
      </div>

      {/* Print layout */}
      <div id="print-medcert" className="print-only">
        <div className="mc-sheet">
          <div className="mc-top-border" />
          <div className="mc-header">
            <div className="mc-clinic">Phase 8 Bagong Silang Health Center</div>
            <div className="mc-sub">Phase 8 Bagong Silang Caloocan City</div>
            
          </div>

          <div className="mc-date">
            <b>Date:</b> <span className="line sm">{v(form.date)}</span>
          </div>
          <div className="mc-title">MEDICAL CERTIFICATE</div>

          <div className="mc-body">
            <div className="mc-par">To whom it may concern:</div>

            <div className="mc-par">
              This is to certify that <span className="line">{v(form.name)}</span>,
              <span className="line xs">{v(form.age)}</span> years old,
              <span className="line sm">{v(form.sex)}</span> (sex), presently residing at
              <span className="line lg">{v(form.address)}</span>
              <span className="nowrap"> {form.consultVerb}</span> on
              <span className="line sm">{v(form.consultedOn)}</span> for
              <span className="line lg">{v(form.reasonFor)}</span>.
            </div>

            <div className="mc-section">
              <div className="label">Assessment/Impression:</div>
              <div className="multiline">{v(form.assessment) || "\u00a0"}</div>
            </div>

            <div className="mc-section">
              <div className="label">Recommendation/s:</div>
              <div className="multiline tall">{v(form.recommendation) || "\u00a0"}</div>
            </div>

            <div className="mc-par center small">
              This certificate is being issued upon the request of the above mentioned name for
              whatever purposes it may serve, excluding legal matters.
            </div>

            <div className="mc-sign">
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
              <div className="sig-caption">
                License No. <span className="line xs">{v(form.licenseNo)}</span>
              </div>
            </div>
          </div>

          <div className="mc-bottom-border" />
        </div>
      </div>

      {/* Signature modal */}
      <SignatureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        initialValue={form.doctorSignaturePng}
        onDone={(png) => set("doctorSignaturePng", png)}
        title="Physician Signature"
        heightClass="h-56" /* keep prop; the dialog handles it internally */
      />
    </div>
  );
}

function HeaderPreview() {
  return (
    <div className="mc-headerpreview">
      <div className="mc-headerpreview__title">Caybiga Health Center</div>
      <div className="mc-headerpreview__sub">1 General Luis St., Caybiga Caloocan City</div>
      <div className="mc-headerpreview__sub">caybigastellite@gmail.com</div>
    </div>
  );
}

function L({ label, children }) {
  return (
    <label className="field">
      <div className="field__label">{label}</div>
      {children}
    </label>
  );
}

/** Read-only UI that looks like an input */
function ReadOnlyInput({ value }) {
  return (
    <div className="readonly" tabIndex={-1} aria-readonly="true">
      {value || ""}
    </div>
  );
}
