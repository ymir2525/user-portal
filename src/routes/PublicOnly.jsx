// src/routes/PublicOnly.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { getSession } from "../lib/session";

export default function PublicOnly({ children }) {
  const sess = getSession();
  if (sess?.token) {
    const role = (sess.user?.role || "").toUpperCase();
    const to = role === "BHW" ? "/bhw" : role === "DOCTOR" ? "/doctor" : "/";
    return <Navigate to={to} replace />;
  }
  return children;
}
