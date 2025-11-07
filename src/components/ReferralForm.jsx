// src/components/ReferralForm.jsx
import React, { useEffect, useState } from "react";
import { FormArea, FormField } from "./inputs";
import SignatureDialog from "./signaturePad/SignatureDialog"; // ← NEW
import "./ReferralForm.css"; // ← external CSS (no Tailwind)

// --- helpers ---
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}
const fullName = (p) => [p?.first_name, p?.middle_name, p?.surname].filter(Boolean).join(" ");

// show months when < 12 months, else show whole years (fallbacks to stored age)
function ageDisplayFromBirthdate(birthdate, fallbackAge) {
  if (!birthdate) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);
  const bd = new Date(birthdate);
  if (isNaN(bd)) return (fallbackAge ?? "") === "" ? "—" : String(fallbackAge);

  const now = new Date();
  let months = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
  if (now.getDate() < bd.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years}`;
}
function sexDisplay(sex) {
  if (!sex) return "—";
  const s = String(sex).toUpperCase();
  if (s === "MEN") return "MALE";
  if (s === "WOMEN") return "FEMALE";
  return s;
}
const ageSexFromPatient = (p) =>
  `${ageDisplayFromBirthdate(p?.birthdate, p?.age)} / ${sexDisplay(p?.sex)}`;

export default function ReferralForm({ active, onBack, onSavePdf }) {
  const [form, setForm] = useState({
    date: todayStr(),
    receivingHospital: "",
    patientName: fullName(active),
    ageSex: ageSexFromPatient(active),
    nationality: "",
    vs_bp: "",
    vs_pr: "",
    vs_rr: "",
    vs_temp: "",
    history: "",
    pe: "",
    impression: "",
    medsGiven: "",
    reason: "",
    doctorSignature: "",     // printed name (kept)
    doctorSignaturePng: "",  // drawn signature (PNG data URL)
  });

  // track missing fields after validation (for small inline hints)
  const [missing, setMissing] = useState([]);
  const [sigOpen, setSigOpen] = useState(false);

  // keep fetched values in sync (still read-only in UI)
  useEffect(() => {
    setForm((s) => ({
      ...s,
      date: s.date || todayStr(),
      patientName: fullName(active) || s.patientName,
      ageSex: ageSexFromPatient(active) || s.ageSex,
    }));
  }, [active?.id, active?.birthdate, active?.age, active?.sex]);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const v = (x, fallback = "—") => (x && String(x).trim()) || fallback;

  // ---------- Validation ----------
  const REQUIRED_FIELDS = [
    ["date", "Date"],
    ["receivingHospital", "Receiving Hospital"],
    ["patientName", "Name of Patient"],
    ["ageSex", "Age/Sex"],
    ["nationality", "Nationality"],
    ["vs_bp", "BP"],
    ["vs_pr", "PR"],
    ["vs_rr", "RR"],
    ["vs_temp", "Temp"],
    ["history", "Pertinent History"],
    ["pe", "Physical Exam"],
    ["impression", "Impression/Diagnosis"],
    ["medsGiven", "Medications Given"],
    ["reason", "Reason for Referral"],
    ["doctorSignature", "Physician Signature/Name"],
    // To require drawn signature too, add:
    // ["doctorSignaturePng", "Physician Drawn Signature"],
  ];

  const validateBeforeSave = () => {
    const blanks = REQUIRED_FIELDS
      .filter(([key]) => !String(form[key] ?? "").trim())
      .map(([, label]) => label);

    setMissing(blanks);

    if (blanks.length) {
      const msg =
        "Please fill all required fields before saving:\n\n• " +
        blanks.join("\n• ");
      alert(msg);
      return false;
    }
    return true;
  };

  const handleSavePdf = () => {
    if (!validateBeforeSave()) return;
    onSavePdf(form);
  };

  const isMissing = (label) => missing.includes(label);

  return (
    <div className="rf-wrap">
      {/* Toolbar */}
      <div className="rf-toolbar print-hide">
        <div className="rf-toolbar__title">Referral Form</div>
        <div className="rf-toolbar__actions">
          <button onClick={onBack} className="btn btn--light">Back</button>
          <button onClick={handleSavePdf} className="btn btn--primary">Save as PDF</button>
        </div>
      </div>

      {/* Screen form */}
      <div className="screen-only">
        <div className="rf-form">
          <div className="rf-title">
            <div>Caybiga Health Center</div>
            <div>REFERRAL FORM</div>
          </div>

          <div className="grid-two">
            {/* Read-only fetched fields */}
            <div>
              <ReadOnlyField label="Date" value={form.date} />
              {isMissing("Date") && <div className="error-text">Required</div>}
            </div>
            <div>
              <FormField label="Receiving Hospital" value={form.receivingHospital} onChange={(v) => set("receivingHospital", v)} />
              {isMissing("Receiving Hospital") && <div className="error-text">Required</div>}
            </div>
            <div>
              <ReadOnlyField label="Name of Patient" value={form.patientName} />
              {isMissing("Name of Patient") && <div className="error-text">Required</div>}
            </div>
            <div>
              <ReadOnlyField label="Age/Sex" value={form.ageSex} />
              {isMissing("Age/Sex") && <div className="error-text">Required</div>}
            </div>
            <div>
              <FormField label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
              {isMissing("Nationality") && <div className="error-text">Required</div>}
            </div>
          </div>

          <div className="grid-four">
            <div>
              <FormField label="BP" value={form.vs_bp} onChange={(v) => set("vs_bp", v)} />
              {isMissing("BP") && <div className="error-text">Required</div>}
            </div>
            <div>
              <FormField label="PR" value={form.vs_pr} onChange={(v) => set("vs_pr", v)} />
              {isMissing("PR") && <div className="error-text">Required</div>}
            </div>
            <div>
              <FormField label="RR" value={form.vs_rr} onChange={(v) => set("vs_rr", v)} />
              {isMissing("RR") && <div className="error-text">Required</div>}
            </div>
            <div>
              <FormField label="Temp" value={form.vs_temp} onChange={(v) => set("vs_temp", v)} />
              {isMissing("Temp") && <div className="error-text">Required</div>}
            </div>
          </div>

          <div>
            <FormArea label="Pertinent History" value={form.history} onChange={(v) => set("history", v)} />
            {isMissing("Pertinent History") && <div className="error-text">Required</div>}
          </div>
          <div>
            <FormArea label="Physical Exam" value={form.pe} onChange={(v) => set("pe", v)} />
            {isMissing("Physical Exam") && <div className="error-text">Required</div>}
          </div>
          <div>
            <FormArea label="Impression/Diagnosis" value={form.impression} onChange={(v) => set("impression", v)} />
            {isMissing("Impression/Diagnosis") && <div className="error-text">Required</div>}
          </div>
          <div>
            <FormArea label="Medications Given" value={form.medsGiven} onChange={(v) => set("medsGiven", v)} />
            {isMissing("Medications Given") && <div className="error-text">Required</div>}
          </div>
          <div>
            <FormArea label="Reason for Referral" value={form.reason} onChange={(v) => set("reason", v)} />
            {isMissing("Reason for Referral") && <div className="error-text">Required</div>}
          </div>

          {/* Printed name (kept) + capture signature (new) */}
          <div className="sig-block">
            <FormField
              label="Signature over Printed Name of Referring Physician (Printed Name)"
              value={form.doctorSignature}
              onChange={(v) => set("doctorSignature", v)}
            />
            {isMissing("Physician Signature/Name") && (
              <div className="error-text">Required</div>
            )}

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

            {/* If you made the drawn signature required */}
            {isMissing("Physician Drawn Signature") && !form.doctorSignaturePng && (
              <div className="error-text">Signature is required</div>
            )}
          </div>
        </div>

        {/* Reusable Signature Dialog (modal) */}
        <SignatureDialog
          open={sigOpen}
          onClose={() => setSigOpen(false)}
          initialValue={form.doctorSignaturePng}
          onDone={(png) => set("doctorSignaturePng", png)}
          title="Physician Signature"
          heightClass="h-56"
        />
      </div>

      {/* Print-only version */}
      <div id="print-referral" className="print-only">
        <div className="ref-sheet">
          <div className="ref-header">
            <div className="ref-title">Phase 8 Bagong Silang Health Center</div>
            <div className="ref-sub">Phase 8 Bagong Silang, Caloocan City</div>
          
            <div className="ref-form-name">REFERRAL FORM</div>
          </div>

          <div className="ref-row">
            <div className="ref-col"><b>Date:</b> <span className="line">{v(form.date)}</span></div>
            <div className="ref-col"><b>Receiving Hospital:</b> <span className="line">{v(form.receivingHospital)}</span></div>
          </div>

          <div className="ref-row">
            <div className="ref-col ref-col--full">
              <b>Name of Patient:</b> <span className="line">{v(form.patientName)}</span>
            </div>
          </div>

          <div className="ref-row">
            <div className="ref-col"><b>Age/Sex:</b> <span className="line">{v(form.ageSex)}</span></div>
            <div className="ref-col"><b>Nationality:</b> <span className="line">{v(form.nationality)}</span></div>
          </div>

          <div className="ref-row">
            <div className="ref-col"><b>Vital Signs:</b> BP: <span className="line">{v(form.vs_bp)}</span></div>
            <div className="ref-col">PR: <span className="line">{v(form.vs_pr)}</span></div>
            <div className="ref-col">RR: <span className="line">{v(form.vs_rr)}</span></div>
            <div className="ref-col">Temp: <span className="line">{v(form.vs_temp)}</span></div>
          </div>

          <div className="ref-block">
            <div className="label">Pertinent History:</div>
            <div className="multiline">{v(form.history, " ")}</div>
          </div>

          <div className="ref-block">
            <div className="label">Physical Exam:</div>
            <div className="multiline">{v(form.pe, " ")}</div>
          </div>

          <div className="ref-block">
            <div className="label">Impression/Diagnosis:</div>
            <div className="multiline">{v(form.impression, " ")}</div>
          </div>

          <div className="ref-block">
            <div className="label">Medications Given:</div>
            <div className="multiline">{v(form.medsGiven, " ")}</div>
          </div>

          <div className="ref-block">
            <div className="label">Reason for Referral:</div>
            <div className="multiline">{v(form.reason, " ")}</div>
          </div>

          <div className="ref-sign">
            {form.doctorSignaturePng ? (
              <div className="ref-sign__imgwrap">
                <img
                  src={form.doctorSignaturePng}
                  alt="Physician Signature"
                  className="ref-sign__img"
                />
              </div>
            ) : (
              <div className="line line--wide"></div>
            )}
            <div className="ref-sign__caption">Signature over Printed Name of Referring Physician</div>
            <div className="ref-sign__name">{v(form.doctorSignature, " ")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Simple read-only display that looks like an input */
function ReadOnlyField({ label, value }) {
  return (
    <div className="field">
      <label className="field__label small">{label}</label>
      <div className="readonly" tabIndex={-1} aria-readonly="true">
        <span className="truncate">{value || "—"}</span>
      </div>
    </div>
  );
}
