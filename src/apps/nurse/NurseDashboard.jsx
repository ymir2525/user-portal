// src/apps/nurse/NurseDashboard.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function NurseDashboard() {
  const nav = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    nav("/login", { replace: true, state: { msg: "You have been logged out." } });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fde6d3", padding: 24 }}>
      <div style={{
        maxWidth: 960, margin: "0 auto", background: "#fff", borderRadius: 16,
        border: "1px solid #f3b184", padding: 24, boxShadow: "0 2px 6px rgba(0,0,0,.06)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ color: "#e9772e", margin: 0 }}>Nurse Dashboard</h1>
          <button
            onClick={logout}
            className="btn"
            style={{
              background: "#e9772e", color: "#fff", padding: "8px 14px",
              borderRadius: 8, border: "none", cursor: "pointer"
            }}
          >
            Log out
          </button>
        </div>

        <div style={{ marginTop: 16, color: "#7a3b12" }}>
          <p>Welcome! This is a sample Nurse UI. Put nurse tools here.</p>
          <ul>
            <li>Patients assigned today</li>
            <li>Vital recording queue</li>
            <li>Messages from doctor</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
