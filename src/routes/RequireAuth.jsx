// src/routes/RequireAuth.jsx
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

// Any path here is allowed without auth
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

export default function RequireAuth({ children }) {
  const location = useLocation();
  const [session, setSession] = useState(undefined); // undefined = loading; null = no session

  useEffect(() => {
    let mounted = true;

    // Initial check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });

    // Watch for auth changes; if it becomes null, hard redirect to avoid BFCache/history weirdness
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess ?? null);
      if (!sess && !PUBLIC_PATHS.has(window.location.pathname)) {
        window.location.replace("/login"); // replace history so user can't go "back" into a protected route
      }
    });

    // If browser restores from BFCache, force a re-check
    const onPageShow = (e) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // While checking session, render nothing (or a spinner)
  if (session === undefined) return null;

  // Public pages are always accessible
  if (PUBLIC_PATHS.has(location.pathname)) {
    return children;
  }

  // No session? Send to login and remember intended destination
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Authenticated—allow protected content
  return children;
}
