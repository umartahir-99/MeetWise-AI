import React from "react";
import { Pause, Play, SpeakerHigh, Waveform } from "@phosphor-icons/react";
import type { MeetingAudio } from "../useMeetingAudio";
import { formatOffsetClock } from "../datetime";

/** A moment worth marking on the timeline - a pulled quote, usually. */
export interface PlayerMarker {
  startMs: number;
  label: string;
}

interface AudioPlayerProps {
  audio: MeetingAudio;
  markers?: PlayerMarker[];
}

/** What the transport is honestly able to play, said plainly under the bar. */
const MODE_NOTE: Record<MeetingAudio["mode"], string> = {
  recording: "PLAYING THE UPLOADED RECORDING",
  narration: "SYNTHESISED NARRATION — NO RECORDING ON FILE",
  silent: "NO AUDIO ON FILE — THE TIMELINE STILL SEEKS",
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audio, markers = [] }) => {
  const { mode, playing, positionMs, durationMs } = audio;
  const pct = (ms: number) => (durationMs > 0 ? (ms / durationMs) * 100 : 0);
  const playable = mode !== "silent";

  return (
    <div className="player">
      <button
        type="button"
        onClick={audio.toggle}
        disabled={!playable}
        className="player__toggle"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
      </button>

      <div className="player__body">
        <div className="player__timeline">
          <div className="player__track" aria-hidden="true">
            <div className="player__fill" style={{ width: `${pct(positionMs)}%` }} />
            {markers.map((marker, i) => (
              <span
                key={i}
                className="player__marker"
                style={{ left: `${pct(marker.startMs)}%` }}
                title={marker.label}
              />
            ))}
          </div>

          <input
            type="range"
            className="player__scrub"
            min={0}
            max={Math.max(1, durationMs)}
            step={1000}
            value={Math.round(positionMs)}
            onChange={(e) => audio.seek(Number(e.target.value))}
            aria-label="Seek through the meeting"
            aria-valuetext={`${formatOffsetClock(positionMs)} of ${formatOffsetClock(durationMs)}`}
          />
        </div>

        <div className="player__meta">
          <span className="player__note">
            {mode === "recording" ? <SpeakerHigh size={12} /> : <Waveform size={12} />}
            {MODE_NOTE[mode]}
          </span>
          <span className="player__time">
            {formatOffsetClock(positionMs)} / {formatOffsetClock(durationMs)}
          </span>
        </div>
      </div>
    </div>
  );
};
