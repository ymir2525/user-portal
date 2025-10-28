// src/routes/RequireAuth.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RequireAuth({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;

    // Initial check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    // Keep watching: if session becomes null (logout/expire), hard redirect
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      if (!sess) {
        // Replace current history entry so Forward can't re-enter
        window.location.replace("/login");
      }
    });

    // Bust BFCache: if page is restored from back/forward cache, reload to re-check session
    const onPageShow = (e) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return children;
}
