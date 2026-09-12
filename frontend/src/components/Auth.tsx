import React, { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, WarningCircle } from "@phosphor-icons/react";
import { supabase } from "../lib/supabase";

type Mode = "signin" | "signup";

/**
 * The front door.
 *
 * Deliberately built out of the classes the rest of the app already uses —
 * `upload-input`, `upload-error`, `hero__cta` — rather than a stylesheet of its
 * own. A sign-in page is the first thing anybody sees, so it has to look like
 * it was always there, not like the screen that got added last.
 */
export const Auth: React.FC = () => {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === "signup") {
        // The name rides along as user metadata; `handle_new_user` copies it
        // into `profiles.display_name`, which is what the nav and every byline
        // read. Without it the account would be called "You" until renamed.
        const { data, error: failure } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (failure) throw failure;
        // A project with email confirmation switched on returns a user but no
        // session. Saying so is the difference between "nothing happened" and
        // "go and click the link".
        if (data.user && !data.session) {
          setNotice("CHECK YOUR EMAIL TO CONFIRM THIS ADDRESS, THEN SIGN IN.");
        }
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
        if (failure) throw failure;
      }
      // On success there is nothing to do here: the session listener in
      // `useSession` swaps this screen for the app.
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That did not work. Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const swap = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setNotice(null);
  };

  return (
    <div className="min-h-screen bg-walnut-shadow text-warm-cream flex flex-col font-sans">
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[440px] flex flex-col gap-10">
          <header className="flex flex-col gap-4">
            <span className="text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase">
              MEETWISE AI
            </span>
            <h1 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal select-none">
              {mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
            </h1>
            <p className="text-[13px] text-warm-cream/70 font-normal leading-[1.6] max-w-[40ch]">
              {mode === "signin"
                ? "Your archive, your voices and everything you owe are waiting where you left them."
                : "One archive for every meeting, on any platform. Nobody else can read it."}
            </p>
          </header>

          <div className="divider-dashed" />

          <form onSubmit={submit} className="flex flex-col gap-8">
            {mode === "signup" && (
              <div className="flex flex-col gap-3">
                <label
                  htmlFor="auth-name"
                  className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase"
                >
                  YOUR NAME
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How you appear in your meetings"
                  className="upload-input"
                />
              </div>
            )}

            <div className="flex flex-col gap-3">
              <label
                htmlFor="auth-email"
                className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase"
              >
                EMAIL
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="upload-input"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label
                htmlFor="auth-password"
                className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase"
              >
                PASSWORD
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                className="upload-input"
              />
            </div>

            {error && (
              <p className="upload-error" role="alert">
                <WarningCircle size={16} weight="fill" className="shrink-0" />
                {error}
              </p>
            )}

            {notice && (
              <p className="text-[10px] font-medium tracking-[0.2em] text-ember-accent uppercase leading-[1.7]">
                {notice}
              </p>
            )}

            <motion.button
              type="submit"
              disabled={busy || !email || !password || (mode === "signup" && !name.trim())}
              className="hero__cta !mt-0 disabled:opacity-35 disabled:cursor-not-allowed"
              whileHover={busy ? undefined : { scale: 1.04 }}
              whileTap={busy ? undefined : { scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              {busy ? "WORKING…" : mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
            </motion.button>
          </form>

          <div className="divider-dashed" />

          <button
            type="button"
            onClick={swap}
            className="inline-flex items-center gap-2 self-start text-[11px] font-medium tracking-[0.2em] text-driftwood hover:text-ember-accent uppercase cursor-pointer transition-colors active:scale-95"
          >
            {mode === "signin" ? "CREATE AN ACCOUNT INSTEAD" : "I ALREADY HAVE AN ACCOUNT"}
            <ArrowRight size={14} />
          </button>
        </div>
      </main>
    </div>
  );
};

/**
 * What the app shows when `.env.local` was never filled in.
 *
 * Without this the missing variables surface as an opaque network failure on
 * the sign-in attempt, which points at everything except the two lines that
 * actually need typing.
 */
export const SupabaseNotConfigured: React.FC = () => (
  <div className="min-h-screen bg-walnut-shadow text-warm-cream flex items-center justify-center px-6 font-sans">
    <div className="w-full max-w-[560px] flex flex-col gap-6">
      <span className="text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase">
        NOT CONFIGURED
      </span>
      <h1 className="text-[28px] text-warm-cream leading-[1.1]">
        This build has no Supabase project behind it yet.
      </h1>
      <p className="text-[13px] text-warm-cream/70 leading-[1.7]">
        Copy <code className="text-ember-accent">frontend/.env.local.example</code> to{" "}
        <code className="text-ember-accent">frontend/.env.local</code>, fill in the two values from
        your project’s <span className="uppercase tracking-[0.1em]">Project Settings → API</span>{" "}
        page, and restart the dev server.
      </p>
      <pre className="text-[11px] text-driftwood leading-[1.9] border border-cork-border p-4 overflow-x-auto">
        VITE_SUPABASE_URL=https://&lt;your-project-ref&gt;.supabase.co{"\n"}
        VITE_SUPABASE_ANON_KEY=&lt;the anon / public key&gt;
      </pre>
    </div>
  </div>
);
