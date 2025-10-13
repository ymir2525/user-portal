import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import RequireAuth from "./routes/RequireAuth";
import BhwDashboard from "./apps/BhwDashboard";
import BhwFamily from "./apps/BhwFamily";
import DoctorDashboard from "./apps/DoctorDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root always goes to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected: BHW */}
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

        {/* Protected: DOCTOR */}
        <Route
          path="/doctor"
          element={
            <RequireAuth role="DOCTOR">
              <DoctorDashboard />
            </RequireAuth>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
