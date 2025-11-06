// src/apps/admin/AdminApp.jsx
import React, { useState } from "react";
import { NavLink, Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./AdminApp.css";

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

export default function AdminApp() {
  const [toast, setToast] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-header-row">
          <div className="font-semibold">Caybiga Health Center — Admin</div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="logout-btn"
            aria-label="Log out"
            title="Log out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9"/>
            </svg>
            {loggingOut ? "Signing out..." : "Log Out"}
          </button>
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-sidebar">
          <h2>Admin Dashboard</h2>

          <nav className="admin-nav">
            <NavLink
              to="/admin/dashboard"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/admin/queue"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Queuing Table
            </NavLink>

            <NavLink
              to="/admin/records"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Patient Records
            </NavLink>

            <NavLink
              to="/admin/inventory"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Medicine Inventory
            </NavLink>

            {/* Day History tab (active for /admin/day-history AND /admin/record/...) */}
            <Link
              to="/admin/day-history"
              className={`nav-link ${isDayHistoryContext ? "active" : ""}`}
            >
              Day History
            </Link>

            <NavLink
              to="/admin/analytics"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Data Analytics
            </NavLink>

            <NavLink
              to="/admin/accounts"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              Account Management
            </NavLink>
          </nav>
        </aside>

        <main className="admin-main">
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
            <div className={`toast ${toast.type === "error" ? "error" : ""}`}>
              {toast.msg}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
