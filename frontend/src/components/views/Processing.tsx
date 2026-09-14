import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CircleNotch,
  FileAudio,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Meeting, MeetingStatus } from "@/data/mockData";
import type { AppSettings } from "@/domain/settings";
import { ANALYSIS_MODELS, TRANSCRIPTION_MODELS, languageName, modelName } from "@/domain/settings";
import {
  PIPELINE_STAGES,
  formatBytes,
  formatClock,
  formatElapsed,
  isTerminal,
  isRunningLong,
  overallProgress,
  remainingMs,
  stageMeta,
  stageNumber,
} from "@/domain/processing";

interface ProcessingProps {
  meeting: Meeting;
  /** Which models this job is running through, straight from Settings. */
  settings: AppSettings;
  onBack: () => void;
  onOpenMeeting: (id: string) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}

type StageState = "done" | "active" | "failed" | "pending";

/**
 * Pipeline position by status, built once.
 *
 * The tracker asks for this on every row on every tick, so deriving it inside
 * `stageStateFor` meant rebuilding the same list several times a second.
 */
const STAGE_INDEX = new Map<MeetingStatus, number>(
  PIPELINE_STAGES.map((s, i) => [s.id as MeetingStatus, i])
);

const indexOfStage = (status: MeetingStatus): number => STAGE_INDEX.get(status) ?? -1;

/** Where a given stage sits relative to where the job actually is. */
function stageStateFor(stageId: MeetingStatus, meeting: Meeting): StageState {
  const stageIndex = indexOfStage(stageId);

  if (meeting.status === "ready") return "done";

  if (meeting.status === "failed") {
    const failedIndex = indexOfStage(meeting.failedStage ?? "transcribing");
    if (stageIndex < failedIndex) return "done";
    if (stageIndex === failedIndex) return "failed";
    return "pending";
  }

  const currentIndex = indexOfStage(meeting.status);
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "active";
  return "pending";
}

export const Processing: React.FC<ProcessingProps> = ({
  meeting,
  settings,
  onBack,
  onOpenMeeting,
  onRetry,
  onDiscard,
}) => {
  // Local clock so the bar moves continuously. The pipeline engine only writes
  // state at stage boundaries, so without this the bar would jump in steps.
  const [now, setNow] = useState(() => Date.now());
  const running = !isTerminal(meeting.status);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(timer);
  }, [running]);

  const progress = overallProgress(meeting, now);
  const percent = Math.round(progress * 100);
  const current = stageMeta(meeting.status);
  const failed = meeting.status === "failed";
  const ready = meeting.status === "ready";
  const remaining = remainingMs(meeting, now);
  // Said out loud rather than left as a countdown stuck on zero. Overrunning
  // the estimate is normal for a long recording; a bar that looks frozen is
  // what makes somebody refresh and wonder if they lost it.
  const runningLong = isRunningLong(meeting, now);
  const elapsed = meeting.uploadedAt ? now - meeting.uploadedAt : 0;

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[12px] font-medium tracking-[0.2em] text-warm-cream hover:underline cursor-pointer self-start uppercase active:scale-[0.98]"
        type="button"
      >
        <ArrowLeft size={14} />
        BACK TO MEMORIES
      </button>

      {/* Header ---------------------------------------------------------- */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`status-pill ${
              failed ? "status-pill--failed" : ready ? "status-pill--ready" : "status-pill--active"
            }`}
          >
            {!isTerminal(meeting.status) && <span className="status-pill__dot" aria-hidden="true" />}
            {failed ? "FAILED" : ready ? "READY" : current?.label}
          </span>
          <span className="text-[11px] font-medium tracking-[0.2em] text-driftwood uppercase">
            JOB {meeting.id.replace("upload-", "").toUpperCase()}
          </span>
        </div>

        <h1 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal user-title">
          {meeting.title}
        </h1>

        {meeting.source && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium tracking-[0.15em] text-driftwood uppercase">
            <span className="inline-flex items-center gap-2">
              <FileAudio size={14} weight="light" />
              {meeting.source.fileName}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(meeting.source.fileSize)}</span>
            {meeting.source.durationSec !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatClock(meeting.source.durationSec)} OF AUDIO</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>UPLOADED {formatElapsed(elapsed)} AGO</span>
          </div>
        )}

        {/* What this job is actually being run through. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-medium tracking-[0.18em] text-driftwood uppercase">
          <span>{modelName(TRANSCRIPTION_MODELS, settings.transcriptionModel)}</span>
          <span aria-hidden="true">·</span>
          <span>{modelName(ANALYSIS_MODELS, settings.analysisModel)}</span>
          <span aria-hidden="true">·</span>
          <span>{languageName(settings.language)}</span>
        </div>
      </header>

      <div className="divider-dashed" />

      {/* Live status ----------------------------------------------------- */}
      {!failed && (
        <section className="flex flex-col gap-6" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent">
                {ready ? "COMPLETE" : `STAGE ${stageNumber(meeting.status)} OF ${PIPELINE_STAGES.length}`}
              </span>
              <h2 className="text-heading-custom text-warm-cream">
                {ready ? "MEMORY READY" : current?.label}
              </h2>
              <p className="text-[16px] leading-[1.5] text-warm-cream/80 max-w-[52ch] font-normal">
                {ready
                  ? "The recording has been transcribed, analysed and written to the archive. It is searchable from Ask."
                  : current?.description}
              </p>
            </div>

            <span className="processing-percent" aria-hidden="true">
              {percent}
              <span className="processing-percent__sign">%</span>
            </span>
          </div>

          <div
            className="processing-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Processing progress"
          >
            <div
              className="processing-bar__fill"
              style={{ "--fill": percent / 100 } as React.CSSProperties}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
            <span>
              {ready
                ? "FINISHED"
                : runningLong
                  ? "TAKING LONGER THAN USUAL — STILL WORKING"
                  : `ABOUT ${formatElapsed(remaining)} REMAINING`}
            </span>
            <span>YOU CAN LEAVE THIS PAGE — PROCESSING CONTINUES</span>
          </div>
        </section>
      )}

      {/* Failure --------------------------------------------------------- */}
      {failed && (
        <section className="processing-failure" aria-live="polite">
          <div className="flex items-start gap-4">
            <WarningCircle size={24} weight="light" className="text-ember-accent shrink-0 mt-0.5" />
            <div className="flex flex-col gap-3">
              <h2 className="text-heading-sm-custom text-warm-cream">
                FAILED DURING {stageMeta(meeting.failedStage ?? "transcribing")?.label}
              </h2>
              <p className="text-[16px] leading-[1.5] text-warm-cream/80 max-w-[54ch] font-normal">
                {meeting.failureReason ??
                  "The job stopped before it could finish. The original file is still stored."}
              </p>
              {/* Only true once storage has the file. A job that died mid-upload
                  is sent up again, from memory if the browser still holds it. */}
              <p className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
                {meeting.audioPath
                  ? "YOUR FILE WAS NOT DELETED — RETRYING REUSES THE SAME UPLOAD"
                  : "THE FILE NEVER REACHED STORAGE — RETRYING UPLOADS IT AGAIN"}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Pipeline tracker ------------------------------------------------ */}
      <section className="flex flex-col gap-5">
        <span className="text-[10px] font-medium tracking-[0.25em] text-driftwood uppercase">
          PIPELINE
        </span>

        <ol className="pipeline">
          {PIPELINE_STAGES.map((stage, index) => {
            const state = stageStateFor(stage.id, meeting);
            return (
              <li key={stage.id} className="pipeline__row" data-state={state}>
                <span className="pipeline__marker" aria-hidden="true">
                  {state === "done" ? (
                    <CheckCircle size={18} weight="fill" />
                  ) : state === "active" ? (
                    <CircleNotch size={18} weight="bold" className="pipeline__spinner" />
                  ) : state === "failed" ? (
                    <WarningCircle size={18} weight="fill" />
                  ) : (
                    <span className="pipeline__index">{String(index + 1).padStart(2, "0")}</span>
                  )}
                </span>

                <div className="pipeline__body">
                  <span className="pipeline__label">{stage.label}</span>
                  <span className="pipeline__description">
                    {state === "failed"
                      ? (meeting.failureReason ?? stage.description)
                      : stage.description}
                  </span>
                </div>

                <span className="pipeline__note">
                  {state === "pending" && stage.realWorldNote ? stage.realWorldNote : ""}
                  {state === "done" ? "DONE" : ""}
                  {state === "failed" ? "STOPPED" : ""}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="text-[10px] leading-[1.6] font-medium tracking-[0.15em] text-driftwood uppercase max-w-[62ch]">
          Each stage advances when the server reports it finished — the bar between updates is an
          estimate, not a measurement. A 45 minute recording transcribes in roughly one to three.
        </p>
      </section>

      {/* Actions --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-4">
        {ready && (
          <motion.button
            type="button"
            className="hero__cta !mt-0"
            onClick={() => onOpenMeeting(meeting.id)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            OPEN THE MEMORY
            <ArrowRight size={14} className="inline-block ml-2 align-middle" />
          </motion.button>
        )}

        {failed && (
          <>
            <motion.button
              type="button"
              className="hero__cta !mt-0"
              onClick={() => onRetry(meeting.id)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              <ArrowClockwise size={14} className="inline-block mr-2 align-middle" />
              RETRY PROCESSING
            </motion.button>

            <button
              type="button"
              onClick={() => onDiscard(meeting.id)}
              className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-driftwood hover:text-warm-cream uppercase cursor-pointer transition-colors active:scale-95"
            >
              <Trash size={14} />
              DISCARD UPLOAD
            </button>
          </>
        )}

        {!ready && !failed && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-driftwood hover:text-warm-cream uppercase cursor-pointer transition-colors active:scale-95"
          >
            <ArrowLeft size={14} />
            LEAVE IT RUNNING
          </button>
        )}
      </div>
    </div>
  );
};
