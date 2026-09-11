/**
 * start-processing
 *
 * Called by the browser once a file is in storage. Hands the recording to
 * Gladia and returns in well under a second — the transcript arrives later,
 * through `transcription-webhook`, and the analysis after that.
 *
 * This runs with the service-role key, which bypasses row level security, so
 * the database will not refuse a request for somebody else's meeting. The
 * ownership check below is not optional.
 */
import {
  CORS,
  adminClient,
  callerFromRequest,
  env,
  json,
  markFailed,
  setStage,
  triggerAnalysis,
} from "../_shared/common.ts";

const GLADIA = "https://api.gladia.io/v2/pre-recorded";

/** How long the signed URL Gladia fetches from stays valid. Generous: a queue can be slow. */
const AUDIO_URL_TTL_SECONDS = 4 * 60 * 60;

/**
 * The settings screen speaks BCP-47 (`en-US`); Gladia wants ISO 639-1 (`en`).
 * "auto" becomes an empty list, which is how Gladia spells auto-detect.
 */
const gladiaLanguages = (setting: string): string[] =>
  setting === "auto" ? [] : [setting.split("-")[0].toLowerCase()];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const caller = await callerFromRequest(req);
  if (!caller) return json(401, { error: "Missing or invalid bearer token" });

  let meetingId: string | undefined;
  try {
    ({ meetingId } = await req.json());
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  if (!meetingId) return json(400, { error: "meetingId is required" });

  const admin = adminClient();

  // Ownership. Reported as not-found rather than forbidden, so this endpoint
  // cannot be used to learn which ids exist.
  const { data: meeting, error: meetingError } = await admin
    .from("meetings")
    .select("id, owner_id, status, audio_path, failed_stage")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) return json(500, { error: meetingError.message });
  if (!meeting || meeting.owner_id !== caller.id) return json(404, { error: "No such meeting" });
  if (!meeting.audio_path) {
    return json(409, { error: "This meeting has no recording in storage yet" });
  }

  // A retry after a failed analysis already has its transcript. Sending it
  // back through transcription would cost minutes and Gladia credit to
  // produce the same lines again.
  if (meeting.failed_stage === "analyzing") {
    const { count } = await admin
      .from("transcript_lines")
      .select("id", { count: "exact", head: true })
      .eq("meeting_id", meeting.id);

    if (count && count > 0) {
      await setStage(admin, meeting.id, "analyzing");
      triggerAnalysis(meeting.id);
      return json(202, { meetingId: meeting.id, status: "analyzing" });
    }
  }

  await setStage(admin, meeting.id, "queued");

  try {
    const { data: settings } = await admin
      .from("user_settings")
      .select("language")
      .eq("user_id", caller.id)
      .maybeSingle();

    // Gladia fetches the audio itself, so it needs an address it can reach.
    // Signed rather than public: the bucket stays private and the link dies.
    const { data: signed, error: signError } = await admin.storage
      .from("recordings")
      .createSignedUrl(meeting.audio_path, AUDIO_URL_TTL_SECONDS);
    if (signError || !signed) throw new Error(`Could not sign the recording: ${signError?.message}`);

    // The secret rides in the callback URL because Gladia's callback has no
    // signing of its own. It is what makes the incoming call ours to trust.
    const callbackUrl =
      `${env("SUPABASE_URL")}/functions/v1/transcription-webhook` +
      `?key=${encodeURIComponent(env("WEBHOOK_SECRET"))}`;

    const response = await fetch(GLADIA, {
      method: "POST",
      headers: {
        "x-gladia-key": env("GLADIA_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        diarization: true,
        callback: true,
        callback_config: { url: callbackUrl, method: "POST" },
        language_config: {
          languages: gladiaLanguages(settings?.language ?? "auto"),
          code_switching: false,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Gladia refused the job (${response.status}): ${detail.slice(0, 300)}`);
    }

    const { id: transcriptionId } = (await response.json()) as { id: string };
    if (!transcriptionId) throw new Error("Gladia returned no transcription id");

    // The job row is how the webhook finds its way back. Without it a callback
    // for this id is a callback for a job we never issued, and is dropped.
    const { error: jobError } = await admin.from("processing_jobs").insert({
      meeting_id: meeting.id,
      owner_id: caller.id,
      provider: "gladia",
      provider_job_id: transcriptionId,
      stage: "transcribing",
      attempts: 1,
    });
    if (jobError) throw new Error(`Could not record the job: ${jobError.message}`);

    await setStage(admin, meeting.id, "transcribing");
    return json(202, { meetingId: meeting.id, status: "transcribing", transcriptionId });
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : "Could not start transcription.";
    console.error("start-processing", meeting.id, reason);
    await markFailed(admin, meeting.id, "queued", reason);
    // Still a clean response: the failure is on the row, where the screen reads it.
    return json(202, { meetingId: meeting.id, status: "failed", reason });
  }
});
