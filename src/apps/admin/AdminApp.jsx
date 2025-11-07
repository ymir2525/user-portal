// src/apps/admin/AdminApp.jsx
import React, { useState } from "react";
import { NavLink, Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

import AccountManagement from "./AccountManagement";
import DataAnalytics from "./DataAnalytics";
import MedicineInventory from "./MedicineInventory";
import AdminDashboard from "./AdminDashboard";
import QueuingTable from "./QueuingTable";
import AdminDayHistory from "./AdminDayHistory";
import AdminPatientRecords from "./AdminPatientRecords";
import AdminChartView from "./AdminChartView";
import AdminFamily from "./AdminFamily"; // <-- NEW
import NurseQueueChartView from "../nurse/NurseQueueChartView"; // <-- reuse read-only chart

// Original palette (kept, still used for the top header + page bg)
const ORANGE   = "#e9772e";
const PEACH    = "#f3b184";
const PEACH_BG = "#fde6d3";
const PANEL_BG = "#fff7f1";

// Sidebar palette to match your screenshot
const NAVY      = "#0A2647";  // deep navy
const NAVY_DARK = "#06213d";
const ORANGE2   = "#E85D24";  // vivid orange accents

export default function AdminApp() {
  const [toast, setToast] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // NEW: sidebar collapse
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? 64 : 256; // px

  const flash = (msg, type = "info", ms = 3500) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), ms);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.replace("/login");
  };

  // Keep Day History highlighted when viewing a record ("/admin/record/:recordId")
  const loc = useLocation();
  const isDayHistoryContext =
    loc.pathname.startsWith("/admin/day-history") ||
    loc.pathname.startsWith("/admin/record/");

  // util: class for sidebar links
  const linkClass = ({ isActive }) => `link ${isActive ? "active" : ""}`;

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: PEACH_BG }}>
      <header className="w-full px-6 py-3 text-white shrink-0" style={{ backgroundColor: ORANGE }}>
        <div className="flex items-center justify-between">
          <div className="font-semibold">Phase 8 Bagong Silang Health Center — Admin</div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-60"
            aria-label="Log out"
            title="Log out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9"/>
            </svg>
            {loggingOut ? "Signing out..." : "Log Out"}
          </button>
        </div>
      </header>

      {/* Local styles just for the sidebar look/feel and the toggle */}
      <style>{`
        .sb { --navy:${NAVY}; --navyDark:${NAVY_DARK}; --orange:${ORANGE2}; }
        .sb h2.title { color:#fff; letter-spacing:.3px; }
        .sb .link {
          display:block; width:100%;
          background:#fff; color:#0f172a;
          border:2px solid var(--orange);
          border-radius:8px;
          padding:.48rem .6rem;
          font-weight:700; font-size:.88rem;
          transition:transform .12s ease, box-shadow .12s ease, background .12s ease, color .12s ease, border-color .12s ease;
          box-shadow:0 1px 0 rgba(0,0,0,.05);
          text-decoration:none;
        }
        .sb .link:hover{
          transform:translateY(-1px);
          box-shadow:0 4px 12px rgba(0,0,0,.08);
        }
        .sb .link.active{
          background:var(--orange);
          color:#fff;
          border-color:var(--orange);
        }
        .sb .nav-wrap { gap:.5rem; display:flex; flex-direction:column; }
        .sb .divider { position:absolute; right:0; top:0; bottom:0; width:3px; background:var(--orange); }
        .sb .collapse-label { color:#dbeafe; font-size:.75rem; opacity:.85; }
        .sb .toggle {
          position:absolute; top:72px;
          width:44px; height:44px; border-radius:9999px;
          background:#fff;
          border:5px solid var(--navy);
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 6px 14px rgba(0,0,0,.18);
          cursor:pointer;
          z-index:30;
        }
        .sb .toggle:active { transform:scale(.98); }
      `}</style>

      {/* Relative container so we can place the round toggle exactly at the edge */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className="sb h-full p-4 overflow-y-auto"
          style={{
            width: sidebarWidth,
            backgroundColor: NAVY,
            borderRight: `1px solid ${NAVY_DARK}`,
            transition: "width .18s ease"
          }}
        >
          <h2 className="mb-4 font-semibold title">
            {collapsed ? "Admin" : "Admin Dashboard"}
          </h2>

          {/* Links */}
          <nav className="nav-wrap">
            <NavLink to="/admin/dashboard" className={linkClass}>
              {collapsed ? "• Dashboard" : "Dashboard"}
            </NavLink>

            <NavLink to="/admin/queue" className={linkClass}>
              {collapsed ? "• Queue" : "Queuing Table"}
            </NavLink>

            <NavLink to="/admin/records" className={linkClass}>
              {collapsed ? "• Records" : "Patient Records"}
            </NavLink>

            <NavLink to="/admin/inventory" className={linkClass}>
              {collapsed ? "• Inventory" : "Medicine Inventory"}
            </NavLink>

            {/* Day History tab (custom active state) */}
            <Link to="/admin/day-history" className={`link ${isDayHistoryContext ? "active" : ""}`}>
              {collapsed ? "• Day Hist." : "Day History"}
            </Link>

            <NavLink to="/admin/analytics" className={linkClass}>
              {collapsed ? "• Analytics" : "Data Analytics"}
            </NavLink>

            <NavLink to="/admin/accounts" className={linkClass}>
              {collapsed ? "• Accounts" : "Account Management"}
            </NavLink>

          
          </nav>

          {/* Orange divider at the right edge (visual) */}
          <div className="divider" />
        </aside>

       
        

        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto" style={{ background: PANEL_BG }}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="queue" element={<QueuingTable />} />
            <Route path="queue/:patientId" element={<AdminChartView />} />
            <Route path="records" element={<AdminPatientRecords />} />
            <Route path="family/:familyNumber" element={<AdminFamily />} /> {/* NEW */}
            <Route path="inventory" element={<MedicineInventory flash={flash} />} />
            <Route path="day-history" element={<AdminDayHistory />} />
            {/* alias for any old links */}
            <Route path="archive" element={<Navigate to="/admin/day-history" replace />} />
            <Route path="analytics" element={<DataAnalytics />} />
            <Route path="accounts" element={<AccountManagement flash={flash} />} />
            {/* NEW: read-only chart view by recordId (same as Nurse) */}
            <Route path="record/:recordId" element={<NurseQueueChartView />} />
            <Route path="*" element={<div>Admin Page Not Found</div>} />
          </Routes>

          {toast && (
            <div
              className="fixed bottom-4 right-4 px-3 py-2 rounded text-white"
              style={{ backgroundColor: toast.type === "error" ? "#dc2626" : "#16a34a" }}
            >
              {toast.msg}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
