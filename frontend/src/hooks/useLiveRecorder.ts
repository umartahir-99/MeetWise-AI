import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES } from "@/domain/processing";

/**
 * Recording a meeting in the browser.
 *
 * Live capture produces a file, nothing more: the microphone (and, if asked,
 * the audio of a tab or screen the call is in) is mixed into one stream and
 * encoded as it plays. When the user stops, the result is handed to the same
 * pipeline an upload goes through. Nothing here transcribes or analyses -
 * the screen must not claim otherwise.
 *
 * Both sources feed a single `AudioContext`: each becomes a source node wired
 * into one recorded destination and one analyser for the level meter. Adding
 * the meeting audio mid-recording is one more node on the graph; the encoder
 * never restarts and the file stays whole.
 */

export type RecorderStatus = "requesting" | "recording" | "blocked" | "stopping" | "done";

/**
 * The optional second source. `unsupported` is a browser with no way to share
 * audio at all; `no-audio` is a share the user made without ticking the audio
 * box, which is the common mistake and is worth naming.
 */
export type MeetingAudioState = "none" | "unsupported" | "live" | "no-audio" | "ended";

export interface LiveRecorder {
  status: RecorderStatus;
  /** Why the recorder is `blocked`, in the user's language. */
  reason?: string;
  /** When recording began, epoch ms. 0 until it has. */
  startedAt: number;
  /** Wall-clock seconds since recording began. */
  elapsedSec: number;
  /** Recent loudness samples, oldest first, each 0..1. Drives the meter. */
  levels: readonly number[];
  /** Encoded bytes so far - what the file will weigh. */
  bytes: number;
  meetingAudio: MeetingAudioState;
  /** Ask for a tab or screen and mix its audio in. Resolves once the picker closes. */
  addMeetingAudio: () => Promise<void>;
  /** Ask for the microphone again after a refusal, once the site setting allows it. */
  retry: () => void;
  /** The storage cap was reached and the recorder stopped itself. Save now. */
  limitReached: boolean;
  /** Finish and produce the file. Safe to call more than once. */
  stop: () => Promise<File>;
}

/** Speech quality for Opus. An hour weighs ~21 MB, well inside the storage cap. */
export const CAPTURE_BITRATE = 48_000;

/** How many meter samples the screen keeps on show. */
const LEVEL_HISTORY = 64;
const LEVEL_SAMPLE_MS = 66;

/** Chunk the encoder every second: a crash mid-meeting keeps everything before it. */
const CHUNK_MS = 1000;

/** Preferred first; the extension is what storage and the upload rules see. */
const CONTAINERS: readonly { mime: string; ext: string }[] = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "mp4" },
];

type Container = (typeof CONTAINERS)[number];

function pickContainer(): Container | undefined {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return undefined;
  return CONTAINERS.find((c) => MediaRecorder.isTypeSupported(c.mime));
}

/** Typed as always present in the DOM lib; it is not, in every browser. */
function canShareAudio(): boolean {
  return typeof navigator !== "undefined" && "getDisplayMedia" in (navigator.mediaDevices ?? {});
}

const UNSUPPORTED_BROWSER =
  "This browser cannot record audio. Use a current Chrome, Edge or Firefox.";

/** How much longer the encoder can run before the file outgrows storage. */
export function remainingCaptureMs(bytes: number): number {
  return Math.max(0, ((MAX_UPLOAD_BYTES - bytes) * 8 * 1000) / CAPTURE_BITRATE);
}

/** "live-capture-2026-09-15-1430.webm", from the local time the capture began. */
function captureFileName(startedAt: number, ext: string): string {
  const d = new Date(startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
  return `live-capture-${stamp}.${ext}`;
}

/** RMS of one analyser frame, 0..1. */
function rmsLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centred = (buffer[i] - 128) / 128;
    sum += centred * centred;
  }
  // Speech rarely peaks above ~0.3 RMS; scale so a normal voice fills the meter.
  return Math.min(1, Math.sqrt(sum / buffer.length) * 3);
}

/** What went wrong asking for the microphone, said plainly. */
function describeMicFailure(failure: unknown): string {
  const name = failure instanceof DOMException ? failure.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was refused. Allow it in the address bar and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in or pick one in your system settings.";
  }
  if (name === "NotReadableError") {
    return "The microphone is in use by another application.";
  }
  return "The microphone could not be opened.";
}

export function useLiveRecorder(): LiveRecorder {
  // Decided once, before anything is asked for: a browser with no encoder is
  // blocked from the first render rather than after a permission prompt.
  const [container] = useState(pickContainer);
  const [status, setStatus] = useState<RecorderStatus>(container ? "requesting" : "blocked");
  const [reason, setReason] = useState<string | undefined>(
    container ? undefined : UNSUPPORTED_BROWSER
  );
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<readonly number[]>(() => Array(LEVEL_HISTORY).fill(0));
  const [bytes, setBytes] = useState(0);
  const [meetingAudio, setMeetingAudio] = useState<MeetingAudioState>(() =>
    canShareAudio() ? "none" : "unsupported"
  );
  const [limitReached, setLimitReached] = useState(false);
  // Bumped to run the setup effect again after the microphone was refused.
  const [attempt, setAttempt] = useState(0);

  // The graph and the encoder. Refs rather than state: none of it is rendered,
  // and the callbacks below must see the live objects, not a stale render.
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const startedAtRef = useRef(0);
  // The one promise every stop request shares, whoever asked first - the user
  // or the size ceiling. Set once; later callers await the same file.
  const finishRef = useRef<Promise<File> | null>(null);

  /** Let go of every device, node and timer. Idempotent. */
  const release = useCallback(() => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    recorderRef.current = null;
  }, []);

  /** Wire a stream into the recorded mix and the meter. */
  const mixIn = useCallback((stream: MediaStream) => {
    const context = contextRef.current;
    const destination = destinationRef.current;
    const analyser = analyserRef.current;
    if (!context || !destination || !analyser) return null;
    streamsRef.current.push(stream);
    const source = context.createMediaStreamSource(stream);
    source.connect(destination);
    source.connect(analyser);
    return source;
  }, []);

  const stop = useCallback((): Promise<File> => {
    if (finishRef.current) return finishRef.current;

    const recorder = recorderRef.current;
    if (!recorder || !container || recorder.state === "inactive") {
      return Promise.reject(new Error("Nothing is being recorded."));
    }

    setStatus("stopping");
    finishRef.current = new Promise<File>((resolve) => {
      // The final `dataavailable` lands before `stop` fires, so the chunks are
      // complete by the time this runs.
      recorder.onstop = () => {
        const file = new File(chunksRef.current, captureFileName(startedAtRef.current, container.ext), {
          type: container.mime.split(";")[0],
          lastModified: Date.now(),
        });
        release();
        setStatus("done");
        resolve(file);
      };
      recorder.stop();
    });
    return finishRef.current;
  }, [container, release]);

  const addMeetingAudio = useCallback(async () => {
    if (!canShareAudio()) {
      setMeetingAudio("unsupported");
      return;
    }
    let shared: MediaStream;
    try {
      // Video has to be requested for the picker to appear; it is dropped at once.
      shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      return; // The picker was dismissed. Nothing changes.
    }
    shared.getVideoTracks().forEach((t) => t.stop());

    const [track] = shared.getAudioTracks();
    if (!track) {
      setMeetingAudio("no-audio");
      return;
    }

    const audioOnly = new MediaStream([track]);
    const source = mixIn(audioOnly);
    if (!source) {
      track.stop();
      return;
    }
    setMeetingAudio("live");
    // The browser's own "Stop sharing" control ends the track. The mic is
    // unaffected; the graph just loses one input.
    track.addEventListener("ended", () => {
      source.disconnect();
      setMeetingAudio("ended");
    });
  }, [mixIn]);

  const retry = useCallback(() => {
    setReason(undefined);
    setStatus("requesting");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let clock: ReturnType<typeof setInterval> | undefined;
    let meter: ReturnType<typeof setInterval> | undefined;

    if (!container) return; // Already reported as blocked.

    const begin = async () => {
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (failure) {
        if (cancelled) return;
        setStatus("blocked");
        setReason(describeMicFailure(failure));
        return;
      }
      // The screen went away while the permission prompt was up.
      if (cancelled) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }

      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      contextRef.current = context;
      destinationRef.current = destination;
      analyserRef.current = analyser;
      // Created after a click, so it should already be running; resume is
      // the guard for a browser that starts every context suspended.
      void context.resume().catch(() => {});
      mixIn(mic);

      const recorder = new MediaRecorder(destination.stream, {
        mimeType: container.mime,
        audioBitsPerSecond: CAPTURE_BITRATE,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        chunksRef.current.push(event.data);
        bytesRef.current += event.data.size;
        setBytes(bytesRef.current);
        if (bytesRef.current >= MAX_UPLOAD_BYTES && !finishRef.current) {
          setLimitReached(true);
          void stop();
        }
      };
      recorderRef.current = recorder;
      recorder.start(CHUNK_MS);

      startedAtRef.current = Date.now();
      setStartedAt(startedAtRef.current);
      setStatus("recording");

      // Read off the wall clock rather than counted, so a throttled background
      // tab cannot leave the readout behind the length of the file.
      clock = setInterval(
        () => setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        1000
      );
      const frame = new Uint8Array(analyser.fftSize);
      meter = setInterval(() => {
        const level = rmsLevel(analyser, frame);
        setLevels((prev) => [...prev.slice(1), level]);
      }, LEVEL_SAMPLE_MS);
    };

    void begin();

    return () => {
      cancelled = true;
      clearInterval(clock);
      clearInterval(meter);
      // Abandoned mid-recording: drop the encoder without waiting for a file.
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      release();
    };
    // `attempt` is not read here; it is what makes a retry run the setup again.
  }, [container, mixIn, release, stop, attempt]);

  return {
    status,
    reason,
    startedAt,
    elapsedSec,
    levels,
    bytes,
    meetingAudio,
    addMeetingAudio,
    retry,
    limitReached,
    stop,
  };
}
