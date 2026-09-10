import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, supabase } from "./lib/supabase";

/**
 * How long to wait for the auth client before showing the sign-in screen.
 *
 * `getSession` and the change listener both queue behind a `navigator.locks`
 * acquisition, and that lock can be held by another tab or left behind by a
 * half-written session. When it is, neither path ever answers — so without a
 * deadline the app sits on its loading screen with no sign-in, no sign-up and
 * no way out.
 */
const AUTH_TIMEOUT_MS = 3_000;

/**
 * Who is signed in, kept in step with the client's own idea of it.
 *
 * `onAuthStateChange` is the source of truth: on subscribe it fires
 * `INITIAL_SESSION` carrying whatever was persisted, and it keeps answering
 * afterwards for refreshes, sign-outs in another tab, and expiry. `getSession`
 * is kept only as a fast path for the first paint.
 *
 * `loading` distinguishes "nobody is signed in" from "we have not looked yet",
 * so a returning user never sees the sign-in screen flash before their own
 * archive. Every route out of it settles that flag — resolve, reject, or
 * timeout — because a loading state with an unhandled path is just a hang.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;

    let live = true;
    const settle = (next: Session | null) => {
      if (!live) return;
      setSession(next);
      setLoading(false);
    };

    // Fails open. A rejection here means we could not read the stored session,
    // which is indistinguishable from not having one — so show the sign-in
    // screen rather than a screen with nothing on it.
    supabase.auth
      .getSession()
      .then(({ data }) => settle(data.session))
      .catch(() => settle(null));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) =>
      settle(next)
    );

    // The deadline only clears `loading`; it never claims there is no session.
    // If the client answers late, the listener above corrects the screen.
    const deadline = setTimeout(() => {
      if (live) setLoading(false);
    }, AUTH_TIMEOUT_MS);

    return () => {
      live = false;
      clearTimeout(deadline);
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
