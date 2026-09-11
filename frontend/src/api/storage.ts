import { supabase } from "../lib/supabase";

/**
 * The recordings bucket.
 *
 * Private, so nothing in it has a permanent address. Files are written under
 * `{user_id}/{meeting_id}/{filename}` — user first, which turns the storage
 * policy into a prefix check — and read back through signed URLs that expire.
 */
const BUCKET = "recordings";

/** Where a meeting's recording lives. A path, never a URL: URLs expire, paths do not. */
export function recordingPath(userId: string, meetingId: string, fileName: string): string {
  // The object key is the only place the original name survives, so it is
  // kept — but reduced to characters every storage layer agrees on.
  const safe = fileName.replace(/[^\w.-]+/g, "_").slice(0, 120) || "recording";
  return `${userId}/${meetingId}/${safe}`;
}

/**
 * Upload a recording, straight from the browser to storage.
 *
 * The file does not pass through a function or a server of ours. The browser
 * talks to storage directly and storage checks the policy itself, which is what
 * lets a large file go up without anything in between having to hold it.
 */
export async function uploadRecording(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    // A retry after a half-finished attempt must not be refused for the key
    // already existing.
    upsert: true,
  });

  if (error) throw error;
}

/**
 * A playable address for a stored recording, good for an hour.
 *
 * Minted on demand when a meeting is opened rather than stored on the row: a
 * stored URL is a URL that has expired by the time somebody clicks it.
 */
export async function signedRecordingUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

/** Remove a stored recording. Missing is not an error; gone is the goal. */
export async function removeRecording(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error && !/not found/i.test(error.message)) throw error;
}
