// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import RequireAuth from "./routes/RequireAuth";
import BhwDashboard from "./apps/BhwDashboard";
import BhwFamily from "./apps/BhwFamily";
import AdminApp from "./apps/admin/AdminApp";
import NurseDashboard from "./apps/nurse/NurseDashboard";

// Doctor (new layout + pages)
import DoctorDashboard from "./apps/doctor/DoctorDashboard";
import DoctorDashboardHome from "./apps/doctor/DoctorDashboardHome";
import DoctorQueueList from "./apps/doctor/DoctorQueueList";
import DoctorQueueChart from "./apps/doctor/DoctorQueueChart";
import PatientsPlaceholder from "./apps/doctor/PatientsPlaceholder";
import InventoryPlaceholder from "./apps/doctor/InventoryPlaceholder";
import BhwQueueList from "./apps/bhw/BhwQueueList";
import BhwQueueChart from "./apps/bhw/BhwQueueChart";

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
<Route
  path="/bhw/queue"
  element={
    <RequireAuth role="BHW">
      <BhwQueueList />
    </RequireAuth>
  }
/>
<Route
  path="/bhw/queue/:recordId"
  element={
    <RequireAuth role="BHW">
      <BhwQueueChart />
    </RequireAuth>
  }
/>

        {/* Protected: Doctor (enum value is 'Doctor') */}
        <Route
          path="/doctor/*"
          element={
            <RequireAuth role="Doctor">
              <DoctorDashboard />
            </RequireAuth>
          }
        >
          {/* Renders inside <Outlet/> of DoctorDashboard */}
          <Route index element={<DoctorDashboardHome />} />
          <Route path="queue" element={<DoctorQueueList />} />
          <Route path="queue/:recordId" element={<DoctorQueueChart />} />
          <Route path="patients" element={<PatientsPlaceholder />} />
          <Route path="inventory" element={<InventoryPlaceholder />} />
        </Route>

        {/* Protected: Nurse */}
        <Route
          path="/nurse"
          element={
            <RequireAuth role="Nurse">
              <NurseDashboard />
            </RequireAuth>
          }
        />

        {/* Protected: Admin */}
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
