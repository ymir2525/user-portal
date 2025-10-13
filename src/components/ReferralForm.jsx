// src/components/ReferralForm.jsx
import React, { useEffect, useState } from "react";
import { FormArea, FormField } from "./inputs";

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}
const fullName = (p) => [p?.first_name, p?.middle_name, p?.surname].filter(Boolean).join(" ");
const ageSex = (p) => `${p?.age ?? "—"}/${p?.sex ?? "—"}`;

export default function ReferralForm({ active, onBack, onSavePdf }) {
  const [form, setForm] = useState({
    date: todayStr(),
    receivingHospital: "",
    patientName: fullName(active),
    ageSex: ageSex(active),
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
    doctorSignature: "",
  });

  useEffect(() => {
    setForm((s) => ({
      ...s,
      date: s.date || todayStr(),
      patientName: fullName(active) || s.patientName,
      ageSex: ageSex(active) || s.ageSex,
    }));
  }, [active?.id]);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const v = (x, fallback = "—") => (x && String(x).trim()) || fallback;

  return (
    <div className="bg-white border rounded p-4 print:p-0">
      <div className="flex items-center justify-between mb-3 print:hidden">
        <div className="text-lg font-semibold">Referral Form</div>
        <div className="space-x-2">
          <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">
            Back
          </button>
          <button onClick={() => onSavePdf(form)} className="px-3 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-sm">
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
            <FormField label="Date" value={form.date} onChange={(v) => set("date", v)} />
            <FormField label="Receiving Hospital" value={form.receivingHospital} onChange={(v) => set("receivingHospital", v)} />
            <FormField label="Name of Patient" value={form.patientName} onChange={(v) => set("patientName", v)} />
            <FormField label="Age/Sex" value={form.ageSex} onChange={(v) => set("ageSex", v)} />
            <FormField label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
          </div>

          <div className="mt-4 text-sm grid grid-cols-4 gap-3">
            <FormField label="BP" value={form.vs_bp} onChange={(v) => set("vs_bp", v)} />
            <FormField label="PR" value={form.vs_pr} onChange={(v) => set("vs_pr", v)} />
            <FormField label="RR" value={form.vs_rr} onChange={(v) => set("vs_rr", v)} />
            <FormField label="Temp" value={form.vs_temp} onChange={(v) => set("vs_temp", v)} />
          </div>

          <FormArea label="Pertinent History" value={form.history} onChange={(v) => set("history", v)} />
          <FormArea label="Physical Exam" value={form.pe} onChange={(v) => set("pe", v)} />
          <FormArea label="Impression/Diagnosis" value={form.impression} onChange={(v) => set("impression", v)} />
          <FormArea label="Medications Given" value={form.medsGiven} onChange={(v) => set("medsGiven", v)} />
          <FormArea label="Reason for Referral" value={form.reason} onChange={(v) => set("reason", v)} />

          <div className="mt-6 text-sm">
            <FormField label="Signature over Printed Name of Referring Physician" value={form.doctorSignature} onChange={(v) => set("doctorSignature", v)} />
          </div>
        </div>
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
            <div className="line" style={{ width: "70%" }}></div>
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
