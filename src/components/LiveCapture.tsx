import React, { useState, useEffect, useRef } from "react";
import { MOCK_LIVE_SPEECH_STREAM } from "../mockData";
import type { Meeting } from "../mockData";
import { Record, Check, Prohibit } from "@phosphor-icons/react";

interface LiveCaptureProps {
  onSaveMeeting: (meeting: Meeting) => void;
  onCancel: () => void;
}

export const LiveCapture: React.FC<LiveCaptureProps> = ({ onSaveMeeting, onCancel }) => {
  const [streamIndex, setStreamIndex] = useState(0);
  const [transcript, setTranscript] = useState<typeof MOCK_LIVE_SPEECH_STREAM>([]);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  
  // AI Notes derived state
  const [topics, setTopics] = useState<{ title: string; details: string }[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [actionItems, setActionItems] = useState<{ item: string; owner: string }[]>([]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Meeting timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Transcript streaming simulation
  useEffect(() => {
    if (streamIndex < MOCK_LIVE_SPEECH_STREAM.length) {
      const delay = streamIndex === 0 ? 500 : 3500; // Fast first line, then every 3.5s
      const timer = setTimeout(() => {
        const nextLine = MOCK_LIVE_SPEECH_STREAM[streamIndex];
        setTranscript((prev) => [...prev, nextLine]);
        setStreamIndex((prev) => prev + 1);

        // Incrementally reveal AI summary items based on conversation progress
        if (nextLine.associatedTopic) {
          if (nextLine.associatedTopic === "IndexDB Speed Tests") {
            setTopics((prev) => [
              ...prev,
              {
                title: "INDEXDB SPEED TESTS",
                details: "Verified IndexedDB write times are under 3ms using binary serialization, avoiding UI thread lockups."
              }
            ]);
            setDecisions((prev) => [...prev, "Utilize IndexedDB as the primary local cache store for encrypted transcripts."]);
          } else if (nextLine.associatedTopic === "Key Rotation Security") {
            setTopics((prev) => [
              ...prev,
              {
                title: "KEY ROTATION SECURITY",
                details: "Confirmed WebCrypto API handles key rotations every 24 hours on mobile devices without thread blockage."
              }
            ]);
            setDecisions((prev) => [...prev, "Execute key rotations automatically every 24 hours on client device idles."]);
            setActionItems((prev) => [
              ...prev,
              { item: "Audit WebCrypto API compatibility on legacy Android webviews", owner: "ALEX RIVERA" }
            ]);
          } else if (nextLine.associatedTopic === "Active Memory Caching") {
            setTopics((prev) => [
              ...prev,
              {
                title: "ACTIVE MEMORY CACHING",
                details: "Established a 5-minute sliding window cache for raw transcript processing before disk write."
              }
            ]);
            setActionItems((prev) => [
              ...prev,
              { item: "Implement binary serialization client-side wrappers", owner: "JANE DONG" }
            ]);
          }
        }
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [streamIndex]);

  // Autoscroll transcript container
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Format time (MM:SS)
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const handleEndAndSave = () => {
    // Construct the fully structured memory from the captured live sync
    const finalMeeting: Meeting = {
      id: `live-sync-${Date.now()}`,
      title: "DAILY SYNC: LOCAL CACHE SPEED & ENCRYPTION PROFILE",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase(),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      duration: formatTime(secondsElapsed),
      participants: ["SARAH CHEN", "ALEX RIVERA", "JANE DONG"],
      gist: "Audited client-side cache speeds and locked down indexDB binary encryption routines.",
      summary: "The engineering team reviewed security and write speeds for local databases. We successfully confirmed that IndexedDB binary structures prevent frame drops, keeping latency under 3ms, while WebCrypto performs 24-hour key rotations seamlessly.",
      topics: topics.length > 0 ? topics : [
        {
          title: "INDEXDB SPEED TESTS",
          details: "Verified IndexedDB write times are under 3ms using binary serialization, avoiding UI thread lockups."
        }
      ],
      decisions: decisions.length > 0 ? decisions : [
        "Utilize IndexedDB as the primary local cache store for encrypted transcripts.",
        "Execute key rotations automatically every 24 hours on client device idles."
      ],
      actionItems: actionItems.length > 0 ? actionItems : [
        { item: "Implement binary serialization client-side wrappers", owner: "JANE DONG" },
        { item: "Audit WebCrypto API compatibility on legacy Android webviews", owner: "ALEX RIVERA" }
      ],
      quotes: [
        {
          quote: "Binary serialization is showing zero lockups. Writing 10MB of transcript chunks takes less than 3 milliseconds.",
          speaker: "JANE DONG"
        }
      ],
      transcript: transcript.map((t) => ({
        speaker: t.speaker,
        text: t.text,
        timestamp: t.timestamp.substring(3, 8), // extract MM:SS
      })),
      tags: ["ENGINEERING", "SECURITY", "LIVE"]
    };

    onSaveMeeting(finalMeeting);
  };

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-9 min-h-[calc(100vh-64px)]">
      
      {/* LEFT: Live Scrolling Transcript (col-span 7) */}
      <section className="lg:col-span-7 flex flex-col gap-6 border border-[#40372e] rounded-[12px] p-6 bg-[#100904] h-[600px] lg:h-[700px] relative overflow-hidden">
        
        {/* Status Bar */}
        <div className="flex items-center justify-between border-b border-[#40372e]/50 pb-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#dc5000] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#dc5000]"></span>
            </span>
            <span className="text-[12px] font-medium tracking-[0.2em] text-[#ffedd7] uppercase">
              LIVE CAPTURING
            </span>
          </div>
          <div className="text-[12px] font-medium tracking-[0.15em] text-[#6c5f51] font-mono">
            ELAPSED: {formatTime(secondsElapsed)}
          </div>
        </div>

        {/* Scrolling Transcript Area */}
        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6 scrollbar-thin">
          {transcript.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-[#6c5f51]">
              <Record size={32} className="animate-pulse" />
              <p className="text-[14px] font-medium tracking-[0.1em] uppercase">
                Waiting for speech input...
              </p>
            </div>
          ) : (
            transcript.map((line, i) => (
              <div key={i} className="flex flex-col gap-2 border-l border-[#40372e]/40 pl-4 py-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-[#dc5000]">
                    {line.speaker}
                  </span>
                  <span className="text-[9px] font-medium text-[#6c5f51] font-mono">
                    {line.timestamp}
                  </span>
                </div>
                {/* 29px body-text rule does not apply to speech bubbles, keeping speech comfortable */}
                <p className="text-[15px] text-[#ffedd7] leading-relaxed font-sans">
                  {line.text}
                </p>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 pt-4 border-t border-[#40372e]/50 bg-[#100904]/90">
          <button
            onClick={handleEndAndSave}
            className="flex-1 bg-[#ffedd7] text-[#100904] rounded-[36px] px-6 py-[14px] text-[12px] md:text-[14px] font-medium tracking-[0.15em] uppercase hover:bg-[#ffedd7]/90 transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Check size={16} weight="bold" />
            END & SAVE MEMORY
          </button>
          
          <button
            onClick={onCancel}
            className="px-6 py-[14px] border border-[#ffedd7] rounded-[22.5px] text-[12px] md:text-[14px] font-medium tracking-[0.15em] text-[#ffedd7] uppercase hover:bg-[#ffedd7]/10 transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Prohibit size={16} />
            ABANDON
          </button>
        </div>
      </section>

      {/* RIGHT: Real-time AI Summary Panel (col-span 5) */}
      <section className="lg:col-span-5 flex flex-col gap-6 border border-[#40372e] rounded-[12px] p-6 bg-[#382416]/10 h-[600px] lg:h-[700px] overflow-y-auto">
        <h2 className="text-subheading-custom text-[#ffedd7] tracking-[0.15em] border-b border-[#40372e]/50 pb-4">
          REAL-TIME AI PROCESS
        </h2>

        {topics.length === 0 && decisions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-[#6c5f51]">
            <p className="text-[12px] font-medium tracking-[0.1em] uppercase leading-relaxed max-w-[30ch]">
              Synthesis will appear incrementally as speech patterns are analyzed.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            
            {/* Live Topics */}
            {topics.length > 0 && (
              <div className="flex flex-col gap-4">
                <span className="text-[10px] font-medium tracking-[0.25em] text-[#dc5000] uppercase font-mono">
                  TOPICS IDENTIFIED
                </span>
                <div className="flex flex-col gap-4">
                  {topics.map((topic, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <span className="text-[12px] font-medium tracking-[0.15em] text-[#ffedd7]">
                        {topic.title}
                      </span>
                      {/* Mixed-case 29px rule applies to AI summaries, but inside panels we keep text density high by using smaller mixed-case */}
                      <p className="text-[14px] font-normal leading-relaxed text-[#ffedd7]/80">
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
                <span className="text-[10px] font-medium tracking-[0.25em] text-[#dc5000] uppercase font-mono">
                  DECISIONS REGISTERED
                </span>
                <ul className="flex flex-col gap-3">
                  {decisions.map((decision, i) => (
                    <li key={i} className="text-[14px] leading-relaxed text-[#ffedd7] flex gap-2">
                      <span className="text-[#dc5000] font-bold">·</span>
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
                <span className="text-[10px] font-medium tracking-[0.25em] text-[#dc5000] uppercase font-mono">
                  ACTION ITEMS MAPPED
                </span>
                <div className="flex flex-col gap-3">
                  {actionItems.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1 border-l border-[#ffedd7]/20 pl-3">
                      <p className="text-[13px] text-[#ffedd7]">{item.item}</p>
                      <span className="text-[10px] font-medium tracking-[0.1em] text-[#6c5f51]">
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
