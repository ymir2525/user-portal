// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import RequireAuth from "./routes/RequireAuth";
import BhwDashboard from "./apps/BhwDashboard";
import BhwFamily from "./apps/BhwFamily";
import AdminApp from "./apps/admin/AdminApp";

// Nurse
import NurseDashboard from "./apps/nurse/NurseDashboard";
import NurseDashboardLayout from "./apps/nurse/NurseDashboardLayout";
import NurseQueueList from "./apps/nurse/NurseQueueList";
import NurseQueueChartView from "./apps/nurse/NurseQueueChartView";
import NursePatientRecords from "./apps/nurse/NursePatientRecords";
import NurseFamily from "./apps/nurse/NurseFamily";
import NurseInventory from "./apps/nurse/NurseInventory";
import NurseDayHistory from "./apps/nurse/NurseDayHistory"; // <-- ADD THIS

// Doctor
import DoctorDashboard from "./apps/doctor/DoctorDashboard";
import DoctorDashboardHome from "./apps/doctor/DoctorDashboardHome";
import DoctorQueueList from "./apps/doctor/DoctorQueueList";
import DoctorQueueChart from "./apps/doctor/DoctorQueueChart";
import DoctorInventory from "./apps/doctor/DoctorInventory";
import DoctorPatients from "./apps/doctor/DoctorPatients";
import DoctorFamily from "./apps/doctor/DoctorFamily";

// BHW
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

        {/* BHW */}
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

        {/* Doctor */}
        <Route
          path="/doctor/*"
          element={
            <RequireAuth role="Doctor">
              <DoctorDashboard />
            </RequireAuth>
          }
        >
          <Route index element={<DoctorDashboardHome />} />
          <Route path="queue" element={<DoctorQueueList />} />
          <Route path="queue/:recordId" element={<DoctorQueueChart />} />
          <Route path="patients" element={<DoctorPatients />} />
          <Route path="family/:familyNumber" element={<DoctorFamily />} />
          <Route path="inventory" element={<DoctorInventory />} />
        </Route>

        {/* Nurse */}
        <Route
          path="/nurse/*"
          element={
            <RequireAuth role="Nurse">
              <NurseDashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<NurseDashboard />} />
          <Route path="queue" element={<NurseQueueList />} />
          <Route path="queue/:recordId" element={<NurseQueueChartView />} />
          <Route path="patients" element={<NursePatientRecords />} />
          <Route path="family/:familyNumber" element={<NurseFamily />} />
          <Route path="inventory" element={<NurseInventory />} />
          <Route path="history" element={<NurseDayHistory />} /> {/* <-- USE IT */}
            {/* NEW: view chart from Day History without switching sidebar tab */}
         <Route path="history/view/:recordId" element={<NurseQueueChartView />} />
        </Route>

        {/* Admin */}
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
