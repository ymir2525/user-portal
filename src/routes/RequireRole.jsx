import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getSession } from "../lib/session";

/**
 * Protect a route by role.
 * If not logged in or role mismatch -> redirect to /login (replace)
 */
export default function RequireRole({ role, children }) {
  const sess = getSession();
  const loc = useLocation();

  const ok =
    !!sess?.token &&
    typeof sess?.user?.role === "string" &&
    sess.user.role.toUpperCase() === role.toUpperCase();

  if (!ok) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: loc.pathname,
          msg: "Please sign in.",
        }}
      />
    );
  }

  return children;
}
