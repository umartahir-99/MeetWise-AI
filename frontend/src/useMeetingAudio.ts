import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meeting, TranscriptLine } from "./mockData";

/**
 * Playback for a meeting, driven by the numeric offsets on its transcript.
 *
 * This is what turns a citation into "jump to 12:03 and play". Everything the
 * UI needs is a playhead in milliseconds, so a quote, a transcript line and a
 * search citation all seek the same way.
 *
 * There are two engines behind that playhead, because there are two kinds of
 * meeting:
 *
 * - `recording` - the meeting has a real `audioUrl` (an upload does, once its
 *   signed URL has been minted), so an `Audio` element plays the actual file.
 * - `narration` - there is no audio file: the sample archive never had one,
 *   and a meeting whose recording was discarded no longer does. Rather
 *   than pretend, the browser's speech synthesis reads the transcript line the
 *   playhead is sitting on. It is a stand-in for the recording, labelled as
 *   one in the UI, and it makes the interaction real rather than mimed.
 * - `silent` - neither is available. The playhead still seeks and highlights,
 *   but nothing is claimed to be audible.
 */
export type PlaybackMode = "recording" | "narration" | "silent";

/**
 * Narration has no dead air to play through - there is no recording, only the
 * lines. A gap longer than this is skipped rather than waited out.
 */
const SILENCE_SKIP_MS = 1200;

/** The playhead only needs to be accurate to about a tenth of a second. */
const TICK_MS = 100;

export interface MeetingAudio {
  mode: PlaybackMode;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  /** Index into `meeting.transcript` of the line being spoken, or last passed. */
  activeLineIndex: number;
  toggle: () => void;
  pause: () => void;
  /** Move the playhead without starting playback. */
  seek: (ms: number) => void;
  /** Move the playhead and play from there - the citation gesture. */
  playFrom: (ms: number) => void;
}

function canNarrate(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

/** Index of the last line that has started by `ms`, or -1 before the first. */
function lineIndexAt(transcript: TranscriptLine[], ms: number): number {
  let index = -1;
  for (let i = 0; i < transcript.length; i += 1) {
    if (transcript[i].startMs > ms) break;
    index = i;
  }
  return index;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(0, value), Math.max(0, max));
}

export function useMeetingAudio(meeting: Meeting): MeetingAudio {
  const { transcript, audioUrl } = meeting;

  const mode: PlaybackMode = audioUrl
    ? "recording"
    : transcript.length > 0 && canNarrate()
      ? "narration"
      : "silent";

  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Narration has no media element to ask, so the playhead is a wall clock:
  // where it was when playback started, plus how long ago that was.
  const clockRef = useRef({ basePos: 0, startedAt: 0 });
  const spokenRef = useRef(-1);

  // A job whose length could not be read still has a transcript to play.
  const durationMs = useMemo(() => {
    const lastLineEnd = transcript.length ? transcript[transcript.length - 1].endMs : 0;
    return Math.max(meeting.durationMs || 0, lastLineEnd);
  }, [meeting.durationMs, transcript]);

  const activeLineIndex = useMemo(
    () => lineIndexAt(transcript, positionMs),
    [transcript, positionMs]
  );

  // The real file, when there is one.
  useEffect(() => {
    if (mode !== "recording" || !audioUrl) return;

    const el = new Audio(audioUrl);
    el.preload = "metadata";
    audioRef.current = el;

    const onEnded = () => setPlaying(false);
    el.addEventListener("ended", onEnded);

    return () => {
      el.pause();
      el.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [mode, audioUrl]);

  // Never leave a voice talking to an empty room.
  useEffect(() => {
    return () => {
      if (canNarrate()) window.speechSynthesis.cancel();
    };
  }, []);

  // Advance the playhead. Position is read from the clock rather than
  // accumulated, so a slow tick cannot make playback drift.
  useEffect(() => {
    if (!playing) return;

    const timer = setInterval(() => {
      if (mode === "recording") {
        const el = audioRef.current;
        if (el) setPositionMs(el.currentTime * 1000);
        return;
      }

      const { basePos, startedAt } = clockRef.current;
      let next = basePos + (performance.now() - startedAt);

      if (mode === "narration") {
        const current = transcript[lineIndexAt(transcript, next)];
        const upcoming = transcript.find((line) => line.startMs > next);
        // No current line also covers the run-up before the first one, which
        // is otherwise minutes of silence on a meeting that starts at 05:00.
        const nothingBeingSaid = !current || next > current.endMs;

        if (nothingBeingSaid && upcoming && upcoming.startMs - next > SILENCE_SKIP_MS) {
          next = upcoming.startMs;
          clockRef.current = { basePos: next, startedAt: performance.now() };
        } else if (nothingBeingSaid && !upcoming) {
          // Past the last line there is nothing left to narrate; do not run out
          // the remainder of the meeting in silence.
          setPositionMs(durationMs);
          setPlaying(false);
          return;
        }
      }

      if (next >= durationMs) {
        setPositionMs(durationMs);
        setPlaying(false);
        return;
      }
      setPositionMs(next);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [playing, mode, transcript, durationMs]);

  // Speak whichever line the playhead has moved onto.
  useEffect(() => {
    if (mode !== "narration" || !playing) return;
    if (activeLineIndex < 0 || activeLineIndex === spokenRef.current) return;

    spokenRef.current = activeLineIndex;
    const utterance = new SpeechSynthesisUtterance(transcript[activeLineIndex].text);
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [mode, playing, activeLineIndex, transcript]);

  const pause = useCallback(() => {
    setPlaying(false);
    audioRef.current?.pause();
    if (canNarrate()) window.speechSynthesis.cancel();
  }, []);

  const moveTo = useCallback(
    (ms: number) => {
      const target = clamp(ms, durationMs);
      setPositionMs(target);
      // Force the line under the new playhead to be spoken, even if the
      // playhead has not left the line it was already on.
      spokenRef.current = -1;
      clockRef.current = { basePos: target, startedAt: performance.now() };
      if (audioRef.current) audioRef.current.currentTime = target / 1000;
      return target;
    },
    [durationMs]
  );

  const seek = useCallback(
    (ms: number) => {
      moveTo(ms);
      if (canNarrate()) window.speechSynthesis.cancel();
    },
    [moveTo]
  );

  const playFrom = useCallback(
    (ms: number) => {
      if (mode === "silent") {
        seek(ms);
        return;
      }
      const target = moveTo(ms);
      if (mode === "recording") {
        const el = audioRef.current;
        if (el) {
          el.currentTime = target / 1000;
          // Arriving from a citation can land outside the click that caused it,
          // and a browser may refuse to start. Stay parked rather than lie.
          void el.play().catch(() => setPlaying(false));
        }
      }
      setPlaying(true);
    },
    [mode, moveTo, seek]
  );

  const toggle = useCallback(() => {
    if (playing) {
      pause();
      return;
    }
    playFrom(positionMs >= durationMs ? 0 : positionMs);
  }, [playing, pause, playFrom, positionMs, durationMs]);

  return {
    mode,
    playing,
    positionMs,
    durationMs,
    activeLineIndex,
    toggle,
    pause,
    seek,
    playFrom,
  };
}
