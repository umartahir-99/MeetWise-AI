import type { User } from "../mockData";
import type { AppSettings } from "../settings";
import type { ProfileRow, UserSettingsRow } from "./rows";

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
