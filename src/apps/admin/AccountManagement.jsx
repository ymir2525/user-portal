// src/apps/admin/AccountManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const ORANGE = "#e9772e";

/* helpers */
const normalizeRole = (r) => String(r ?? "").trim().toUpperCase();
const ROLE_SET = new Set(["DOCTOR", "NURSE", "BHW"]);
const toTitle = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, g1) => g1.toUpperCase());
const fullNamePretty = (u) =>
  [toTitle(u?.firstname), u?.middle_initial ? `${String(u.middle_initial).toUpperCase()}.` : "", toTitle(u?.surname)]
    .filter(Boolean)
    .join(" ");

export default function AccountManagement() {
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, surname, firstname, middle_initial, role")
        .order("surname", { ascending: true });

      if (!mounted) return;
      if (error) {
        console.error("[profiles load error]", error?.message, error);
        setPeople([]);
        return;
      }
      const rows = (data || []).map((u) => ({ ...u, role: normalizeRole(u.role) }));
      setPeople(rows.filter((u) => ROLE_SET.has(u.role)));
    };

    load();
    const ch = supabase
      .channel("profiles_realtime_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const fullname = (u) =>
    [u.firstname, u.middle_initial ? `${u.middle_initial}.` : "", u.surname].filter(Boolean).join(" ");

  const docInCharge = people.find((u) => u.role === "DOCTOR") || null;
  const nurseInCharge = people.find((u) => u.role === "NURSE") || null;

  const term = q.trim().toLowerCase();
  const bhws = useMemo(() => {
    const list = people.filter((u) => u.role === "BHW");
    if (!term) return list;
    return list.filter((u) => fullNamePretty(u).toLowerCase().includes(term));
  }, [people, term]);

  return (
    <section className="p-4">
      {/* Toolbar */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold" style={{ color: ORANGE }}>
          Account Management
        </h3>
        <button
          className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={() => setShowNew(true)}
        >
          + Add New Account
        </button>
      </div>

      {/* Search */}
      <div className="mb-2">
        <div className="relative">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm outline-none"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <svg
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
            xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
              d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.3 6.3a7.5 7.5 0 0 0 10.35 10.35Z" />
          </svg>
        </div>
      </div>

      {/* Doctor-in-Charge */}
      <div className="mb-1 text-xs text-slate-600">Doctor-in-Charge</div>
      <div className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
        {docInCharge ? fullNamePretty(docInCharge) : <span className="text-slate-500">No doctor assigned.</span>}
      </div>

      {/* Nurse-in-Charge */}
      <div className="mt-2 mb-1 text-xs text-slate-600">Nurse-in-Charge</div>
      <div className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
        {nurseInCharge ? fullNamePretty(nurseInCharge) : <span className="text-slate-500">No nurse assigned.</span>}
      </div>

      {/* BHWs */}
      <div className="mt-3 text-xs font-semibold" style={{ color: ORANGE }}>
        Barangay Health Workers
      </div>

      <div className="mt-1 rounded-md border border-slate-300 bg-white">
        {bhws.length ? (
          <ul className="divide-y divide-slate-200">
            {bhws.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
                <span className="truncate">{fullNamePretty(u)}</span>
                <GreenToggle defaultChecked />
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-2 py-10 text-center text-slate-500">None</div>
        )}
      </div>

      {showNew && (
        <NewAccountModal
          onClose={() => setShowNew(false)}
          onSaved={() => setShowNew(false)}
        />
      )}
    </section>
  );
}

function GreenToggle({ defaultChecked = true, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        className="sr-only"
        defaultChecked={defaultChecked}
        onChange={onChange}
      />
      <span className="relative block h-6 w-10 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500">
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

/* -------------------- New Account Modal (Tailwind) -------------------- */

/* -------------------- New Account Modal (Tailwind) -------------------- */
function NewAccountModal({ onClose, onSaved }) {
  const [confirmPasswordLocal, setConfirmPasswordLocal] = useState("");
  const inputBase =
    "w-full h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500";

  const [surname, setSurname] = useState("");
  const [firstname, setFirstname] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [role, setRole] = useState("BHW");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [errors, setErrors] = useState({
    surname: "",
    firstname: "",
    middleInitial: "",
    email: "",
    username: "",
  });
  const [usernameChecking, setUsernameChecking] = useState(false);
  const usernameTimerRef = useRef(null);

  const flashLocal = (msg, type = "info", ms = 3500) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), ms);
  };

  /* validation functions */
  const validateSurname = (v) =>
    !v ? "" : v.length < 3 ? "minimum is 3 letters" : v.length > 20 ? "maximum length is 20 letters only" : "";
  const validateFirstname = (v) => {
    const lettersOnly = (v || "").replace(/\s/g, "");
    return !lettersOnly
      ? ""
      : lettersOnly.length < 3
      ? "minimum is 3 letters"
      : lettersOnly.length > 20
      ? "maximum length is 20 letters only"
      : "";
  };
  const validateMI = (v) => (!v ? "" : v.length > 1 ? "must be 1 letter only" : "");
  const validateEmail = (raw) => {
    const v = (raw || "").toLowerCase();
    if (!v) return "";
    if (v.length < 6) return "minimum is 6 characters";
    if (v.length > 20) return "maximum length is 20 characters only";
    if ((v.match(/@/g) || []).length !== 1) return "must contain exactly one '@'";
    const at = v.indexOf("@");
    const local = v.slice(0, at);
    const domain = v.slice(at + 1);
    if (!local || !domain) return "must have text before and after '@'";
    if (domain !== "gmail.com") return "only @gmail.com is allowed";
    if (!/^[a-z0-9._-]+$/.test(local)) return "use only letters, numbers, and . _ - before '@'";
    if (/^\.|\.$/.test(local)) return "local part cannot start/end with a dot";
    if (/\.\./.test(local)) return "no consecutive dots";
    return "";
  };

  const OFFENSIVE = ["ass", "sex", "fuck", "bitch", "shit"];
  const basicUsernameIssues = (u) => {
    const v = (u || "").toLowerCase();
    if (!v) return "";
    if (/\s/.test(v)) return "no spaces allowed";
    if (v.length < 5) return "minimum is 5 characters";
    if (v.length > 10) return "maximum length is 10 characters only";
    if (!/^[a-z]/.test(v)) return "must start with a letter";
    if (!/^[a-z0-9._-]+$/.test(v)) return "use only letters, numbers, and . _ -";
    if (!/[a-z]/.test(v)) return "cannot be all numbers";
    if (/\.\.|__|--/.test(v)) return "no consecutive special characters";
    if (/^[^a-z0-9]|[^a-z0-9]$/.test(v)) return "cannot start or end with . _ -";
    if (/(.)\1{2,}/.test(v)) return "too many repeating characters";
    if (OFFENSIVE.some((w) => v.includes(w))) return "username contains blocked word";
    return "";
  };

  const checkUsernameUnique = async (val) => {
    setUsernameChecking(true);
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .ilike("username", val);
    setUsernameChecking(false);
    if (error) return "could not verify availability";
    return count && count > 0 ? "username is already taken" : "";
  };

  const onSurnameChange = (e) => {
    let v = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
    if (v.length > 21) v = v.slice(0, 21);
    setSurname(v);
    setErrors((s) => ({ ...s, surname: validateSurname(v) }));
  };
  const onFirstnameChange = (e) => {
    let v = e.target.value.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s{2,}/g, " ");
    if (v.length > 21) v = v.slice(0, 21);
    setFirstname(v);
    setErrors((s) => ({ ...s, firstname: validateFirstname(v) }));
  };
  const onMIChange = (e) => {
    let v = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
    if (v.length > 1) v = v.slice(0, 1);
    setMiddleInitial(v);
    setErrors((s) => ({ ...s, middleInitial: validateMI(v) }));
  };
  const onEmailChange = (e) => {
    let v = e.target.value.toLowerCase();
    if (v.length > 21) v = v.slice(0, 21);
    setEmail(v);
    setErrors((s) => ({ ...s, email: validateEmail(v) }));
  };
  const onUsernameChange = (e) => {
    let v = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    setUsername(v);
    const localErr = basicUsernameIssues(v);
    setErrors((s) => ({ ...s, username: localErr }));
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    if (!localErr && v.length >= 5 && v.length <= 10) {
      usernameTimerRef.current = setTimeout(async () => {
        const uniqErr = await checkUsernameUnique(v);
        setErrors((s) => ({ ...s, username: uniqErr }));
      }, 350);
    }
  };

  const COMMON_PASSWORDS = new Set([
    "password", "password1", "password123", "passw0rd",
    "12345678", "123456789", "qwerty", "abc123", "iloveyou", "admin", "welcome", "letmein"
  ]);
  const validatePassword = (pw) => {
    const issues = [];
    if (!pw) return issues;
    if (pw.length < 8) issues.push("minimum is 8 characters");
    if (pw.length > 15) issues.push("maximum is 15 characters");
    if (!/[A-Z]/.test(pw)) issues.push("add at least one uppercase letter (A–Z)");
    if (!/[a-z]/.test(pw)) issues.push("add at least one lowercase letter (a–z)");
    if (!/[0-9]/.test(pw)) issues.push("add at least one number (0–9)");
    if (!/[!@#$%^&*]/.test(pw)) issues.push("add at least one special: ! @ # $ % ^ & *");
    if (/^\s/.test(pw) || /\s$/.test(pw)) issues.push("no spaces at the start or end");
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) issues.push("this password is too common");
    return issues;
  };
  const confirmPasswordIssue = (pw, confirm) => (confirm && pw !== confirm ? "Passwords do not match" : "");
  const passwordScore = (pw) => {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s += 1;
    if (pw.length >= 12) s += 1;
    if (/[A-Z]/.test(pw)) s += 1;
    if (/[a-z]/.test(pw)) s += 1;
    if (/[0-9]/.test(pw)) s += 1;
    if (/[!@#$%^&*]/.test(pw)) s += 1;
    if (/^\s/.test(pw) || /\s$/.test(pw)) s = Math.max(s - 1, 0);
    return Math.min(s, 4);
  };

  const [pwdIssues, setPwdIssues] = useState([]);
  const [pwdScore, setPwdScore] = useState(0);
  const [confirmIssue, setConfirmIssue] = useState("");

  const createUser = async (e) => {
    e.preventDefault();

    const sErr = validateSurname(surname);
    const fErr = validateFirstname(firstname);
    const mErr = validateMI(middleInitial);
    const eErr = validateEmail(email);
    setErrors({ surname: sErr, firstname: fErr, middleInitial: mErr, email: eErr });

    if (!surname.trim() || !firstname.trim())
      return flashLocal("Surname and First name are required.", "error");
    if (sErr || fErr || mErr) return flashLocal("Please fix the red notes above first.", "error");
    if (!email.trim()) return flashLocal("Email is required.", "error");
    if (eErr) return flashLocal(eErr, "error");

    if (!username.trim()) return flashLocal("Username is required.", "error");
    const uErrLocal = basicUsernameIssues(username);
    if (uErrLocal) return flashLocal(uErrLocal, "error");
    const uErrDb = await checkUsernameUnique(username.trim().toLowerCase());
    if (uErrDb) return flashLocal(uErrDb, "error");

    const pwIssues = validatePassword(password);
    if (pwIssues.length) {
      setPwdIssues(pwIssues);
      return flashLocal("Please fix the password notes.", "error");
    }
    if (password !== confirmPassword) {
      setConfirmIssue("Passwords do not match");
      return flashLocal("Passwords do not match.", "error");
    }

    if (!["Doctor", "Nurse", "BHW", "Admin"].includes(role))
      return flashLocal("Role must be Doctor, Nurse, BHW, or Admin.", "error");

    try {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke("mirror_user_to_auth", {
        body: {
          email: email.trim().toLowerCase(),
          password,
          username: username.trim().toLowerCase(),
          role,
          firstname: firstname.trim(),
          surname: surname.trim(),
          middle_initial: (middleInitial || "").trim() || null,
        },
      });

      if (error) {
        const msg =
          (typeof error.context === "string" && error.context) ||
          (error.context && (error.context.error || error.context.message)) ||
          error.message ||
          "Failed to create user.";
        return flashLocal(msg, "error");
      }

      if (!data?.ok) return flashLocal("Unexpected response from server.", "error");

      flashLocal("User created successfully.", "success");
      onSaved?.();
    } catch (err) {
      console.error(err);
      const msg = (typeof err?.message === "string" && err.message) || "Failed to create user.";
      if (/unique|duplicate/i.test(msg)) return flashLocal("Email or Username already exists.", "error");
      flashLocal(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-lg sm:w-full sm:max-w-[90%] sm:p-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h4 className="text-lg font-semibold" style={{ color: ORANGE }}>
              Create Account
            </h4>
            <p className="text-xs text-slate-500">Please fill in your details</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={createUser} className="px-5 py-4" autoComplete="off">
          {/* Full Name */}
          <div className="mb-3">
            <div className="mb-1 text-xs text-slate-700">Full Name</div>
            <div className="space-y-2">
              <div>
                <input
                  className={inputBase}
                  value={surname}
                  onChange={onSurnameChange}
                  required
                  maxLength={21}
                  placeholder="Last name"
                />
                <ErrorText text={errors.surname} />
              </div>
              <div>
                <input
                  className={inputBase}
                  value={firstname}
                  onChange={onFirstnameChange}
                  required
                  maxLength={21}
                  placeholder="First name"
                />
                <ErrorText text={errors.firstname} />
              </div>
              <div>
                <input
                  className={inputBase}
                  value={middleInitial}
                  onChange={onMIChange}
                  maxLength={1}
                  placeholder="M.I."
                />
                <ErrorText text={errors.middleInitial} />
              </div>
            </div>
          </div>

          {/* Email */}
          <LabeledInput label="Email">
            <input
              className={inputBase}
              type="email"
              value={email}
              onChange={onEmailChange}
              required
              maxLength={21}
              placeholder="e.g., user@gmail.com"
            />
            <ErrorText text={errors.email} />
            <p className="mt-1 text-xs text-slate-500">only @gmail.com • max 20 chars</p>
          </LabeledInput>

          {/* Username */}
          <LabeledInput label="Username">
            <input
              className={inputBase}
              value={username}
              onChange={onUsernameChange}
              required
              maxLength={11}
              placeholder="5–10 chars, letters first"
            />
            <ErrorText text={errors.username || (usernameChecking ? "checking availability..." : "")} />
            <p className="mt-1 text-xs text-slate-500">letters & numbers, allow . _ - (not at start/end)</p>
          </LabeledInput>

          {/* Password */}
          <LabeledInput label="Password">
            <input
              className={inputBase}
              type="password"
              value={password}
              maxLength={30}
              onChange={(e) => {
                const raw = e.target.value.slice(0, 30);
                setPassword(raw);
                setPwdIssues(validatePassword(raw));
                setPwdScore(passwordScore(raw));
                if (confirmPasswordLocal)
                  setConfirmIssue(confirmPasswordIssue(raw, confirmPasswordLocal));
              }}
            />

            {password.length > 0 && (
              <div className="mt-1">
                <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
                  <div
                    className={`h-2 transition-all ${["bg-red-400","bg-orange-400","bg-yellow-400","bg-lime-500","bg-emerald-500"][pwdScore]}`}
                    style={{ width: ["10%","25%","50%","75%","100%"][pwdScore] }}
                  />
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  Strength: <span className="font-semibold">{["Very weak","Weak","Fair","Good","Strong"][pwdScore]}</span>
                </div>
              </div>
            )}

            <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
              {pwdIssues.map((m, i) => <li key={i}> {m}</li>)}
            </ul>
            <p className="mt-1 text-xs text-slate-500">8–15 chars, include A–Z, a–z, 0–9, and one of ! @ # $ % ^ & *.</p>
          </LabeledInput>

          {/* Confirm Password */}
          <LabeledInput label="Confirm Password">
            <input
              className={inputBase}
              type="password"
              value={confirmPasswordLocal}
              maxLength={30}
              onChange={(e) => {
                const raw = e.target.value.slice(0, 30);
                setConfirmPasswordLocal(raw);
                setConfirmPassword(raw);
                setConfirmIssue(confirmPasswordIssue(password, raw));
              }}
            />
            <ErrorText text={confirmIssue} />
          </LabeledInput>

          {/* Role */}
          <LabeledInput label="Register As">
            <select className={inputBase} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="BHW">BHW</option>
              <option value="Nurse">Nurse</option>
              <option value="Doctor">Doctor</option>
              <option value="Admin">Admin</option>
            </select>
          </LabeledInput>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Discard
            </button>
            <button
              disabled={busy}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {busy ? "Saving..." : "Submit"}
            </button>
          </div>

          {toast && (
            <div
              className={[ 
                "mt-3 rounded-md border px-3 py-2 text-sm", 
                toast.type === "error" 
                  ? "border-red-200 bg-red-50 text-red-700" 
                  : toast.type === "success" 
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700" 
                  : "border-slate-200 bg-slate-50 text-slate-700", 
              ].join(" ")}
            >
              {toast.msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

/* tiny subcomponents */
function LabeledInput({ label, children }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function ErrorText({ text }) {
  return <p className="mt-1 min-h-[1rem] text-xs text-red-700">{text}</p>;
}
