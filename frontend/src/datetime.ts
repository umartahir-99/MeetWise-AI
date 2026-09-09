import type { Meeting } from "./mockData";

/**
 * Display helpers for the time fields on `Meeting`.
 *
 * `startedAt` is a real ISO 8601 instant and `durationMs` / `startMs` / `endMs`
 * are plain numbers, so the model can be sorted, filtered and compared. Nothing
 * stores a pre-formatted string any more - every label the UI shows is derived
 * here, at render time.
 *
 * Instants are formatted in the *viewer's* time zone, which is what a real
 * timestamp means. The seeded fixtures are authored in UTC, so their clock
 * readings shift for anyone outside it.
 */

/** "AUG 22, 2026" */
export function formatMeetingDate(startedAt: string): string {
  return new Date(startedAt)
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase();
}

/** "14:00" - 24-hour wall clock for an instant. */
function formatClockTime(startedAt: string): string {
  return new Date(startedAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    // h23 rather than hour12:false - some engines render midnight as 24:00 for the latter.
    hourCycle: "h23",
  });
}

/** "45 MIN", or "--" when the length is not known yet. */
export function formatDurationLabel(durationMs: number): string {
  if (!durationMs || durationMs <= 0) return "--";
  return `${Math.max(1, Math.round(durationMs / 60_000))} MIN`;
}

/** "14:00 - 14:45", collapsing to just the start when the length is unknown. */
function formatTimeRange(startedAt: string, durationMs: number): string {
  const start = formatClockTime(startedAt);
  if (!durationMs || durationMs <= 0) return start;
  return `${start} - ${formatClockTime(endedAt(startedAt, durationMs))}`;
}

/** "14:00 - 14:45 (45 MIN)", the one-line "when" for a meeting header. */
export function formatWhen(startedAt: string, durationMs: number): string {
  const range = formatTimeRange(startedAt, durationMs);
  return durationMs > 0 ? `${range} (${formatDurationLabel(durationMs)})` : range;
}

/**
 * "03:00" - an offset on its own.
 *
 * This is the playback vocabulary: transcript lines, quote cues and the
 * transport all read as a position in the recording, not a wall clock, so
 * clicking "12:03" lands on 12:03 in the player.
 */
export function formatOffsetClock(offsetMs: number): string {
  const secs = Math.max(0, Math.round(offsetMs / 1000));
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rest = secs % 60;
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(rest)}` : `${pad(mins)}:${pad(rest)}`;
}

/** ISO instant the meeting ended. */
function endedAt(startedAt: string, durationMs: number): string {
  return new Date(new Date(startedAt).getTime() + Math.max(0, durationMs)).toISOString();
}

/** Epoch ms, for sorting and range checks. */
export function startedAtMs(meeting: Meeting): number {
  return new Date(meeting.startedAt).getTime();
}

/**
 * "9 DAYS AGO" - how long ago something happened, in the app's label voice.
 *
 * Deliberately coarse: on a list of things you owe, the useful signal is that
 * one is three weeks old and another is from yesterday.
 */
export function formatAgo(startedAt: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(startedAt).getTime()) / 86_400_000);
  if (days <= 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  if (days < 14) return `${days} DAYS AGO`;
  if (days < 60) return `${Math.floor(days / 7)} WEEKS AGO`;
  return `${Math.floor(days / 30)} MONTHS AGO`;
}

/** Newest first. Pass to `.sort()` on any list of meetings. */
export function byNewestFirst(a: Meeting, b: Meeting): number {
  return startedAtMs(b) - startedAtMs(a);
}
