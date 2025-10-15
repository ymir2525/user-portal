// src/components/ReferralForm.jsx
import React, { useEffect, useState } from "react";
import { FormArea, FormField } from "./inputs";
import SignatureDialog from "./signaturePad/SignatureDialog"; // ← NEW

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
    <div className="bg-white border rounded p-4 print:p-0">
      <div className="flex items-center justify-between mb-3 print:hidden">
        <div className="text-lg font-semibold">Referral Form</div>
        <div className="space-x-2">
          <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">
            Back
          </button>
          <button
            onClick={handleSavePdf}
            className="px-3 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-sm"
          >
            Save as PDF
          </button>
        </div>
      </div>

      {/* Screen form */}
      <div className="screen-only">
        <div className="max-w-3xl mx-auto border p-6">
          <div className="text-center font-semibold mb-4">
            <div>Caybiga Health Center</div>
            <div>REFERRAL FORM</div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* Read-only fetched fields */}
            <div>
              <ReadOnlyField label="Date" value={form.date} />
              {isMissing("Date") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <FormField label="Receiving Hospital" value={form.receivingHospital} onChange={(v) => set("receivingHospital", v)} />
              {isMissing("Receiving Hospital") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <ReadOnlyField label="Name of Patient" value={form.patientName} />
              {isMissing("Name of Patient") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <ReadOnlyField label="Age/Sex" value={form.ageSex} />
              {isMissing("Age/Sex") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <FormField label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
              {isMissing("Nationality") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
          </div>

          <div className="mt-4 text-sm grid grid-cols-4 gap-3">
            <div>
              <FormField label="BP" value={form.vs_bp} onChange={(v) => set("vs_bp", v)} />
              {isMissing("BP") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <FormField label="PR" value={form.vs_pr} onChange={(v) => set("vs_pr", v)} />
              {isMissing("PR") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <FormField label="RR" value={form.vs_rr} onChange={(v) => set("vs_rr", v)} />
              {isMissing("RR") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
            <div>
              <FormField label="Temp" value={form.vs_temp} onChange={(v) => set("vs_temp", v)} />
              {isMissing("Temp") && <div className="text-xs text-red-600 mt-1">Required</div>}
            </div>
          </div>

          <div>
            <FormArea label="Pertinent History" value={form.history} onChange={(v) => set("history", v)} />
            {isMissing("Pertinent History") && <div className="text-xs text-red-600 mt-1">Required</div>}
          </div>
          <div>
            <FormArea label="Physical Exam" value={form.pe} onChange={(v) => set("pe", v)} />
            {isMissing("Physical Exam") && <div className="text-xs text-red-600 mt-1">Required</div>}
          </div>
          <div>
            <FormArea label="Impression/Diagnosis" value={form.impression} onChange={(v) => set("impression", v)} />
            {isMissing("Impression/Diagnosis") && <div className="text-xs text-red-600 mt-1">Required</div>}
          </div>
          <div>
            <FormArea label="Medications Given" value={form.medsGiven} onChange={(v) => set("medsGiven", v)} />
            {isMissing("Medications Given") && <div className="text-xs text-red-600 mt-1">Required</div>}
          </div>
          <div>
            <FormArea label="Reason for Referral" value={form.reason} onChange={(v) => set("reason", v)} />
            {isMissing("Reason for Referral") && <div className="text-xs text-red-600 mt-1">Required</div>}
          </div>

          {/* Printed name (kept) + capture signature (new) */}
          <div className="mt-6 text-sm space-y-2">
            <FormField
              label="Signature over Printed Name of Referring Physician (Printed Name)"
              value={form.doctorSignature}
              onChange={(v) => set("doctorSignature", v)}
            />
            {isMissing("Physician Signature/Name") && (
              <div className="text-xs text-red-600 mt-1">Required</div>
            )}

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

            {/* If you made the drawn signature required */}
            {isMissing("Physician Drawn Signature") && !form.doctorSignaturePng && (
              <div className="text-xs text-red-600">Signature is required</div>
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
        <div className="print-sheet">
          <div className="print-header">
            <div className="print-title">Caybiga Health Center</div>
            <div className="print-sub">1 General Luis St., Caybiga Caloocan City</div>
            <div className="print-sub">caybigastaff@gmail.com</div>
            <div className="print-form-name">REFERRAL FORM</div>
          </div>

          <div className="print-row">
            <div className="print-col"><b>Date:</b> <span className="line">{v(form.date)}</span></div>
            <div className="print-col"><b>Receiving Hospital:</b> <span className="line">{v(form.receivingHospital)}</span></div>
          </div>

          <div className="print-row">
            <div className="print-col" style={{ width: "100%" }}>
              <b>Name of Patient:</b> <span className="line">{v(form.patientName)}</span>
            </div>
          </div>

          <div className="print-row">
            <div className="print-col"><b>Age/Sex:</b> <span className="line">{v(form.ageSex)}</span></div>
            <div className="print-col"><b>Nationality:</b> <span className="line">{v(form.nationality)}</span></div>
          </div>

          <div className="print-row">
            <div className="print-col"><b>Vital Signs:</b> BP: <span className="line">{v(form.vs_bp)}</span></div>
            <div className="print-col">PR: <span className="line">{v(form.vs_pr)}</span></div>
            <div className="print-col">RR: <span className="line">{v(form.vs_rr)}</span></div>
            <div className="print-col">Temp: <span className="line">{v(form.vs_temp)}</span></div>
          </div>

          <div className="print-block">
            <div className="label">Pertinent History:</div>
            <div className="multiline">{v(form.history, " ")}</div>
          </div>

          <div className="print-block">
            <div className="label">Physical Exam:</div>
            <div className="multiline">{v(form.pe, " ")}</div>
          </div>

          <div className="print-block">
            <div className="label">Impression/Diagnosis:</div>
            <div className="multiline">{v(form.impression, " ")}</div>
          </div>

          <div className="print-block">
            <div className="label">Medications Given:</div>
            <div className="multiline">{v(form.medsGiven, " ")}</div>
          </div>

          <div className="print-block">
            <div className="label">Reason for Referral:</div>
            <div className="multiline">{v(form.reason, " ")}</div>
          </div>

          <div className="print-sign">
            {form.doctorSignaturePng ? (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "4px" }}>
                <img
                  src={form.doctorSignaturePng}
                  alt="Physician Signature"
                  style={{ maxHeight: "80px", maxWidth: "70%", objectFit: "contain" }}
                />
              </div>
            ) : (
              <div className="line" style={{ width: "70%" }}></div>
            )}
            <div className="caption">Signature over Printed Name of Referring Physician</div>
            <div className="name">{v(form.doctorSignature, " ")}</div>
          </div>
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        .print-sheet { font-family: Arial, sans-serif; font-size: 12px; border: 3px solid #f59e0b; padding: 16px 18px; }
        .print-header { text-align:center; margin-bottom:10px; }
        .print-title { font-weight:700; }
        .print-sub { font-size:11px; color:#444; }
        .print-form-name { margin-top:4px; font-weight:700; color:#f97316; }
        .print-row { display:flex; gap:18px; margin:8px 0; }
        .print-col { flex:1; min-width:0; }
        .line { display:inline-block; min-width:120px; border-bottom:1px solid #888; padding:0 4px; }
        .print-block { margin:12px 0; }
        .print-block .label { font-weight:600; margin-bottom:6px; }
        .multiline { min-height:40px; border-bottom:1px solid #999; padding-bottom:8px; white-space:pre-wrap; word-break:break-word; }
        .print-sign { text-align:center; margin-top:16px; }
        .print-sign .caption { font-size:11px; color:#666; margin-top:6px; }
        .print-sign .name { margin-top:4px; }
        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          header, aside { display: none !important; }
          #print-referral, #print-referral * { visibility: visible !important; }
          #print-referral { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}

/** Simple read-only display that looks like an input */
function ReadOnlyField({ label, value }) {
  return (
    <div>
      <label className="block text-xs mb-1">{label}</label>
      <div
        className="w-full h-10 border rounded px-3 bg-gray-50 text-gray-600 flex items-center"
        tabIndex={-1}
        aria-readonly="true"
      >
        <span className="truncate">{value || "—"}</span>
      </div>
    </div>
  );
}
