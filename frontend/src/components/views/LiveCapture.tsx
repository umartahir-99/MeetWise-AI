import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Microphone, Monitor, Prohibit, Record, WarningCircle } from "@phosphor-icons/react";
import { formatMeetingDate, formatOffsetClock, formatWhen } from "@/domain/datetime";
import { describeUpload, formatBytes, formatElapsed } from "@/domain/processing";
import type { UploadDescription } from "@/domain/processing";
import { CAPTURE_BITRATE, remainingCaptureMs, useLiveRecorder } from "@/hooks/useLiveRecorder";
import type { MeetingAudioState, RecorderStatus } from "@/hooks/useLiveRecorder";

/**
 * Record a meeting from this browser.
 *
 * The screen records; it does not transcribe. What it shows is what it can
 * vouch for - that the microphone is open, that sound is arriving, how long
 * and how large the recording is - and when the user stops, the file goes
 * through the same pipeline as an upload. The transcript, the speakers and
 * the summary all arrive from there.
 */

/** A capture shorter than this is a misclick, not a meeting. */
const MIN_CAPTURE_SEC = 2;

const STATUS_LABEL: Record<RecorderStatus, string> = {
  requesting: "STARTING",
  recording: "LIVE CAPTURING",
  blocked: "NOT CAPTURING",
  stopping: "FINISHING",
  done: "SAVED",
};

const MEETING_AUDIO_LABEL: Record<MeetingAudioState, string> = {
  none: "NOT ADDED",
  unsupported: "NOT SUPPORTED IN THIS BROWSER",
  live: "LIVE",
  "no-audio": "NO AUDIO IN THAT SOURCE",
  ended: "STOPPED",
};

const MEETING_AUDIO_HINT: Partial<Record<MeetingAudioState, string>> = {
  none: "For an online call, share the tab or screen the call is in so the other side is recorded too.",
  "no-audio": "Pick the source again and tick “Share tab audio” or “Share system audio” in the picker.",
  ended: "Sharing was stopped from the browser. The microphone is still recording.",
  unsupported: "Chrome or Edge can share a tab's audio. Here, only the microphone is recorded.",
};

interface LiveCaptureProps {
  /** The same hand-over an upload makes: what is known, and the file. */
  onSave: (description: UploadDescription, file: File) => void;
  onCancel: () => void;
}

export const LiveCapture: React.FC<LiveCaptureProps> = ({ onSave, onCancel }) => {
  const recorder = useLiveRecorder();
  const { status, reason, startedAt, elapsedSec, levels, bytes, meetingAudio, limitReached, stop } =
    recorder;
  const [title, setTitle] = useState("");

  // "Live capture · SEP 15, 2026 14:30" - the fallback title, and the placeholder.
  // Stamped from when recording actually began, so nothing until it has.
  const startedIso = startedAt ? new Date(startedAt).toISOString() : undefined;
  const defaultTitle = startedIso
    ? `Live capture · ${formatMeetingDate(startedIso)} ${formatWhen(startedIso, 0)}`
    : "Live capture";

  const recording = status === "recording";
  const canSave = recording && elapsedSec >= MIN_CAPTURE_SEC;
  const finishing = status === "stopping" || status === "done";

  const save = useCallback(async () => {
    let file: File;
    try {
      file = await stop();
    } catch (failure) {
      console.error("Could not finish the capture", failure);
      return;
    }
    onSave(
      describeUpload({ file, title: title.trim() || defaultTitle, durationSec: elapsedSec }),
      file
    );
  }, [stop, onSave, title, defaultTitle, elapsedSec]);

  // The recorder stops itself at the storage cap. Save what it has - once,
  // however many times the screen re-renders after the flag goes up.
  const limitHandled = useRef(false);
  useEffect(() => {
    if (!limitReached || limitHandled.current) return;
    limitHandled.current = true;
    void save();
  }, [limitReached, save]);

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-9 min-h-[calc(100vh-64px)]">

      {/* LEFT: what the microphone hears (col-span 7) */}
      <section className="lg:col-span-7 flex flex-col gap-6 border border-cork-border rounded-[12px] p-6 bg-walnut-shadow h-[600px] lg:h-[700px] relative overflow-hidden">

        {/* Status Bar */}
        <div className="flex items-center justify-between border-b border-cork-border/50 pb-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              {recording && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ember-accent opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  recording ? "bg-ember-accent" : "bg-driftwood"
                }`}
              ></span>
            </span>
            <span className="text-[12px] font-medium tracking-[0.2em] text-warm-cream uppercase">
              {STATUS_LABEL[status]}
            </span>
          </div>
          <div className="text-[12px] font-medium tracking-[0.15em] text-driftwood font-mono">
            ELAPSED: {formatOffsetClock(elapsedSec * 1000)}
          </div>
        </div>

        {/* Level meter, or why there is none */}
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 text-driftwood">
          {status === "requesting" && (
            <>
              <Record size={32} className="animate-pulse" />
              <p className="text-[14px] font-medium tracking-[0.1em] uppercase">
                Waiting for microphone permission…
              </p>
            </>
          )}

          {status === "blocked" && (
            <>
              <p className="upload-error max-w-[40ch]" role="alert">
                <WarningCircle size={16} weight="fill" className="shrink-0" />
                {reason}
              </p>
              <button type="button" className="voice-ghost !self-center" onClick={recorder.retry}>
                <Microphone size={12} />
                TRY AGAIN
              </button>
            </>
          )}

          {(recording || finishing) && (
            <>
              {/* One bar per recent loudness sample, oldest on the left. */}
              <div
                className="flex items-end gap-[3px] h-[160px] w-full max-w-[560px] px-4"
                aria-hidden="true"
              >
                {levels.map((level, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-full transition-[height] duration-75 ${
                      i === levels.length - 1 ? "bg-ember-accent" : "bg-ember-accent/50"
                    }`}
                    style={{ height: `${Math.max(2, level * 100)}%` }}
                  />
                ))}
              </div>
              <p className="text-[14px] font-medium tracking-[0.1em] uppercase">
                {finishing ? "Saving…" : "Listening"}
              </p>
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 pt-4 border-t border-cork-border/50 bg-walnut-shadow/90">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="flex-1 bg-warm-cream text-walnut-shadow rounded-[36px] px-6 py-[14px] text-[12px] md:text-[14px] font-medium tracking-[0.15em] uppercase hover:bg-warm-cream/90 transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <Check size={16} weight="bold" />
            END & SAVE MEMORY
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={finishing}
            className="px-6 py-[14px] border border-warm-cream rounded-[22.5px] text-[12px] md:text-[14px] font-medium tracking-[0.15em] text-warm-cream uppercase hover:bg-warm-cream/10 transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Prohibit size={16} />
            ABANDON
          </button>
        </div>
      </section>

      {/* RIGHT: what is being captured (col-span 5) */}
      <section
        data-lenis-prevent
        className="lg:col-span-5 flex flex-col gap-8 border border-cork-border rounded-[12px] p-6 bg-bark-brown/10 h-[600px] lg:h-[700px] overflow-y-auto"
      >
        <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em] border-b border-cork-border/50 pb-4">
          CAPTURE
        </h2>

        {/* Title */}
        <div className="flex flex-col gap-3">
          <label
            htmlFor="capture-title"
            className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase"
          >
            TITLE
          </label>
          <input
            id="capture-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle}
            disabled={finishing}
            className="upload-input"
          />
        </div>

        <div className="divider-dashed" />

        {/* Sources */}
        <div className="flex flex-col gap-5">
          <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent uppercase font-mono">
            SOURCES
          </span>

          <div className="flex items-center justify-between gap-4 border-l border-warm-cream/20 pl-3">
            <span className="flex items-center gap-2 text-[13px] text-warm-cream">
              <Microphone size={16} className="text-driftwood shrink-0" />
              MICROPHONE
            </span>
            <span className="text-[10px] font-medium tracking-[0.1em] text-driftwood uppercase">
              {status === "blocked" ? "BLOCKED" : recording || finishing ? "LIVE" : "WAITING"}
            </span>
          </div>

          <div className="flex flex-col gap-3 border-l border-warm-cream/20 pl-3">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-[13px] text-warm-cream">
                <Monitor size={16} className="text-driftwood shrink-0" />
                MEETING AUDIO
              </span>
              <span
                className={`text-[10px] font-medium tracking-[0.1em] uppercase ${
                  meetingAudio === "live" ? "text-ember-accent" : "text-driftwood"
                }`}
              >
                {MEETING_AUDIO_LABEL[meetingAudio]}
              </span>
            </div>

            {MEETING_AUDIO_HINT[meetingAudio] && (
              <p className="text-[12px] leading-relaxed text-warm-cream/70 max-w-[40ch]">
                {MEETING_AUDIO_HINT[meetingAudio]}
              </p>
            )}

            {meetingAudio !== "live" && meetingAudio !== "unsupported" && (
              <button
                type="button"
                className="voice-ghost"
                disabled={!recording}
                onClick={() => void recorder.addMeetingAudio()}
              >
                <Monitor size={12} />
                {meetingAudio === "none" ? "ADD TAB OR SCREEN AUDIO" : "PICK A SOURCE AGAIN"}
              </button>
            )}
          </div>
        </div>

        <div className="divider-dashed" />

        {/* The file taking shape */}
        <div className="flex flex-col gap-4">
          <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent uppercase font-mono">
            RECORDING
          </span>
          <span className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
            {CAPTURE_BITRATE / 1000} KBPS · {formatBytes(bytes)} · ROOM FOR{" "}
            {formatElapsed(remainingCaptureMs(bytes))}
          </span>
          {limitReached && (
            <p className="upload-error" role="alert">
              <WarningCircle size={16} weight="fill" className="shrink-0" />
              The recording reached the storage limit and is being saved.
            </p>
          )}
        </div>

        <p className="mt-auto text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase leading-[1.6] max-w-[40ch]">
          The transcript and summary are produced after you stop — the same pipeline as an
          upload. Nothing is analysed live.
        </p>
      </section>

    </div>
  );
};
