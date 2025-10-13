// src/hooks/useBackToLogin.js
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/session";

/**
 * On browser Back (popstate), log out and send to /login.
 * This guarantees Back shows the login screen and Forward can't re-enter.
 */
export default function useBackToLogin() {
  const nav = useNavigate();

  useEffect(() => {
    // Push a marker state so the very next "Back" pops here
    window.history.pushState({ blockBackFromProtected: true }, "", window.location.href);

    const onPop = () => {
      // Log out immediately and navigate to login, replacing history
      clearSession();
      nav("/login", { replace: true });
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [nav]);
}
