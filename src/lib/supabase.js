// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const storage =
  typeof window !== "undefined" ? window.sessionStorage : undefined;

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,   // keep session while the tab is open
      storage,                // use sessionStorage (clears on tab close)
      autoRefreshToken: true,
    },
  }
);
