import { supabase } from "../lib/supabase";
import type { Meeting } from "../mockData";
import { toMeeting } from "./mappers";
import type { MeetingRowWithChildren } from "./rows";

/**
 * Reading and removing meetings.
 *
 * Security is not applied here. Every one of these queries runs as the signed-in
 * user against tables with row level security on, so the database refuses
 * anything that is not theirs — there is no "check the user owns this" branch to
 * write, or to forget.
 */

/**
 * Every child table, pulled in one round trip.
 *
 * The alternative — a meeting query followed by six more — is six times the
 * latency and a window where the archive is half-loaded. PostgREST resolves the
 * whole tree server-side from the foreign keys.
 */
const MEETING_TREE = `
  *,
  meeting_speakers(*),
  transcript_lines(*),
  topics(*),
  decisions(*),
  action_items(*),
  quotes(*)
` as const;

/**
 * The whole archive, newest first.
 *
 * Ordered in the database rather than after mapping, because the index on
 * `(owner_id, started_at desc)` already answers this and sorting it again in
 * the browser would just be doing the work twice.
 */
export async function listMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_TREE)
    .order("started_at", { ascending: false })
    .returns<MeetingRowWithChildren[]>();

  if (error) throw error;
  return (data ?? []).map(toMeeting);
}

/** One meeting, fully populated. Null when it is gone or not yours. */
export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_TREE)
    .eq("id", id)
    .maybeSingle<MeetingRowWithChildren>();

  if (error) throw error;
  return data ? toMeeting(data) : null;
}

/**
 * Delete meetings by id.
 *
 * The child rows go with them: every foreign key into `meetings` is declared
 * `on delete cascade`, so this one statement clears the transcript, the topics,
 * the quotes and the rest. Stored audio is not covered by that and is removed
 * separately once uploads are real.
 */
export async function deleteMeetings(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const { error } = await supabase.from("meetings").delete().in("id", ids);
  if (error) throw error;
}

/** Tick an action item off, or put it back. */
export async function setActionItemDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("action_items")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) throw error;
}

/** What the upload screen knows before anything has been processed. */
export interface NewMeeting {
  title: string;
  startedAt: string;
  durationMs: number;
  source: { fileName: string; fileSize: number; durationSec?: number };
}

/**
 * The row an upload starts as: `uploaded`, with nothing analysed yet.
 *
 * Inserted before the file goes up, because the file's storage path needs the
 * meeting's id — and because a row that exists from the first second is what
 * lets a refresh mid-upload find the job rather than lose it.
 */
export async function createMeeting(ownerId: string, input: NewMeeting): Promise<Meeting> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      owner_id: ownerId,
      title: input.title,
      started_at: input.startedAt,
      duration_ms: input.durationMs,
      status: "uploaded",
      source_file_name: input.source.fileName,
      source_file_size: input.source.fileSize,
      source_duration_sec: input.source.durationSec ?? null,
      uploaded_at: new Date().toISOString(),
      stage_started_at: new Date().toISOString(),
    })
    .select(MEETING_TREE)
    .single<MeetingRowWithChildren>();

  if (error) throw error;
  return toMeeting(data);
}

/** Record where the recording landed, once it has. */
export async function attachRecording(meetingId: string, audioPath: string): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ audio_path: audioPath })
    .eq("id", meetingId);

  if (error) throw error;
}

/**
 * Hand the meeting to the pipeline.
 *
 * Goes through the edge function rather than updating the row directly,
 * because from M4 on this is where the transcription service is called — and
 * that needs a signed URL and a secret the browser must never hold.
 */
export async function startProcessing(meetingId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("start-processing", {
    body: { meetingId },
  });

  if (error) throw error;
}

/** Write a failure onto the row, so the status screen can say what went wrong. */
export async function markFailed(
  meetingId: string,
  stage: Meeting["status"],
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ status: "failed", failed_stage: stage, failure_reason: reason })
    .eq("id", meetingId);

  if (error) throw error;
}

/**
 * Delete everything past the retention window - rows and recordings.
 *
 * Goes through the same edge function the nightly scheduler calls, scoped to
 * the signed-in user by their token, so the button and the schedule cannot
 * disagree about what "expired" means or forget the file.
 */
export async function sweepExpired(): Promise<{ deletedMeetings: number; deletedFiles: number }> {
  const { data, error } = await supabase.functions.invoke("retention-sweep", { body: {} });
  if (error) throw error;
  return data;
}
