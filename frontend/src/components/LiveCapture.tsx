import React, { useState, useEffect, useRef } from "react";
import { CURRENT_USER_ID, MOCK_LIVE_SPEECH_STREAM, timed } from "../mockData";
import type { Meeting, Topic } from "../mockData";
import { formatOffsetClock } from "../datetime";
import { Record, Check, Prohibit } from "@phosphor-icons/react";

/**
 * The scripted stream names who is talking; real diarization would not. These
 * are the voice prints those people are already known by, so a saved capture
 * lands in the directory rather than inventing new strangers.
 */
const LIVE_VOICE_PRINTS: Record<string, string> = {
  "Sarah Chen": "vp-sarah-chen",
  "Alex Rivera": "vp-alex-rivera",
  "Jane Dong": "vp-jane-dong",
};

interface LiveAction {
  item: string;
  /**
   * Exactly as the stream names the speaker. It is matched back to a voice on
   * save, so uppercasing it here would break that lookup - and casing is a
   * display decision anyway, applied where the owner is rendered.
   */
  owner: string;
}

interface LiveInsight {
  topic: Topic;
  decision?: string;
  action?: LiveAction;
}

/**
 * What the analysis pass notices as each topic comes up in the script.
 *
 * Keyed by `associatedTopic` on the stream, so revealing a topic is a lookup
 * rather than a branch per topic - and the strings live here once, instead of
 * being repeated in the fallback used when a capture is saved early.
 */
const LIVE_ANALYSIS: Record<string, LiveInsight> = {
  "IndexDB Speed Tests": {
    topic: {
      title: "IndexedDB speed tests",
      details:
        "Verified IndexedDB write times are under 3ms using binary serialization, avoiding UI thread lockups.",
    },
    decision: "Utilize IndexedDB as the primary local cache store for encrypted transcripts.",
  },
  "Key Rotation Security": {
    topic: {
      title: "Key rotation security",
      details:
        "Confirmed WebCrypto API handles key rotations every 24 hours on mobile devices without thread blockage.",
    },
    decision: "Execute key rotations automatically every 24 hours on client device idles.",
    action: {
      item: "Audit WebCrypto API compatibility on legacy Android webviews",
      owner: "Alex Rivera",
    },
  },
  "Active Memory Caching": {
    topic: {
      title: "Active memory caching",
      details:
        "Established a 5-minute sliding window cache for raw transcript processing before disk write.",
    },
    action: { item: "Implement binary serialization client-side wrappers", owner: "Jane Dong" },
  },
};

/* Saved before the script reached these points: stand in with what the pass
   would have found, drawn from the same table so nothing is written twice. */
const INSIGHTS = Object.values(LIVE_ANALYSIS);
const FALLBACK_TOPICS: Topic[] = [INSIGHTS[0].topic];
const FALLBACK_DECISIONS = INSIGHTS.map((i) => i.decision).filter(
  (d): d is string => d !== undefined
);
const FALLBACK_ACTION_ITEMS = INSIGHTS.map((i) => i.action).filter(
  (a): a is LiveAction => a !== undefined
);

/** Pulled for the summary, so it needs to be findable in the captured audio. */
const HEADLINE_QUOTE =
  "Binary serialization is showing zero lockups. Writing 10MB of transcript chunks takes less than 3 milliseconds.";

/** A scripted line, stamped with the moment it actually reached the screen. */
type CapturedLine = (typeof MOCK_LIVE_SPEECH_STREAM)[number] & { startMs: number };

interface LiveCaptureProps {
  onSaveMeeting: (meeting: Meeting) => void;
  onCancel: () => void;
}

export const LiveCapture: React.FC<LiveCaptureProps> = ({ onSaveMeeting, onCancel }) => {
  const [streamIndex, setStreamIndex] = useState(0);
  const [transcript, setTranscript] = useState<CapturedLine[]>([]);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // When recording began. Every line is stamped as an offset from this, so the
  // saved meeting carries real timings rather than numbers out of a fixture.
  // Read on mount rather than during render, which has to stay pure.
  const startedAtRef = useRef(0);
  const elapsedMs = () => (startedAtRef.current ? Date.now() - startedAtRef.current : 0);

  // AI Notes derived state
  const [topics, setTopics] = useState<Topic[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [actionItems, setActionItems] = useState<LiveAction[]>([]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Meeting timer. Read off the wall clock rather than counted up, so a
  // throttled background tab cannot leave the readout behind the real elapsed
  // time - which is also what the saved offsets are measured against.
  useEffect(() => {
    startedAtRef.current = Date.now();
    const timer = setInterval(() => {
      setSecondsElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Transcript streaming simulation
  useEffect(() => {
    if (streamIndex < MOCK_LIVE_SPEECH_STREAM.length) {
      const delay = streamIndex === 0 ? 500 : 3500; // Fast first line, then every 3.5s
      const timer = setTimeout(() => {
        const nextLine = MOCK_LIVE_SPEECH_STREAM[streamIndex];
        setTranscript((prev) => [
          ...prev,
          { ...nextLine, startMs: elapsedMs() },
        ]);
        setStreamIndex((prev) => prev + 1);

        // Incrementally reveal AI summary items based on conversation progress
        const insight = nextLine.associatedTopic
          ? LIVE_ANALYSIS[nextLine.associatedTopic]
          : undefined;

        if (insight) {
          const { topic, decision, action } = insight;
          setTopics((prev) => [...prev, topic]);
          if (decision) setDecisions((prev) => [...prev, decision]);
          if (action) setActionItems((prev) => [...prev, action]);
        }
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [streamIndex]);

  // Autoscroll transcript container
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleEndAndSave = () => {
    // Anchor the pulled quote to the moment it was actually said, so it stays
    // playable in the saved memory.
    const quotedLine = transcript.find((t) => t.text.includes(HEADLINE_QUOTE));

    // Turn the voices heard into slots, the way the ingest pipeline would.
    const heard = Array.from(new Set(transcript.map((t) => t.speaker)));
    const speakers = heard.map((name, i) => ({
      id: `speaker-${i + 1}`,
      label: `SPEAKER ${i + 1}`,
      voicePrint: LIVE_VOICE_PRINTS[name] ?? `vp-live-${Date.now().toString(36)}-${i}`,
    }));
    const slotFor = (name: string) => speakers[heard.indexOf(name)]?.id ?? "speaker-1";

    // Construct the fully structured memory from the captured live sync
    const finalMeeting: Meeting = {
      id: `live-sync-${Date.now()}`,
      title: "Daily sync: local cache speed & encryption profile",
      startedAt: new Date(startedAtRef.current || Date.now()).toISOString(),
      durationMs: elapsedMs(),
      ownerId: CURRENT_USER_ID,
      speakers,
      gist: "Audited client-side cache speeds and locked down indexDB binary encryption routines.",
      summary: "The engineering team reviewed security and write speeds for local databases. We successfully confirmed that IndexedDB binary structures prevent frame drops, keeping latency under 3ms, while WebCrypto performs 24-hour key rotations seamlessly.",
      topics: topics.length > 0 ? topics : FALLBACK_TOPICS,
      decisions: decisions.length > 0 ? decisions : FALLBACK_DECISIONS,
      actionItems: (actionItems.length > 0 ? actionItems : FALLBACK_ACTION_ITEMS).map((a) => ({
        item: a.item,
        speakerId: slotFor(a.owner),
      })),
      quotes: [
        {
          quote: HEADLINE_QUOTE,
          speakerId: slotFor("Jane Dong"),
          startMs: quotedLine?.startMs ?? 0
        }
      ],
      transcript: timed(
        transcript.map((t) => ({ speakerId: slotFor(t.speaker), text: t.text, startMs: t.startMs }))
      ),
      tags: ["Engineering", "Security", "Live"],
      status: "ready"
    };

    onSaveMeeting(finalMeeting);
  };

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-9 min-h-[calc(100vh-64px)]">

      {/* LEFT: Live Scrolling Transcript (col-span 7) */}
      <section className="lg:col-span-7 flex flex-col gap-6 border border-cork-border rounded-[12px] p-6 bg-walnut-shadow h-[600px] lg:h-[700px] relative overflow-hidden">

        {/* Status Bar */}
        <div className="flex items-center justify-between border-b border-cork-border/50 pb-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ember-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-ember-accent"></span>
            </span>
            <span className="text-[12px] font-medium tracking-[0.2em] text-warm-cream uppercase">
              LIVE CAPTURING
            </span>
          </div>
          <div className="text-[12px] font-medium tracking-[0.15em] text-driftwood font-mono">
            ELAPSED: {formatOffsetClock(secondsElapsed * 1000)}
          </div>
        </div>

        {/* Scrolling Transcript Area */}
        {/* data-lenis-prevent: a wheel over the transcript scrolls the
            transcript, not the page underneath it. */}
        <div
          data-lenis-prevent
          className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6 scrollbar-thin"
        >
          {transcript.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-driftwood">
              <Record size={32} className="animate-pulse" />
              <p className="text-[14px] font-medium tracking-[0.1em] uppercase">
                Waiting for speech input...
              </p>
            </div>
          ) : (
            transcript.map((line, i) => (
              <div key={i} className="flex flex-col gap-2 border-l border-cork-border/40 pl-4 py-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-ember-accent uppercase">
                    {line.speaker}
                  </span>
                  <span className="text-[9px] font-medium text-driftwood font-mono">
                    {formatOffsetClock(line.startMs)}
                  </span>
                </div>
                {/* 29px body-text rule does not apply to speech bubbles, keeping speech comfortable */}
                <p className="text-[15px] text-warm-cream leading-relaxed font-sans">
                  {line.text}
                </p>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 pt-4 border-t border-cork-border/50 bg-walnut-shadow/90">
          <button
            onClick={handleEndAndSave}
            className="flex-1 bg-warm-cream text-walnut-shadow rounded-[36px] px-6 py-[14px] text-[12px] md:text-[14px] font-medium tracking-[0.15em] uppercase hover:bg-warm-cream/90 transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Check size={16} weight="bold" />
            END & SAVE MEMORY
          </button>

          <button
            onClick={onCancel}
            className="px-6 py-[14px] border border-warm-cream rounded-[22.5px] text-[12px] md:text-[14px] font-medium tracking-[0.15em] text-warm-cream uppercase hover:bg-warm-cream/10 transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Prohibit size={16} />
            ABANDON
          </button>
        </div>
      </section>

      {/* RIGHT: Real-time AI Summary Panel (col-span 5) */}
      <section
        data-lenis-prevent
        className="lg:col-span-5 flex flex-col gap-6 border border-cork-border rounded-[12px] p-6 bg-bark-brown/10 h-[600px] lg:h-[700px] overflow-y-auto"
      >
        <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em] border-b border-cork-border/50 pb-4">
          REAL-TIME AI PROCESS
        </h2>

        {topics.length === 0 && decisions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-driftwood">
            <p className="text-[12px] font-medium tracking-[0.1em] uppercase leading-relaxed max-w-[30ch]">
              Synthesis will appear incrementally as speech patterns are analyzed.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">

            {/* Live Topics */}
            {topics.length > 0 && (
              <div className="flex flex-col gap-4">
                <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent uppercase font-mono">
                  TOPICS IDENTIFIED
                </span>
                <div className="flex flex-col gap-4">
                  {topics.map((topic, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <span className="text-[12px] font-medium tracking-[0.15em] text-warm-cream">
                        {topic.title}
                      </span>
                      {/* Mixed-case 29px rule applies to AI summaries, but inside panels we keep text density high by using smaller mixed-case */}
                      <p className="text-[14px] font-normal leading-relaxed text-warm-cream/80">
                        {topic.details}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topics.length > 0 && decisions.length > 0 && <div className="divider-dashed" />}

            {/* Live Decisions */}
            {decisions.length > 0 && (
              <div className="flex flex-col gap-4">
                <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent uppercase font-mono">
                  DECISIONS REGISTERED
                </span>
                <ul className="flex flex-col gap-3">
                  {decisions.map((decision, i) => (
                    <li key={i} className="text-[14px] leading-relaxed text-warm-cream flex gap-2">
                      <span className="text-ember-accent font-bold">·</span>
                      <span>{decision}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(topics.length > 0 || decisions.length > 0) && actionItems.length > 0 && <div className="divider-dashed" />}

            {/* Live Action Items */}
            {actionItems.length > 0 && (
              <div className="flex flex-col gap-4">
                <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent uppercase font-mono">
                  ACTION ITEMS MAPPED
                </span>
                <div className="flex flex-col gap-3">
                  {actionItems.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1 border-l border-warm-cream/20 pl-3">
                      <p className="text-[13px] text-warm-cream">{item.item}</p>
                      {/* The owner is a person's name, stored as typed; the
                          uppercase treatment is a label decision made here. */}
                      <span className="text-[10px] font-medium tracking-[0.1em] text-driftwood uppercase">
                        OWNER: {item.owner}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </section>

    </div>
  );
};
