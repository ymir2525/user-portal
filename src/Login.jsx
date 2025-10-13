// src/Login.jsx
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

      // 1) Resolve username -> email via secure RPC
      const { data: email, error: rpcErr } = await supabase.rpc(
        "resolve_username_email",
        { p_username: uname }
      );
      if (rpcErr) throw rpcErr;
      if (!email) throw new Error("Username not found.");

      // 2) Sign in with email + password
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authErr) throw authErr;

      // 3) Fetch role and route
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
            <input
              className="w-full border rounded px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
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
