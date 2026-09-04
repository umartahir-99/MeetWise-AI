import type { Meeting } from "./mockData";
import { startedAtMs } from "./datetime";

/**
 * The settings that actually govern this product.
 *
 * The pipeline is cloud speech-to-text followed by an LLM pass, so the things
 * worth exposing are the ones that change the output or the bill: which models
 * run, what language to expect, how long recordings are kept, and how to get
 * the archive back out. Nothing here claims a guarantee the stack cannot make.
 */
export interface AppSettings {
  transcriptionModel: string;
  analysisModel: string;
  /** BCP-47 tag, or "auto" to let the transcriber decide. */
  language: string;
  /** Days to keep a meeting. 0 keeps everything. */
  retentionDays: number;
  /** Drop the source audio once a transcript exists, keeping only the text. */
  discardAudioAfterProcessing: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
  /** What choosing this one actually costs or buys. */
  note: string;
}

/** Speech to text with diarization. This is the stage that separates voices. */
export const TRANSCRIPTION_MODELS: ModelOption[] = [
  {
    id: "assemblyai-universal-2",
    name: "ASSEMBLYAI UNIVERSAL-2",
    note: "Balanced. Strongest punctuation and speaker separation on long meetings.",
  },
  {
    id: "deepgram-nova-3",
    name: "DEEPGRAM NOVA-3",
    note: "Fastest turnaround. Cheapest per hour, slightly weaker on crosstalk.",
  },
  {
    id: "whisper-large-v3",
    name: "WHISPER LARGE-V3",
    note: "Best on accented speech and poor audio. Slowest of the three.",
  },
];

/** The pass that turns a transcript into topics, decisions, owners and quotes. */
export const ANALYSIS_MODELS: ModelOption[] = [
  {
    id: "claude-opus-5",
    name: "CLAUDE OPUS 5",
    note: "Deepest reading. Best at decisions that were implied rather than stated.",
  },
  {
    id: "claude-sonnet-5",
    name: "CLAUDE SONNET 5",
    note: "Most of the quality at a fraction of the cost. A sensible default at volume.",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "CLAUDE HAIKU 4.5",
    note: "Fastest and cheapest. Suited to short stand-ups rather than long reviews.",
  },
];

export interface LanguageOption {
  id: string;
  name: string;
}

export const LANGUAGES: LanguageOption[] = [
  { id: "auto", name: "DETECT AUTOMATICALLY" },
  { id: "en-US", name: "ENGLISH (US)" },
  { id: "en-GB", name: "ENGLISH (UK)" },
  { id: "es-ES", name: "SPANISH" },
  { id: "fr-FR", name: "FRENCH" },
  { id: "de-DE", name: "GERMAN" },
  { id: "pt-BR", name: "PORTUGUESE (BRAZIL)" },
  { id: "hi-IN", name: "HINDI" },
  { id: "ur-PK", name: "URDU" },
  { id: "ja-JP", name: "JAPANESE" },
];

export interface RetentionOption {
  days: number;
  label: string;
}

export const RETENTION_OPTIONS: RetentionOption[] = [
  { days: 30, label: "30 DAYS" },
  { days: 90, label: "90 DAYS" },
  { days: 180, label: "6 MONTHS" },
  { days: 365, label: "1 YEAR" },
  { days: 0, label: "KEEP INDEFINITELY" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  transcriptionModel: "assemblyai-universal-2",
  analysisModel: "claude-opus-5",
  language: "auto",
  retentionDays: 0,
  discardAudioAfterProcessing: false,
};

/** Display name for a model id, falling back to the id itself. */
export function modelName(options: ModelOption[], id: string): string {
  return options.find((o) => o.id === id)?.name ?? id;
}

export function modelNote(options: ModelOption[], id: string): string {
  return options.find((o) => o.id === id)?.note ?? "";
}

export function languageName(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.name ?? id;
}

/** Meetings the retention window has already passed. */
export function expiredMeetings(
  meetings: Meeting[],
  retentionDays: number,
  now = Date.now()
): Meeting[] {
  if (!retentionDays) return [];
  const cutoff = now - retentionDays * 86_400_000;
  return meetings.filter((m) => startedAtMs(m) < cutoff);
}
