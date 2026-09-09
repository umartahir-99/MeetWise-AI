import { createClient } from "@supabase/supabase-js";

/**
 * The one client, created once.
 *
 * Both values are safe to ship in the browser bundle. Row Level Security is
 * what actually protects the data — the anon key only says "somebody is
 * asking", never "let them through" (TRD 7, "Secrets").
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether `.env.local` has actually been filled in.
 *
 * Checked in one place rather than at every call site: without it a missing
 * variable surfaces as an opaque network failure somewhere deep in a screen,
 * and the fix — two lines in a file — is nowhere near the error. `App` reads
 * this and says so plainly instead.
 */
export const SUPABASE_CONFIGURED = Boolean(url && anonKey);

/**
 * A client is constructed either way, so no module has to guard its import.
 * When the environment is missing, the placeholder host is unreachable by
 * design and nothing is ever asked of it, because `App` renders the setup
 * notice instead of the app.
 */
export const supabase = createClient(
  url || "http://localhost:54321",
  anonKey || "not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);
