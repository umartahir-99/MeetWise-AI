/**
 * What every function needs and none should reinvent.
 *
 * Three clients are in play across the pipeline. The caller's own token is
 * used once, to learn who they are. The service-role client does the work and
 * bypasses row level security entirely — which is why any function using it
 * checks ownership itself. And the plain fetches to Gladia and Gemini carry the
 * provider keys, which the browser never holds.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type MeetingStatus =
  | "uploaded"
  | "queued"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "failed";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

export const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** Service-role. Sees everything; must check ownership before touching anything. */
export const adminClient = (): SupabaseClient =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

/**
 * Who is calling, from the bearer token on the request. Null when there is no
 * token or it does not verify — the caller decides whether that is a 401.
 */
export async function callerFromRequest(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;

  const asCaller = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error,
  } = await asCaller.auth.getUser();
  return error || !user ? null : { id: user.id };
}

/**
 * The three fields the failure screen already reads.
 *
 * Every function writes these on its way out of any error path, because a job
 * that dies without saying where and why is a job the user has to guess about.
 * The reason is meant to be read by a person, not parsed by a program.
 */
export async function markFailed(
  admin: SupabaseClient,
  meetingId: string,
  stage: MeetingStatus,
  reason: string
): Promise<void> {
  await admin
    .from("meetings")
    .update({ status: "failed", failed_stage: stage, failure_reason: reason })
    .eq("id", meetingId);
}

/** Set the stage, and the clock the progress bar reads. */
export async function setStage(
  admin: SupabaseClient,
  meetingId: string,
  status: MeetingStatus
): Promise<void> {
  await admin
    .from("meetings")
    .update({
      status,
      stage_started_at: new Date().toISOString(),
      failed_stage: null,
      failure_reason: null,
    })
    .eq("id", meetingId);
}

/**
 * Hand a meeting to `analyze-meeting` without waiting for it.
 *
 * Called from two places — the transcription webhook, which must answer Gladia
 * fast, and start-processing on a retry that already has a transcript. The
 * call is handed to the runtime to finish after this function has returned,
 * and the analysis function checks for the service-role key so nobody else can
 * trigger it.
 */
export function triggerAnalysis(meetingId: string): void {
  const call = fetch(`${env("SUPABASE_URL")}/functions/v1/analyze-meeting`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ meetingId }),
  }).catch((failure) => console.error("analyze-meeting trigger failed", failure));

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(call);
}

/** Speaker slots, the way the app names them: `speaker-1`, `Speaker 1`. */
export const slotFor = (index: number) => ({
  slotId: `speaker-${index + 1}`,
  label: `Speaker ${index + 1}`,
});
