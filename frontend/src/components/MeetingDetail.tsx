import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Meeting } from "../mockData";
import { ownerName } from "../mockData";
import { formatMeetingDate, formatOffsetClock, formatWhen } from "../datetime";
import { ArrowLeft, Article, Quotes, ListChecks, CheckCircle, FileText, CaretDown, CaretUp, Play } from "@phosphor-icons/react";
import { useMeetingAudio } from "../useMeetingAudio";
import { AudioPlayer } from "./AudioPlayer";
import { SpeakerPanel } from "./SpeakerPanel";
import type { SpeakerResolver } from "../speakers";

interface MeetingDetailProps {
  meeting: Meeting;
  /** The archive, so a voice can report how widely it has been heard. */
  meetings: Meeting[];
  onBack: () => void;
  /** Arriving from a citation: the moment to open on and play. */
  initialSeekMs?: number;
  speakers: SpeakerResolver;
  onNameVoice: (voicePrint: string, name: string) => void;
}

export const MeetingDetail: React.FC<MeetingDetailProps> = ({
  meeting,
  meetings,
  onBack,
  initialSeekMs,
  speakers,
  onNameVoice,
}) => {
  const [showTranscript, setShowTranscript] = useState(false);
  const audio = useMeetingAudio(meeting);
  const { playFrom, activeLineIndex } = audio;
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // The transport re-renders ten times a second while playing; the ticks on its
  // timeline only change when the meeting does.
  const quoteMarkers = useMemo(
    () => meeting.quotes.map((q) => ({ startMs: q.startMs, label: q.quote })),
    [meeting.quotes]
  );

  /**
   * A quote, a transcript line and a search citation all mean the same thing:
   * put the playhead there, show the words, and start talking.
   */
  const jumpTo = (ms: number) => {
    setShowTranscript(true);
    playFrom(ms);
  };

  // Landing here from a citation elsewhere in the app.
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    if (initialSeekMs === undefined || openedAt.current === initialSeekMs) return;
    openedAt.current = initialSeekMs;
    setShowTranscript(true);
    playFrom(initialSeekMs);
  }, [initialSeekMs, playFrom]);

  // Keep the line being spoken in view.
  useEffect(() => {
    if (!showTranscript || activeLineIndex < 0) return;
    const el = lineRefs.current[activeLineIndex];
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [showTranscript, activeLineIndex]);

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 animate-fade-in">

      {/* Back Link */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[12px] font-medium tracking-[0.2em] text-warm-cream hover:underline cursor-pointer self-start uppercase active:scale-[0.98]"
      >
        <ArrowLeft size={14} />
        BACK TO MEMORIES
      </button>

      {/* Transport - the memory is something you can hear, not only read.
          Ticks mark the moments the quotes below were pulled from. */}
      <div className="player-dock">
        <AudioPlayer audio={audio} markers={quoteMarkers} />
      </div>

      {/* Header Info Block */}
      <header className="flex flex-col gap-6">
        {/* Date and Tags */}
        <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium tracking-[0.15em] text-driftwood">
          <span>{formatMeetingDate(meeting.startedAt)}</span>
          <span>·</span>
          <span>{formatWhen(meeting.startedAt, meeting.durationMs)}</span>
          <span>·</span>
          <span className="uppercase">{ownerName(meeting.ownerId)}</span>
          <div className="flex gap-2">
            {meeting.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-ember-accent border border-ember-accent/40 px-2 py-0.5 rounded-[4px] uppercase"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal user-title">
          {meeting.title}
        </h1>

        {/* Participants */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-medium tracking-[0.2em] text-driftwood uppercase">
            PARTICIPANTS:
          </span>
          <div className="flex flex-wrap gap-2">
            {speakers.participants(meeting).map((person) => (
              <span
                key={person}
                className="text-[11px] font-medium tracking-[0.1em] text-warm-cream bg-bark-brown px-3 py-1 rounded-[12px] uppercase"
              >
                {person}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Dashed Line */}
      <div className="divider-dashed" />

      {/* Naming comes before reading: an unnamed voice makes everything below
          harder to follow, so the roster sits at the top of the memory. */}
      <SpeakerPanel
        meeting={meeting}
        meetings={meetings}
        speakers={speakers}
        onNameVoice={onNameVoice}
      />

      <div className="divider-dashed" />

      {/* Large Editorial AI Summary */}
      <section className="flex flex-col gap-4">
        <span className="text-[11px] font-medium tracking-[0.2em] text-ember-accent uppercase font-mono">
          AI SUMMARY INDEX
        </span>
        {/* 29px mixed-case body style according to typography specifications */}
        <p className="text-body-custom text-warm-cream leading-[1.26] max-w-[65ch] font-normal font-sans">
          {meeting.summary}
        </p>
      </section>

      {/* Dashed Line */}
      <div className="divider-dashed" />

      {/* Structured Memory Sections */}
      <div className="flex flex-col gap-12">

        {/* Topics Discussed */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-cork-border pb-3">
            <Article size={18} className="text-driftwood" />
            <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em]">
              TOPICS DISCUSSED
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {meeting.topics.map((topic, i) => (
              <div key={i} className="flex flex-col gap-2 p-6 border border-cork-border rounded-[12px] bg-bark-brown/5">
                <span className="text-[13px] font-medium tracking-[0.05em] text-ember-accent">
                  {topic.title}
                </span>
                <p className="text-[14px] leading-relaxed text-warm-cream/80">
                  {topic.details}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Decisions Made */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-cork-border pb-3">
            <CheckCircle size={18} className="text-driftwood" />
            <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em]">
              DECISIONS MADE
            </h2>
          </div>

          <ul className="flex flex-col gap-4 pl-4">
            {meeting.decisions.map((decision, i) => (
              <li key={i} className="text-[15px] leading-relaxed text-warm-cream flex gap-3 items-start">
                <span className="text-ember-accent font-bold mt-[2px]">·</span>
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Action Items */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-cork-border pb-3">
            <ListChecks size={18} className="text-driftwood" />
            <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em]">
              ACTION ITEMS MAPPED
            </h2>
          </div>

          <div className="border border-cork-border rounded-[12px] overflow-hidden">
            <div className="grid grid-cols-12 bg-bark-brown/10 px-6 py-3 border-b border-cork-border text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
              <div className="col-span-8">TASK DESCRIPTION</div>
              <div className="col-span-4 text-right">OWNER</div>
            </div>
            <div className="divide-y divide-cork-border/50">
              {meeting.actionItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 px-6 py-4 items-center text-[14px]">
                  <div className="col-span-8 text-warm-cream pr-4">{item.item}</div>
                  <div className="col-span-4 text-right font-medium text-ember-accent tracking-[0.1em] uppercase text-[12px]">
                    {speakers.nameOf(meeting, item.speakerId)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Quotes */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-cork-border pb-3">
            <Quotes size={18} className="text-driftwood" />
            <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em]">
              KEY QUOTES
            </h2>
          </div>

          <div className="flex flex-col gap-6">
            {meeting.quotes.map((q, i) => (
              <blockquote key={i} className="border-l-2 border-ember-accent pl-6 py-2 flex flex-col gap-2">
                {/* 29px mixed case rule reserved ONLY for AI summaries, keeping quotes clear at 18px */}
                <p className="text-[17px] italic leading-relaxed text-warm-cream/90">
                  "{q.quote}"
                </p>
                <cite className="text-[11px] font-medium tracking-[0.2em] text-driftwood not-italic uppercase">
                  — {speakers.nameOf(meeting, q.speakerId)}
                </cite>
                <button
                  type="button"
                  onClick={() => jumpTo(q.startMs)}
                  className="quote-cue"
                  aria-label={`Play from ${formatOffsetClock(q.startMs)}`}
                >
                  <Play size={11} weight="fill" />
                  HEAR IT — {formatOffsetClock(q.startMs)}
                </button>
              </blockquote>
            ))}
          </div>
        </section>

      </div>

      {/* Dashed Line */}
      <div className="divider-dashed" />

      {/* Transcript Collapsible Section */}
      <section className="flex flex-col items-center pt-4">
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="border border-warm-cream rounded-[22.5px] px-6 py-[10px] text-[12px] font-medium tracking-[0.15em] text-warm-cream uppercase hover:bg-warm-cream/10 transition-colors cursor-pointer flex items-center gap-2 active:scale-[0.98]"
        >
          <FileText size={16} />
          {showTranscript ? "HIDE FULL TRANSCRIPT" : "VIEW FULL TRANSCRIPT"}
          {showTranscript ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>

        {showTranscript && (
          <div
            data-lenis-prevent
            className="w-full mt-8 border border-cork-border rounded-[12px] p-6 bg-walnut-shadow flex flex-col gap-6 max-h-[400px] overflow-y-auto scrollbar-thin"
          >
            {meeting.transcript.map((line, i) => (
              <button
                key={i}
                type="button"
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                onClick={() => jumpTo(line.startMs)}
                className={`transcript-line ${i === activeLineIndex ? "transcript-line--active" : ""}`}
                aria-current={i === activeLineIndex ? "true" : undefined}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-ember-accent uppercase">
                    {speakers.nameOf(meeting, line.speakerId)}
                  </span>
                  <span className="text-[9px] font-medium text-driftwood font-mono tabular-nums">
                    {formatOffsetClock(line.startMs)}
                  </span>
                </div>
                <p className="text-[14px] text-warm-cream leading-relaxed font-sans mt-1">
                  {line.text}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

    </div>
  );
};
