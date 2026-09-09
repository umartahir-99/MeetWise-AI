import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, supabase } from "./lib/supabase";

/**
 * Who is signed in, kept in step with the client's own idea of it.
 *
 * `getSession` answers from local storage immediately, so a returning user
 * never sees the sign-in screen flash before their own archive. The listener
 * then keeps that answer honest: a token refresh, a sign-out in another tab and
 * an expired session all arrive through it.
 *
 * `loading` exists to distinguish "nobody is signed in" from "we have not
 * looked yet" — without it, the first paint of every reload is the login page.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;

    let live = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      live = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
