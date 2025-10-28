import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import RequireAuth from "./routes/RequireAuth";
import BhwDashboard from "./apps/BhwDashboard";
import BhwFamily from "./apps/BhwFamily";
import DoctorDashboard from "./apps/DoctorDashboard";
import AdminApp from "./apps/admin/AdminApp";
import NurseDashboard from "./apps/nurse/NurseDashboard"; // NEW

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root always goes to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected: BHW (enum value is exactly 'BHW') */}
        <Route
          path="/bhw"
          element={
            <RequireAuth role="BHW">
              <BhwDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/bhw/family/:familyNumber"
          element={
            <RequireAuth role="BHW">
              <BhwFamily />
            </RequireAuth>
          }
        />

        {/* Protected: Doctor (enum value is 'Doctor', not 'DOCTOR') */}
        <Route
          path="/doctor"
          element={
            <RequireAuth role="Doctor">
              <DoctorDashboard />
            </RequireAuth>
          }
        />

        {/* Protected: Nurse (enum value is 'Nurse') */}
        <Route
          path="/nurse"
          element={
            <RequireAuth role="Nurse">
              <NurseDashboard />
            </RequireAuth>
          }
        />

        {/* Protected: Admin (enum value is 'Admin', not 'ADMIN') */}
        <Route
          path="/admin/*"
          element={
            <RequireAuth role="Admin">
              <AdminApp />
            </RequireAuth>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
