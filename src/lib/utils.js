// src/lib/utils.js

// Detects plain YYYY-MM-DD
const isPlainDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** Format to MM/DD/YYYY for display (safe for YYYY-MM-DD and timestamps) */
export const fmtDate = (s) => {
  if (!s) return "—";
  const str = String(s);

  // If it's already YYYY-MM-DD, format without constructing a Date (avoids TZ shift)
  if (isPlainDate(str)) {
    const [y, m, d] = str.split("-");
    return `${m}/${d}/${y}`;
  }

  // Fallback for ISO/timestamp
  const d = new Date(str);
  if (isNaN(d)) return str;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
};

export const fullName = (p = {}) =>
  [p.first_name, p.middle_name, p.surname].filter(Boolean).join(" ");

// Normalize to safe filename
export const cleanForFile = (s) =>
  String(s || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.-]/g, "");

export const makeReferralFilename = (patient, dateStr) => {
  const name = cleanForFile(fullName(patient)) || "patient";
  const fam = cleanForFile(patient?.family_number) || "fam";
  const dt = (dateStr || fmtDate(new Date())).replace(/\//g, "-");
  return `REFERRAL_${fam}_${name}_${dt}.pdf`;
};

/** Return YYYY-MM-DD (no time). Safe for Date, ISO, or already YYYY-MM-DD */
export const dateOnly = (d) => {
  if (!d) return "";
  const s = String(d);

  if (isPlainDate(s)) return s; // already safe

  // If ISO, try to split on 'T'
  if (s.includes("T")) {
    const [yyyyMMdd] = s.split("T");
    if (isPlainDate(yyyyMMdd)) return yyyyMMdd;
  }

  // Fallback: construct Date, but format using local parts
  try {
    const dt = new Date(s);
    if (isNaN(dt)) return s;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d2 = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d2}`;
  } catch {
    return String(d);
  }
};

/** Pretty variant → MM/DD/YYYY */
export const datePretty = (d) => {
  const s = dateOnly(d);
  if (!s) return "";
  const [y, m, da] = s.split("-");
  return `${m}/${da}/${y}`;
};
