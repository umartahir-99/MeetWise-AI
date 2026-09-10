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
