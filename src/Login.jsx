// src/Login.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

const roleToPath = (r) =>
  r === "Admin"  ? "/admin"  :
  r === "Doctor" ? "/doctor" :
  r === "Nurse"  ? "/nurse"  :
  r === "BHW"    ? "/bhw"    : "/";

/* Lightweight modal kept in this file */
function Modal({ open, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export default function Login({ embed = false, title = "User Login" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState("");
  const [open, setOpen]         = useState(false); // modal state for landing view
  const nav = useNavigate();
  const location = useLocation();

  // If already logged in, route to role path
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted || !session) return;

      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        const path = roleToPath(String(prof?.role || ""));
        nav(path, { replace: true });
      } catch {
        nav("/", { replace: true });
      }
    })();
    return () => { mounted = false; };
  }, [nav]);

  const onLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const uname = (username || "").trim();
      const pw = password || "";
      if (!uname) throw new Error("Enter your username.");
      if (!pw)    throw new Error("Enter your password.");

      const { data: email, error: rpcErr } = await supabase.rpc(
        "resolve_username_email",
        { p_username: uname }
      );
      if (rpcErr) throw new Error("Could not resolve username.");
      if (!email) throw new Error("Username not found.");

      const { data: signed, error: authErr } =
        await supabase.auth.signInWithPassword({ email, password: pw });
      if (authErr) {
        const m = String(authErr.message || "").toLowerCase();
        if (m.includes("invalid login credentials"))
          throw new Error("Wrong username or password.");
        throw authErr;
      }

      const userId = signed.user?.id;
      if (!userId) throw new Error("No user session.");
      const { data: prof, error: roleErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (roleErr || !prof?.role) throw new Error("No role found. Contact admin.");

      nav(roleToPath(String(prof.role)), { replace: true });
    } catch (e) {
      setMsg(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const banner = location.state?.msg || msg;

  // ---- Shared form (used in modal or embedded) ----
  const Form = (
    <div className="w-full max-w-md bg-white rounded-2xl shadow border border-[#f3b184] p-8">
      <h1 className="text-2xl font-semibold mb-6 text-center text-[#e9772e]">
        {title}
      </h1>

      {banner && (
        <div className="mb-4 text-sm bg-[#fde6d3] text-[#7a3b12] p-2 rounded border border-[#f3b184]">
          {banner}
        </div>
      )}

      <form onSubmit={onLogin} className="space-y-4" autoComplete="off">
        <div>
          <label className="block text-sm mb-1">Username</label>
          <input
            className="w-full border rounded px-3 py-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Password</label>
          <div className="relative">
            <input
              className="w-full border rounded px-3 py-2 pr-10 border-black focus:outline-none focus:ring-2 focus:ring-black"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              aria-describedby="pwdesc"
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              aria-label={showPwd ? "Hide password" : "Show password"}
              aria-pressed={showPwd}
              className="absolute inset-y-0 right-0 px-3 flex items-center focus:outline-none focus:ring-2 focus:ring-black rounded-r"
              title={showPwd ? "Hide password" : "Show password"}
            >
              {showPwd ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeWidth="2" d="M3 3l18 18M10.58 10.58A3 3 0 0012 15a3 3 0 001.42-5.66M9.88 5.1A9.77 9.77 0 0112 5c5.52 0 10 4.48 10 7-0.41.94-1.01 1.87-1.78 2.72M6.12 6.12C4.19 7.37 2.83 9.02 2 12c0 2.52 4.48 7 10 7 1.19 0 2.33-.19 3.38-.55"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeWidth="2" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/>
                  <circle cx="12" cy="12" r="3" strokeWidth="2" />
                </svg>
              )}
            </button>
          </div>
          <p id="pwdesc" className="sr-only">Press the button to show or hide the password.</p>
        </div>

        <button
          disabled={busy}
          className="w-full bg-[#e9772e] hover:bg-[#d66d2b] text-white rounded py-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#f3b184]"
        >
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );

  // If used in other places (e.g., a modal elsewhere), keep embed mode
  if (embed) return Form;

  // ---- Landing page + modal login (all here) ----
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1e6aa0] to-[#0c2b46]">
      {/* Banner */}
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8">
        <div className="bg-[#e9772e] rounded-[48px] text-white px-6 py-6 flex items-center gap-4 shadow-lg">
          <div className="w-16 h-16 rounded-full bg-white/90 shrink-0 grid place-items-center overflow-hidden">
            <img
              src="/assets/seal.png"
              alt="Health Center Seal"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <div className="flex-1">
            <div className="text-xl sm:text-2xl font-semibold">
              Bagong Silang Phase&nbsp;8 Health Center
            </div>
            <div className="text-sm opacity-90">
              Patient Record and Medicine Inventory Management
            </div>
          </div>
        </div>
      </div>

      {/* Center login button */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="w-full flex justify-center -mt-3 mb-8">
          <button
            onClick={() => setOpen(true)}
            className="bg-[#e9772e] text-white text-sm font-semibold px-6 py-2 rounded-full shadow-md hover:shadow-lg active:scale-[0.98] transition"
          >
            LOG IN
          </button>
        </div>
      </div>

      {/* Info section */}
      <div className="max-w-5xl mx-auto bg-white rounded-t-[28px] px-6 py-10 shadow-[0_-10px_30px_rgba(0,0,0,0.15)]">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 grid place-items-center text-xl">📄</div>
            <div>
              <div className="font-semibold text-[#0c2b46]">
                Patient Record Management Accessibility
              </div>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
                nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 grid place-items-center text-xl">💊</div>
            <div>
              <div className="font-semibold text-[#0c2b46]">
                Medicine Inventory Easy Manageability
              </div>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
                nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal with the same form */}
      <Modal open={open} onClose={() => setOpen(false)}>
        <Login embed title="Bagong Silang Phase 8 Health Center" />
      </Modal>
    </div>
  );
}
