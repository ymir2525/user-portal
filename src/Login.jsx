// src/Login.jsx
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false); // NEW
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const nav = useNavigate();
  const location = useLocation();

  const onLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const uname = username.trim();
      if (!uname) throw new Error("Enter your username.");
      const { data: email, error: rpcErr } = await supabase.rpc(
        "resolve_username_email",
        { p_username: uname }
      );
      if (rpcErr) throw rpcErr;
      if (!email) throw new Error("Username not found.");

      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authErr) throw authErr;

      const userId = data.user?.id;
      const { data: prof, error: roleErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (roleErr || !prof?.role) {
        nav("/", { replace: true });
        return;
      }

      const role = String(prof.role).toUpperCase();
      if (role === "BHW") nav("/bhw");
      else if (role === "DOCTOR") nav("/doctor");
      else nav("/", { replace: true });
    } catch (e) {
      setMsg(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const banner = location.state?.msg || msg;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-8">
        <h1 className="text-2xl font-semibold mb-6 text-center">User Login</h1>

        {banner && (
          <div className="mb-4 text-sm bg-amber-50 text-amber-800 p-2 rounded">
            {banner}
          </div>
        )}

        <form onSubmit={onLogin} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm mb-1">Username</label>
            <input
              className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2 pr-10"
                type={showPwd ? "text" : "password"}   // 👈 toggles type
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                aria-describedby="pwdesc"
              />
              <button
                type="button"                          // 👈 avoid form submit
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? "Hide password" : "Show password"}
                aria-pressed={showPwd}
                className="absolute inset-y-0 right-0 px-3 flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black rounded-r"
                title={showPwd ? "Hide password" : "Show password"}
              >
                {/* Simple eye / eye-off SVG (no external deps) */}
                {showPwd ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeWidth="2" d="M3 3l18 18M10.58 10.58A3 3 0 0012 15a3 3 0 001.42-5.66M9.88 5.1A9.77 9.77 0 0112 5c5.52 0 10 4.48 10 7-0.41 0.94-1.01 1.87-1.78 2.72M6.12 6.12C4.19 7.37 2.83 9.02 2 12c0 2.52 4.48 7 10 7 1.19 0 2.33-.19 3.38-.55" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeWidth="2" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
            <p id="pwdesc" className="sr-only">
              Press the button to show or hide the password.
            </p>
          </div>

          <button
            disabled={busy}
            className="w-full bg-black text-white rounded py-2 disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
