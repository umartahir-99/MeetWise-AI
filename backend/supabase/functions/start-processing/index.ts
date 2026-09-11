/**
 * start-processing
 *
 * Called by the browser once a file is in storage. Hands the recording to the
 * transcription service and returns in well under a second — the work happens
 * elsewhere, and the result arrives later through `transcription-webhook`.
 *
 * Milestone M3: this stops at `queued`. The Gladia hand-off lands at M4. What
 * is here already is the part that must never be skipped: the ownership check.
 * This function runs with the service-role key, which bypasses row level
 * security entirely, so the database will not refuse a request for somebody
 * else's meeting. This code has to.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

interface StartRequest {
  meetingId?: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // 1. Who is asking. No token, no answer.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json(401, { error: "Missing bearer token" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Two clients on purpose. The first carries the caller's token and is used
  // only to learn who they are. The second is service-role and does the work.
  const asCaller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: userError,
  } = await asCaller.auth.getUser();
  if (userError || !user) return json(401, { error: "Invalid token" });

  let body: StartRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  if (!body.meetingId) return json(400, { error: "meetingId is required" });

  const admin = createClient(supabaseUrl, serviceKey);

  // 2. Load the meeting and confirm it is theirs. Not optional — see the file
  //    comment. A mismatch is reported as not found rather than as forbidden,
  //    so a caller cannot use this endpoint to learn which ids exist.
  const { data: meeting, error: meetingError } = await admin
    .from("meetings")
    .select("id, owner_id, status, audio_path")
    .eq("id", body.meetingId)
    .maybeSingle();

  if (meetingError) return json(500, { error: meetingError.message });
  if (!meeting || meeting.owner_id !== user.id) return json(404, { error: "No such meeting" });

  if (!meeting.audio_path) {
    return json(409, { error: "This meeting has no recording in storage yet" });
  }

  // 3. Queue it. At M4 this is where the signed URL is minted and Gladia is
  //    called; for now the row moves to `queued` and the Realtime subscription
  //    in the browser sees it move.
  const { error: updateError } = await admin
    .from("meetings")
    .update({
      status: "queued",
      stage_started_at: new Date().toISOString(),
      failed_stage: null,
      failure_reason: null,
    })
    .eq("id", meeting.id);

  if (updateError) return json(500, { error: updateError.message });

  return json(202, { meetingId: meeting.id, status: "queued" });
});
