import type { MeetingStatus } from "../mockData";

/**
 * The database, as the browser sees it.
 *
 * Hand-written rather than generated, because generation needs a live project
 * and these rows are the migration files' own column lists — if the two ever
 * disagree, the migration is the truth and this file is the bug. Snake case is
 * kept exactly as Postgres returns it; nothing is renamed until `mappers.ts`.
 */

export interface ProfileRow {
  id: string;
  display_name: string;
  created_at: string;
}

export interface UserSettingsRow {
  user_id: string;
  transcription_model: string;
  analysis_model: string;
  language: string;
  retention_days: number;
  discard_audio_after_processing: boolean;
}

export interface PersonRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface VoiceRow {
  id: string;
  owner_id: string;
  voice_print: string;
  person_id: string | null;
  created_at: string;
}

export interface MeetingSpeakerRow {
  id: string;
  meeting_id: string;
  owner_id: string;
  slot_id: string;
  label: string;
  voice_print: string;
  position: number;
}

export interface TranscriptLineRow {
  id: string;
  meeting_id: string;
  owner_id: string;
  speaker_slot: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface TopicRow {
  id: string;
  meeting_id: string;
  owner_id: string;
  title: string;
  details: string;
  position: number;
}

export interface DecisionRow {
  id: string;
  meeting_id: string;
  owner_id: string;
  text: string;
  position: number;
}

export interface ActionItemRow {
  id: string;
  meeting_id: string;
  owner_id: string;
  item: string;
  speaker_slot: string;
  done: boolean;
  done_at: string | null;
  position: number;
}

export interface QuoteRow {
  id: string;
  meeting_id: string;
  owner_id: string;
  quote: string;
  speaker_slot: string;
  start_ms: number;
  position: number;
}

export interface MeetingRow {
  id: string;
  owner_id: string;
  title: string;
  started_at: string;
  duration_ms: number;
  status: MeetingStatus;
  gist: string;
  summary: string;
  tags: string[];
  audio_path: string | null;
  source_file_name: string | null;
  source_file_size: number | null;
  source_duration_sec: number | null;
  uploaded_at: string | null;
  stage_started_at: string | null;
  failed_stage: MeetingStatus | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** A meeting with every child table pulled in by the nested select. */
export interface MeetingRowWithChildren extends MeetingRow {
  meeting_speakers: MeetingSpeakerRow[];
  transcript_lines: TranscriptLineRow[];
  topics: TopicRow[];
  decisions: DecisionRow[];
  action_items: ActionItemRow[];
  quotes: QuoteRow[];
}
