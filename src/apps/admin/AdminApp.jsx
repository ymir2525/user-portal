// src/apps/admin/AdminApp.jsx
import React, { useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
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

const ORANGE   = "#e9772e";
const PEACH    = "#f3b184";
const PEACH_BG = "#fde6d3";
const PANEL_BG = "#fff7f1";

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

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: PEACH_BG }}>
      <header className="w-full px-6 py-3 text-white shrink-0" style={{ backgroundColor: ORANGE }}>
        <div className="flex items-center justify-between">
          <div className="font-semibold">Caybiga Health Center — Admin</div>

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

      <div className="flex flex-1 overflow-hidden">
        <aside
          className="self-stretch w-64 h-full p-4 overflow-y-auto border-r"
          style={{ backgroundColor: PANEL_BG, borderColor: PEACH }}
        >
          <h2 className="mb-4 font-semibold" style={{ color: ORANGE }}>
            Admin Dashboard
          </h2>

          <nav className="space-y-2">
            <NavLink to="/admin/dashboard" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Dashboard
            </NavLink>

            <NavLink to="/admin/queue" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Queuing Table
            </NavLink>

            <NavLink to="/admin/records" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Patient Records
            </NavLink>

            <NavLink to="/admin/inventory" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Medicine Inventory
            </NavLink>

            <NavLink to="/admin/archive" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Archive
            </NavLink>

            <NavLink to="/admin/analytics" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Data Analytics
            </NavLink>

            <NavLink to="/admin/accounts" className={({isActive}) =>
              `w-full block px-3 py-2 border rounded-lg ${isActive ? "text-white" : "text-gray-800"}`
            } style={({isActive}) => ({
              backgroundColor: isActive ? ORANGE : "#ffffff",
              borderColor: isActive ? ORANGE : PEACH,
            })}>
              Account Management
            </NavLink>
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="queue" element={<QueuingTable />} />
            <Route path="queue/:patientId" element={<AdminChartView />} />
            <Route path="records" element={<AdminPatientRecords />} />
            <Route path="family/:familyNumber" element={<AdminFamily />} /> {/* NEW */}
            <Route path="inventory" element={<MedicineInventory flash={flash} />} />
           <Route path="day-history" element={<AdminDayHistory />} />
           {/* optional compatibility alias if old links exist: */}
           <Route path="archive" element={<Navigate to="/admin/day-history" replace />} />
            <Route path="analytics" element={<DataAnalytics />} />
            <Route path="accounts" element={<AccountManagement flash={flash} />} />
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
