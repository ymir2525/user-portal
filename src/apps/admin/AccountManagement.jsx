// src/apps/admin/AccountManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./AccountManagement.css"; // external CSS (no Tailwind)

const ORANGE = "#e9772e";

/* -------- NEW helpers (role normalization + pretty name) -------- */
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

      /* ------- CHANGED: normalize role & keep only the 3 roles ------- */
      const rows = (data || []).map((u) => ({
        ...u,
        role: normalizeRole(u.role),
      }));
      setPeople(rows.filter((u) => ROLE_SET.has(u.role)));
    };

    load();

    const ch = supabase
      .channel("profiles_realtime_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        load
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  // No scroll locking for inline form
  useEffect(() => {}, [showNew]);

  /* keep your original fullname function (not used for rendering anymore, but not deleted) */
  const fullname = (u) =>
    [u.firstname, u.middle_initial ? `${u.middle_initial}.` : "", u.surname]
      .filter(Boolean)
      .join(" ");

  /* ------- CHANGED: find by normalized role ------- */
  const docInCharge =
    people.find((u) => u.role === "DOCTOR" || u.role === "Doctor") || null;
  const nurseInCharge =
    people.find((u) => u.role === "NURSE" || u.role === "Nurse") || null;

  const term = q.trim().toLowerCase();
  /* ------- CHANGED: filter BHW via normalized role + search pretty name ------- */
  const bhws = useMemo(() => {
    const list = people.filter((u) => u.role === "BHW" || u.role === "bhw");
    if (!term) return list;
    return list.filter((u) => fullNamePretty(u).toLowerCase().includes(term));
  }, [people, term]);

  return (
    <section className="am-section">
      <div className="am-toolbar">
        <h3 className="am-title" style={{ color: ORANGE }}>
          Account Management
        </h3>
        <button
          className="btn btn--outline btn--sm"
          onClick={() => setShowNew(true)}
        >
          + Add New Account
        </button>
      </div>

      {/* Search */}
      <div className="am-search">
        <div className="am-search__wrap">
          <input
            className="input input--search"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <svg
            className="am-search__icon"
            xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
              d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.3 6.3a7.5 7.5 0 0 0 10.35 10.35Z" />
          </svg>
        </div>
      </div>

      {/* Doctor-in-Charge */}
      <RowLabel>Doctor-in-Charge</RowLabel>
      <div className="am-row">
        {docInCharge ? (
          /* ------- CHANGED: pretty formatting ------- */
          fullNamePretty(docInCharge)
        ) : (
          <span className="muted">No doctor assigned.</span>
        )}
      </div>

      {/* Nurse-in-Charge */}
      <RowLabel>Nurse-in-Charge</RowLabel>
      <div className="am-row">
        {nurseInCharge ? (
          /* ------- CHANGED: pretty formatting ------- */
          fullNamePretty(nurseInCharge)
        ) : (
          <span className="muted">No nurse assigned.</span>
        )}
      </div>

      {/* Barangay Health Workers */}
      <div className="am-subtitle" style={{ color: ORANGE }}>
        Barangay Health Workers
      </div>

      <div className="am-bhwbox">
        {bhws.length ? (
          <ul className="am-bhwlist">
            {bhws.map((u) => (
              <li key={u.id} className="am-bhwitem">
                <span className="am-bhwname">
                  {/* ------- CHANGED: pretty formatting ------- */}
                  {fullNamePretty(u)}
                </span>
                <GreenToggle defaultChecked />
              </li>
            ))}
          </ul>
        ) : (
          <div className="am-empty">None</div>
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

function RowLabel({ children }) {
  return <div className="am-rowlabel">{children}</div>;
}

function GreenToggle({ defaultChecked = true, onChange }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        className="sr-only"
        defaultChecked={defaultChecked}
        onChange={onChange}
      />
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
    </label>
  );
}

/* ---------------- New Account Modal ---------------- */

function NewAccountModal({ onClose, onSaved }) {
  // Make sure these exist BEFORE any render logic uses them
  const [confirmPasswordLocal, setConfirmPasswordLocal] = useState("");
  const inputBase = "input";

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
    "password","password1","password123","passw0rd",
    "12345678","123456789","qwerty","abc123","iloveyou","admin","welcome","letmein"
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

    // Allow Admin here too (edge func also allows Admin)
    if (!["Doctor", "Nurse", "BHW", "Admin"].includes(role))
      return flashLocal("Role must be Doctor, Nurse, BHW, or Admin.", "error");

    try {
      setBusy(true);

      // Call ONLY the edge function – it creates the auth user AND writes to profiles.
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
        // Surface the real error coming from the Edge Function
        const msg =
          (typeof error.context === "string" && error.context) ||
          (error.context && (error.context.error || error.context.message)) ||
          error.message ||
          "Failed to create user.";
        return flashLocal(msg, "error");
      }

      if (!data?.ok) {
        return flashLocal("Unexpected response from server.", "error");
      }

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
    <div className="modal-overlay">
      <div className="modal">
        <button onClick={onClose} className="modal__close" aria-label="Close">✕</button>
        <div className="modal__head">
          <h4 className="modal__title" style={{ color: ORANGE }}>Create Account</h4>
          <div className="modal__subtitle">Please fill in your details</div>
        </div>

        <form onSubmit={createUser} className="modal__form" autoComplete="off">

          {/* Full Name block (stacked) */}
          <div className="name-stack">
            <div className="stack-label">Full Name</div>

            <div className="stack-field">
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

            <div className="stack-field">
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

            <div className="stack-field">
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
            <p className="help">only @gmail.com • max 20 chars</p>
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
            <p className="help">letters & numbers, allow . _ - (not at start/end)</p>
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
              <div className="pwd-meter">
                <div className="pwd-meter__bar">
                  <div
                    className={`pwd-meter__fill s${pwdScore}`}
                    style={{ width: ["10%","25%","50%","75%","100%"][pwdScore] }}
                  />
                </div>
                <div className="pwd-meter__label">
                  Strength: <span className="bold">{["Very weak","Weak","Fair","Good","Strong"][pwdScore]}</span>
                </div>
              </div>
            )}
            <ul className="pwd-issues">
              {pwdIssues.map((m, i) => <li key={i}>• {m}</li>)}
            </ul>
            <p className="help">8–15 chars, include A–Z, a–z, 0–9, and one of ! @ # $ % ^ & *.</p>
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

          <button disabled={busy} className="btn btn--orange">
            {busy ? "Saving..." : "Submit"}
          </button>

          {toast && (
            <div className={`toast ${
              toast.type === "error"
                ? "toast--error"
                : toast.type === "success"
                ? "toast--success"
                : "toast--info"
            }`}>
              {toast.msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

/* small helpers */
function LabeledInput({ label, children }) {
  return (
    <div className="labeled">
      <label className="labeled__label">{label}</label>
      {children}
    </div>
  );
}
function ErrorText({ text }) {
  return <p className="error-text">{text}</p>;
}
