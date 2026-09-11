import type { Meeting, User, VoiceDirectory } from "../mockData";
import type { AppSettings } from "../settings";
import type {
  MeetingRowWithChildren,
  PersonRow,
  ProfileRow,
  UserSettingsRow,
  VoiceRow,
} from "./rows";

/**
 * Database rows in, the shapes the app already speaks out.
 *
 * This is the file that protects every component. `Meeting`, `User` and
 * `AppSettings` were already good API contracts — real ISO instants, offsets in
 * milliseconds, a proper status enum — so the backend's job was never to design
 * a new shape, only to produce that exact one from rows (TRD 3).
 *
 * The rule that follows from that: when a screen looks wrong after the
 * migration, the mapper is wrong. Fix it here, not in the screen.
 */

export function toUser(row: ProfileRow): User {
  return { id: row.id, name: row.display_name };
}

export function toSettings(row: UserSettingsRow): AppSettings {
  return {
    transcriptionModel: row.transcription_model,
    analysisModel: row.analysis_model,
    language: row.language,
    retentionDays: row.retention_days,
    discardAudioAfterProcessing: row.discard_audio_after_processing,
  };
}

/**
 * A settings patch on its way back to Postgres.
 *
 * Partial in, partial out: `Settings.tsx` sends only what the user actually
 * changed, and sending the untouched columns back would turn every edit into a
 * full-row overwrite — which is how one tab quietly reverts another tab's
 * change.
 */
export function fromSettings(patch: Partial<AppSettings>): Partial<UserSettingsRow> {
  const row: Partial<UserSettingsRow> = {};
  if (patch.transcriptionModel !== undefined) row.transcription_model = patch.transcriptionModel;
  if (patch.analysisModel !== undefined) row.analysis_model = patch.analysisModel;
  if (patch.language !== undefined) row.language = patch.language;
  if (patch.retentionDays !== undefined) row.retention_days = patch.retentionDays;
  if (patch.discardAudioAfterProcessing !== undefined) {
    row.discard_audio_after_processing = patch.discardAudioAfterProcessing;
  }
  return row;
}

/**
 * A timestamptz on its way to an epoch-millisecond field.
 *
 * `Meeting.startedAt` is an ISO string but `stageStartedAt` and `uploadedAt`
 * are numbers, because the processing screen does arithmetic on them. Postgres
 * hands back a string either way, so the conversion has to happen here rather
 * than being noticed later by a progress bar that renders `NaN`.
 */
function epochMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** `position` is what the analysis meant; array order is only what came back. */
const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export function toMeeting(row: MeetingRowWithChildren): Meeting {
  const speakers = [...(row.meeting_speakers ?? [])].sort(byPosition).map((s) => ({
    id: s.slot_id,
    label: s.label,
    voicePrint: s.voice_print,
  }));

  const meeting: Meeting = {
    id: row.id,
    title: row.title,
    // Normalised rather than passed through: Postgres renders `+00:00` where
    // the fixtures use `Z`, and `datetime.ts` compares these as strings in
    // places. One shape in, one shape out.
    startedAt: new Date(row.started_at).toISOString(),
    // bigint arrives as a number for values this size, but as a string once it
    // passes 2^53. Coerced either way so arithmetic never silently concatenates.
    durationMs: Number(row.duration_ms),
    ownerId: row.owner_id,
    speakers,
    gist: row.gist,
    summary: row.summary,
    topics: [...(row.topics ?? [])].sort(byPosition).map((t) => ({
      title: t.title,
      details: t.details,
    })),
    decisions: [...(row.decisions ?? [])].sort(byPosition).map((d) => d.text),
    actionItems: [...(row.action_items ?? [])].sort(byPosition).map((a) => ({
      id: a.id,
      item: a.item,
      speakerId: a.speaker_slot,
      done: a.done,
    })),
    quotes: [...(row.quotes ?? [])].sort(byPosition).map((q) => ({
      quote: q.quote,
      speakerId: q.speaker_slot,
      startMs: Number(q.start_ms),
    })),
    // Sorted by time, not by insertion: a bulk insert makes no promise about
    // the order rows come back in, and a transcript out of order is nonsense.
    transcript: [...(row.transcript_lines ?? [])]
      .sort((a, b) => Number(a.start_ms) - Number(b.start_ms))
      .map((l) => ({
        speakerId: l.speaker_slot,
        text: l.text,
        startMs: Number(l.start_ms),
        endMs: Number(l.end_ms),
      })),
    tags: row.tags ?? [],
    status: row.status,
  };

  // Optional fields are attached rather than set to undefined, so a `Meeting`
  // from the database has the same key set as one built by the app - which is
  // what keeps `"source" in meeting` style checks honest.
  const stageStartedAt = epochMs(row.stage_started_at);
  if (stageStartedAt !== undefined) meeting.stageStartedAt = stageStartedAt;

  const uploadedAt = epochMs(row.uploaded_at);
  if (uploadedAt !== undefined) meeting.uploadedAt = uploadedAt;

  if (row.failed_stage) meeting.failedStage = row.failed_stage;
  if (row.failure_reason) meeting.failureReason = row.failure_reason;
  if (row.audio_path) meeting.audioPath = row.audio_path;

  // `audioUrl` is deliberately absent here. The bucket is private, so playback
  // needs a signed URL minted when the meeting is opened; until then the player
  // falls back to narration by itself, which is exactly what it is built to do.
  if (row.source_file_name) {
    meeting.source = {
      fileName: row.source_file_name,
      fileSize: Number(row.source_file_size ?? 0),
      ...(row.source_duration_sec !== null
        ? { durationSec: row.source_duration_sec }
        : {}),
    };
  }

  return meeting;
}

/** The people directory, keyed the way `createSpeakerResolver` expects it. */
export function toPeople(rows: PersonRow[]): Record<string, User> {
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

/**
 * voicePrint -> personId.
 *
 * A voice with no person yet is left out entirely rather than mapped to null:
 * the directory's whole contract is that a missing key means "nobody has named
 * this one", and the resolver falls back to the diarization label for it.
 */
export function toVoiceDirectory(rows: VoiceRow[]): VoiceDirectory {
  const directory: VoiceDirectory = {};
  for (const row of rows) {
    if (row.person_id) directory[row.voice_print] = row.person_id;
  }
  return directory;
}
