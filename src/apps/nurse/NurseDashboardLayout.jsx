import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./nurseDash.css";

export default function NurseDashboardLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [loading, setLoading] = useState(true);

  // ---- guard: allow only NURSE ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) {
        nav("/login", { replace: true });
        return;
      }
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();
      if (error || !prof || String(prof.role).toUpperCase() !== "NURSE") {
        await supabase.auth.signOut().catch(() => {});
        nav("/login", { replace: true });
        return;
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [nav]);

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    nav("/login", { replace: true });
  };

  if (loading) return null;

  return (
    <div className="nursedash layout">
      {/* Top Header */}
      <header className="app-header">
        <div className="app-header__title">Bagong Silang Phase 8 Health Center</div>
        <button onClick={logout} className="link link--small">
          Log Out
        </button>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <nav className="nav">
          <NavButton to="/nurse" currentPath={loc.pathname} exact>
            Dashboard
          </NavButton>
          <NavButton to="/nurse/queue" currentPath={loc.pathname}>
            Queueing Table
          </NavButton>
          <NavButton to="/nurse/patients" currentPath={loc.pathname}>
            Patient Records
          </NavButton>
          <NavButton to="/nurse/inventory" currentPath={loc.pathname}>
            Medicine Inventory
          </NavButton>
          <NavButton to="/nurse/history" currentPath={loc.pathname}>
            Day History
          </NavButton>
        </nav>
      </aside>

      {/* Main Page Content */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function NavButton({ to, exact, currentPath, children }) {
  const isActive = exact ? currentPath === to : currentPath.startsWith(to);
  return (
    <NavLink
      to={to}
      className={`nav__item ${isActive ? "nav__item--active" : ""}`}
    >
      {children}
    </NavLink>
  );
}
