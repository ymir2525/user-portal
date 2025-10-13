// src/components/MedCertForm.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function MedCertForm({ active, onBack, onSavePdf }) {
  const today = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()}`;
  };

  const patientName = () =>
    [active?.first_name, active?.middle_name, active?.surname].filter(Boolean).join(" ");

  // Prefill from Supabase auth/profile (no global `session` var)
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

        const dn = prof?.full_name || `${prof?.firstname ?? ""} ${prof?.surname ?? ""}`.trim();
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
    date: today(),
    name: patientName(),
    age: active?.age ?? "",
    sex: active?.sex ?? "",
    address: "",
    consultVerb: "was examined",
    consultedOn: "",
    reasonFor: "",
    assessment: "",
    recommendation: "",
    doctorName: "", // set after we fetch profile
    licenseNo: "",
  });

  // refresh patient basics when switching queue rows
  useEffect(() => {
    setForm((s) => ({
      ...s,
      date: s.date || today(),
      name: patientName() || s.name,
      age: active?.age ?? s.age ?? "",
      sex: active?.sex ?? s.sex ?? "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.record_id]);

  // apply doctor prefill once it arrives (don’t overwrite if user already typed)
  useEffect(() => {
    if (prefillDocName) {
      setForm((s) => ({ ...s, doctorName: s.doctorName || prefillDocName }));
    }
  }, [prefillDocName]);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const v = (x) => (x && String(x).trim()) || "";

  return (
    <div className="bg-white border rounded p-4 print:p-0">
      {/* Toolbar (hidden on print) */}
      <div className="flex items-center justify-between mb-3 print:hidden">
        <div className="text-lg font-semibold">Medical Certificate</div>
        <div className="space-x-2">
          <button
            onClick={onBack}
            className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm"
          >
            Back
          </button>
          <button
            onClick={() => onSavePdf(form)}
            className="px-3 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-sm"
          >
            Save as PDF
          </button>
        </div>
      </div>

      {/* Screen form */}
      <div className="screen-only">
        <div className="max-w-3xl mx-auto border p-6 space-y-4 text-sm">
          <HeaderPreview />

          <div className="grid md:grid-cols-2 gap-3">
            <L label="Date">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </L>
            <div />
          </div>

          <L label="Patient Name">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </L>

          <div className="grid md:grid-cols-3 gap-3">
            <L label="Age">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
              />
            </L>
            <L label="Sex">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.sex}
                onChange={(e) => set("sex", e.target.value)}
              />
            </L>
            <L label="Address">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </L>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <L label="Consult phrase">
              <select
                className="w-full border rounded px-3 py-2"
                value={form.consultVerb}
                onChange={(e) => set("consultVerb", e.target.value)}
              >
                <option>was consulted</option>
                <option>was examined</option>
                <option>treated</option>
                <option>confined</option>
              </select>
            </L>
            <L label="Consulted/Examined/Treated/Confined on (date)">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.consultedOn}
                onChange={(e) => set("consultedOn", e.target.value)}
              />
            </L>
            <L label="For (reason/diagnosis)">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.reasonFor}
                onChange={(e) => set("reasonFor", e.target.value)}
              />
            </L>
          </div>

          <L label="Assessment/Impression">
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[80px]"
              value={form.assessment}
              onChange={(e) => set("assessment", e.target.value)}
            />
          </L>

          <L label="Recommendation/s">
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[80px]"
              value={form.recommendation}
              onChange={(e) => set("recommendation", e.target.value)}
            />
          </L>

          <div className="grid md:grid-cols-2 gap-3">
            <L label="Physician Name (manual)">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.doctorName}
                onChange={(e) => set("doctorName", e.target.value)}
              />
            </L>
            <L label="License No.">
              <input
                className="w-full border rounded px-3 py-2"
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
            <div className="mc-clinic">Caybiga Health Center</div>
            <div className="mc-sub">1 General Luis St., Caybiga Caloocan City</div>
            <div className="mc-sub">caybigastellite@gmail.com</div>
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
              <div className="sig-name">{v(form.doctorName) || "\u00A0"}</div>
              <div className="sig-caption">
                License No. <span className="line xs">{v(form.licenseNo)}</span>
              </div>
            </div>
          </div>

          <div className="mc-bottom-border" />
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        .screen-only { display: block; }

        .mc-sheet { font-family: "Times New Roman", Georgia, serif; font-size: 12.5px; padding: 18px 22px 14px; position: relative; }
        .mc-top-border, .mc-bottom-border { height: 4px; background: #f59e0b; width: 100%; }
        .mc-top-border { position: absolute; left: 0; top: 0; }
        .mc-bottom-border { position: absolute; left: 0; bottom: 0; }
        .mc-header { text-align: center; margin-top: 6px; margin-bottom: 6px; }
        .mc-clinic { font-weight: 700; color: #e76f00; }
        .mc-sub { color: #333; font-size: 11.5px; line-height: 1.1; }
        .mc-date { text-align: right; margin-top: 8px; margin-bottom: 6px; }
        .mc-title { text-align: center; font-weight: 700; margin: 10px 0 12px; }
        .mc-body { margin-top: 4px; }
        .mc-par { margin: 10px 0; line-height: 1.6; }
        .mc-par.center { text-align: center; }
        .mc-par.small { font-size: 11.5px; }
        .label { font-weight: 700; margin: 6px 0 4px; }

        /* Multiline ruled blocks that display text */
        .multiline {
          min-height: 46px;
          padding: 6px 2px 10px;
          white-space: pre-wrap;
          word-break: break-word;
          background:
            repeating-linear-gradient(
              to bottom,
              transparent 0px,
              transparent 16px,
              #000 16px,
              #000 17px
            );
        }
        .multiline.tall { min-height: 70px; }

        .line { display: inline-block; border-bottom: 1px solid #000; min-width: 140px; margin: 0 6px 2px 6px; }
        .line.lg { min-width: 220px; }
        .line.sm { min-width: 110px; }
        .line.xs { min-width: 60px; }
        .nowrap { white-space: nowrap; }
        .mc-sign { margin-top: 24px; text-align: right; }
        .sig-name { display: inline-block; border-top: 1px solid #000; padding-top: 3px; min-width: 260px; text-align: center; font-weight: 700; }
        .sig-caption { margin-top: 6px; }

        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          header, aside { display: none !important; }
          #print-medcert, #print-medcert * { visibility: visible !important; }
          #print-medcert { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}

function HeaderPreview() {
  return (
    <div className="text-center">
      <div className="font-bold text-orange-600">Caybiga Health Center</div>
      <div className="text-xs">1 General Luis St., Caybiga Caloocan City</div>
      <div className="text-xs">caybigastellite@gmail.com</div>
    </div>
  );
}

function L({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold mb-1">{label}</div>
      {children}
    </label>
  );
}
