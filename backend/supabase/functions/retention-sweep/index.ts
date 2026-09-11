/**
 * retention-sweep
 *
 * Deletes meetings that have outlived their owner's retention window - rows
 * and stored recordings both. The rows could be deleted in SQL; the files
 * cannot, which is why this is a function: only the Storage API removes an
 * object, and a row deleted from storage.objects leaves its file orphaned and
 * billed.
 *
 * Two callers, two scopes:
 *   - the nightly scheduler, carrying the Vault secret: sweeps every account
 *   - a signed-in user, carrying their token: sweeps only their own meetings.
 *     This is what the Settings screen's "delete expired" button calls, so the
 *     manual path and the automatic one cannot drift apart.
 *
 * `retention_days = 0` means keep forever, and is the default.
 */
import { CORS, adminClient, callerFromRequest, json } from "../_shared/common.ts";

/** How many meetings one run will delete. A runaway window cannot empty a bucket in one night. */
const MAX_PER_RUN = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const admin = adminClient();

  // Who is asking, and for whom.
  let scopeOwner: string | null = null;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const { data: expected } = await admin.rpc("cron_secret");
    if (!expected || cronKey !== expected) return json(401, { error: "Unauthorized" });
  } else {
    const caller = await callerFromRequest(req);
    if (!caller) return json(401, { error: "Missing or invalid bearer token" });
    scopeOwner = caller.id;
  }

  // Every account with a window, or just the one asking.
  let settingsQuery = admin
    .from("user_settings")
    .select("user_id, retention_days")
    .gt("retention_days", 0);
  if (scopeOwner) settingsQuery = settingsQuery.eq("user_id", scopeOwner);

  const { data: windows, error: windowsError } = await settingsQuery;
  if (windowsError) return json(500, { error: windowsError.message });

  let deletedMeetings = 0;
  let deletedFiles = 0;
  const failures: string[] = [];

  for (const { user_id, retention_days } of windows ?? []) {
    const cutoff = new Date(Date.now() - retention_days * 86_400_000).toISOString();

    const { data: expired } = await admin
      .from("meetings")
      .select("id, audio_path")
      .eq("owner_id", user_id)
      .lt("started_at", cutoff)
      .order("started_at")
      .limit(MAX_PER_RUN - deletedMeetings);

    if (!expired?.length) continue;

    // Files first. If the row delete failed after the file was gone, the
    // sweep would find and delete the row next night; if the row went first
    // and the file delete failed, nothing would ever come back for the file.
    const paths = expired.map((m) => m.audio_path).filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { error: removeError } = await admin.storage.from("recordings").remove(paths);
      if (removeError) {
        failures.push(`${user_id}: ${removeError.message}`);
        continue;
      }
      deletedFiles += paths.length;
    }

    const { error: deleteError } = await admin
      .from("meetings")
      .delete()
      .in("id", expired.map((m) => m.id));
    if (deleteError) {
      failures.push(`${user_id}: ${deleteError.message}`);
      continue;
    }
    deletedMeetings += expired.length;

    if (deletedMeetings >= MAX_PER_RUN) break;
  }

  console.log("retention-sweep", { scope: scopeOwner ?? "all", deletedMeetings, deletedFiles, failures });
  return json(200, { deletedMeetings, deletedFiles, failures });
});
