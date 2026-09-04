import { CURRENT_USER_ID, MOCK_UPLOAD_ANALYSIS } from "./mockData";
import type { Meeting, MeetingStatus } from "./mockData";
import { formatOffsetClock } from "./datetime";

/**
 * The ingest pipeline.
 *
 * The MVP path is record -> upload -> process. Uploading is instant from the
 * user's point of view; processing is not. A 45 minute recording takes real
 * minutes to transcribe and analyse, so the wait is a first-class screen
 * rather than a spinner, and every stage below is something the user can be
 * told about while they wait.
 *
 * `durationMs` is the *simulated* length of each stage. `realWorldNote` is
 * what the stage actually costs once a real speech-to-text service sits
 * behind it - shown in the UI so the compressed prototype timing never reads
 * as a promise about production.
 */
export interface PipelineStage {
  id: Exclude<MeetingStatus, "failed">;
  label: string;
  /** What the system is doing, in the user's language. */
  description: string;
  /** Honest production expectation for a ~45 minute recording. */
  realWorldNote: string;
  durationMs: number;
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    id: "uploaded",
    label: "UPLOADED",
    description: "Transferring the file and verifying it decodes.",
    realWorldNote: "Seconds to a minute, depending on connection.",
    durationMs: 2800,
  },
  {
    id: "queued",
    label: "QUEUED",
    description: "Waiting for a transcription worker to pick the job up.",
    realWorldNote: "Usually immediate; longer under load.",
    durationMs: 3000,
  },
  {
    id: "transcribing",
    label: "TRANSCRIBING",
    description: "Speech to text, with each speaker separated out.",
    realWorldNote: "About 1 to 3 minutes for a 45 minute recording.",
    durationMs: 7000,
  },
  {
    id: "analyzing",
    label: "ANALYZING",
    description: "Pulling out topics, decisions, owners and quotes.",
    realWorldNote: "Under a minute once the transcript exists.",
    durationMs: 5200,
  },
  {
    id: "ready",
    label: "READY",
    description: "Written to the archive and searchable.",
    realWorldNote: "",
    durationMs: 0,
  },
] as const;

/** Stages that actually run. `ready` is the finish line, not a step. */
const RUNNING_STAGES = PIPELINE_STAGES.filter((s) => s.id !== "ready");

const TOTAL_PIPELINE_MS = RUNNING_STAGES.reduce((sum, s) => sum + s.durationMs, 0);

export function stageMeta(status: MeetingStatus): PipelineStage | undefined {
  return PIPELINE_STAGES.find((s) => s.id === status);
}

/** 1-based position, for the numbered markers. Returns 0 for `failed`. */
export function stageNumber(status: MeetingStatus): number {
  const i = PIPELINE_STAGES.findIndex((s) => s.id === status);
  return i < 0 ? 0 : i + 1;
}

/** Nothing further will happen on its own. */
export function isTerminal(status: MeetingStatus): boolean {
  return status === "ready" || status === "failed";
}

/** A meeting the user can actually read. */
export function isReadable(meeting: Meeting): boolean {
  return meeting.status === "ready";
}

/** The stage after this one, or undefined at the end of the line. */
export function nextStatus(status: MeetingStatus): MeetingStatus | undefined {
  const i = PIPELINE_STAGES.findIndex((s) => s.id === status);
  if (i < 0 || i >= PIPELINE_STAGES.length - 1) return undefined;
  return PIPELINE_STAGES[i + 1].id;
}

/** How far through the current stage, 0..1. */
export function stageProgress(meeting: Meeting, now: number): number {
  const stage = stageMeta(meeting.status);
  if (!stage || !meeting.stageStartedAt || stage.durationMs === 0) return 0;
  return clamp01((now - meeting.stageStartedAt) / stage.durationMs);
}

/**
 * How far through the whole pipeline, 0..1, weighted by each stage's real
 * length so the bar does not jump when a short stage completes.
 */
export function overallProgress(meeting: Meeting, now: number): number {
  if (meeting.status === "ready") return 1;

  const reference =
    meeting.status === "failed" ? meeting.failedStage ?? "transcribing" : meeting.status;
  const index = RUNNING_STAGES.findIndex((s) => s.id === reference);
  if (index < 0) return 0;

  const elapsedBefore = RUNNING_STAGES.slice(0, index).reduce((sum, s) => sum + s.durationMs, 0);
  const withinStage =
    meeting.status === "failed" ? 0 : stageProgress(meeting, now) * RUNNING_STAGES[index].durationMs;

  return clamp01((elapsedBefore + withinStage) / TOTAL_PIPELINE_MS);
}

/** Simulated milliseconds left before the job is readable. */
export function remainingMs(meeting: Meeting, now: number): number {
  if (isTerminal(meeting.status)) return 0;
  return Math.max(0, TOTAL_PIPELINE_MS * (1 - overallProgress(meeting, now)));
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/* ------------------------------------------------------------------ */
/* Upload validation                                                    */
/* ------------------------------------------------------------------ */

export const ACCEPTED_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "aac",
  "ogg",
  "mp4",
  "mov",
  "webm",
] as const;

/** Matches the `accept` attribute on the file input. */
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",") + ",audio/*,video/*";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Returns a human-readable reason the file cannot be accepted, or null. */
export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    const supported = ACCEPTED_EXTENSIONS.slice(0, 4)
      .map((e) => e.toUpperCase())
      .join(", ");
    return `${ext ? `.${ext}` : "That file type"} is not supported. Use ${supported} or MP4.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  return null;
}

/**
 * Reads the real duration out of the file so the upload screen can show it
 * before anything is submitted. Resolves undefined if the browser cannot
 * decode the container.
 */
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("audio");
    let settled = false;

    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };

    el.preload = "metadata";
    el.onloadedmetadata = () =>
      finish(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined);
    el.onerror = () => finish(undefined);
    // Some containers never fire either event; do not hang the form on them.
    setTimeout(() => finish(undefined), 4000);
    el.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* Job creation                                                         */
/* ------------------------------------------------------------------ */

/** "q3_planning-sync.m4a" becomes "q3 planning sync" */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prototype affordance: there is no server, so the failure branch would be
 * unreachable - and therefore undesigned - without a trigger. Any file with
 * "fail" in its name dies during transcription. A retry always succeeds.
 */
function plannedFailure(fileName: string): Meeting["sim"] {
  if (!/fail/i.test(fileName)) return undefined;
  return {
    failAt: "transcribing",
    reason:
      "No speech detected in the first 90 seconds. The file may be silent, or its audio track may be empty.",
  };
}

export interface UploadInput {
  file: File;
  /** Falls back to the file name when the user leaves the field alone. */
  title: string;
  durationSec?: number;
}

/** Builds the meeting record that enters the pipeline at `uploaded`. */
/**
 * Best guess at when the meeting actually happened.
 *
 * The upload only knows when the file arrived, but a recording's modified time
 * is usually the moment it stopped - so the meeting started roughly one
 * duration before that. A missing or future mtime falls back to upload time.
 */
function inferStartedAt(file: File, durationMs: number, now: number): string {
  const recordingEnded =
    file.lastModified > 0 && file.lastModified <= now ? file.lastModified : now;
  return new Date(recordingEnded - durationMs).toISOString();
}

export function createUploadJob({ file, title, durationSec }: UploadInput): Meeting {
  const now = Date.now();
  const trimmed = title.trim();
  const durationMs = durationSec ? Math.round(durationSec * 1000) : 0;

  return {
    id: `upload-${now.toString(36)}`,
    title: trimmed || titleFromFileName(file.name) || "Untitled recording",
    startedAt: inferStartedAt(file, durationMs, now),
    durationMs,
    ownerId: CURRENT_USER_ID,
    // A real handle on the chosen file. Revoked when the job is discarded.
    audioUrl: URL.createObjectURL(file),

    // The analytical half stays empty until the analysis stage fills it. A job
    // still in flight genuinely has no topics yet, and the UI reads that.
    // Speakers arrive with diarization, so there is nothing to name yet.
    speakers: [],
    gist: "",
    summary: "",
    topics: [],
    decisions: [],
    actionItems: [],
    quotes: [],
    transcript: [],
    tags: [],

    status: "uploaded",
    stageStartedAt: now,
    uploadedAt: now,
    sim: plannedFailure(file.name),
    source: { fileName: file.name, fileSize: file.size, durationSec },
  };
}

/**
 * What the pipeline hands back when analysis completes: the fixture content,
 * merged over everything the upload already knew.
 */
export function buildReadyMeeting(meeting: Meeting, discardAudio = false): Meeting {
  const durationSec = meeting.source?.durationSec;

  return {
    ...meeting,
    // The retention setting: keep the transcript, drop the recording. The blob
    // itself is released when the tab goes away.
    audioUrl: discardAudio ? undefined : meeting.audioUrl,
    ...MOCK_UPLOAD_ANALYSIS,
    // The fixture transcript describes a 45 minute meeting; fall back to that
    // when the browser could not decode a real length from the file.
    durationMs: durationSec ? Math.round(durationSec * 1000) : 45 * 60_000,
    status: "ready",
    stageStartedAt: undefined,
    failedStage: undefined,
    failureReason: undefined,
  };
}

/** Stand-in for `gist` while a meeting has not been analysed yet. */
export function pendingGist(status: MeetingStatus): string {
  if (status === "failed") {
    return "Processing stopped before this recording could be summarised. Open it to retry.";
  }
  return "Still processing. The summary, decisions and action items appear once analysis finishes.";
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Seconds to mm:ss, or h:mm:ss past an hour. */
export function formatClock(totalSeconds: number): string {
  return formatOffsetClock(totalSeconds * 1000);
}

/** Coarse "how long has this been going" for the header. */
export function formatElapsed(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
