// src/apps/BhwDashboard.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./BHWDashboard.css";

import PatientRecords from "./bhw/PatientRecords";
import BhwQueueList from "./bhw/BhwQueueList";
import { useNavigate } from "react-router-dom";
import "./BHWDashboard.css";

export default function BhwDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState("Queuing Table"); // default tab = Queue
  const [loadingRole, setLoadingRole] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  // role guard
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.user?.id) { nav("/login", { replace: true }); return; }

      const { data: prof, error } = await supabase
        .from("profiles").select("role").eq("id", session.user.id).single();

      if (!mounted) return;
      if (error || !prof || String(prof.role).toUpperCase() !== "BHW") {
        await supabase.auth.signOut().catch(()=>{});
        nav("/login", { replace: true }); return;
      }
      setLoadingRole(false);
    })();
    return () => { mounted = false; };
  }, [nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    nav("/login", { replace: true });
  };

  if (loadingRole) return null;

  const tabs = ["Queuing Table", "Patient Records"];

  return (
    <div className="app app--bhw">
      <header className="app-header">
        <div className="brand">Phase 8 Health Center</div>
        <button onClick={logout} className="btn btn--link btn--logout">Log Out</button>
      </header>

      <aside className="sidebar">
        <nav className="sidebar-nav">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`tab-btn ${tab === item ? "tab-btn--active" : ""}`}
            >
              {item}
              {item === "Queuing Table" && (
                <span style={{
                  float: "right",
                  fontSize: 12,
                  background: "#fff",
                  color: "#0d3554",
                  borderRadius: 12,
                  padding: "2px 8px",
                  marginLeft: 6
                }}>
                  {queueCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {tab === "Queuing Table" && (
          <BhwQueueList onCountChange={setQueueCount} />
        )}
       
        {tab === "Patient Records" && <PatientRecords />}
      </main>
    </div>
  );
}
