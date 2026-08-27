import React, { useState } from "react";
import type { Meeting } from "../mockData";
import { ArrowLeft, Article, Quotes, ListChecks, CheckCircle, FileText, CaretDown, CaretUp } from "@phosphor-icons/react";

interface MeetingDetailProps {
  meeting: Meeting;
  onBack: () => void;
}

export const MeetingDetail: React.FC<MeetingDetailProps> = ({ meeting, onBack }) => {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 animate-fade-in">
      
      {/* Back Link */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[12px] font-medium tracking-[0.2em] text-[#ffedd7] hover:underline cursor-pointer self-start uppercase active:scale-[0.98]"
      >
        <ArrowLeft size={14} />
        BACK TO MEMORIES
      </button>

      {/* Header Info Block */}
      <header className="flex flex-col gap-6">
        {/* Date and Tags */}
        <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium tracking-[0.15em] text-[#6c5f51]">
          <span>{meeting.date}</span>
          <span>·</span>
          <span>{meeting.time} ({meeting.duration})</span>
          <div className="flex gap-2">
            {meeting.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-[#dc5000] border border-[#dc5000]/40 px-2 py-0.5 rounded-[4px] uppercase"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-display-custom text-[#ffedd7] leading-[0.9] tracking-normal">
          {meeting.title}
        </h1>

        {/* Participants */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-medium tracking-[0.2em] text-[#6c5f51] uppercase">
            PARTICIPANTS:
          </span>
          <div className="flex flex-wrap gap-2">
            {meeting.participants.map((person) => (
              <span
                key={person}
                className="text-[11px] font-medium tracking-[0.1em] text-[#ffedd7] bg-[#382416] px-3 py-1 rounded-[12px] uppercase"
              >
                {person}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Dashed Line */}
      <div className="divider-dashed" />

      {/* Large Editorial AI Summary */}
      <section className="flex flex-col gap-4">
        <span className="text-[11px] font-medium tracking-[0.2em] text-[#dc5000] uppercase font-mono">
          AI SUMMARY INDEX
        </span>
        {/* 29px mixed-case body style according to typography specifications */}
        <p className="text-body-custom text-[#ffedd7] leading-[1.26] max-w-[65ch] font-normal font-sans">
          {meeting.summary}
        </p>
      </section>

      {/* Dashed Line */}
      <div className="divider-dashed" />

      {/* Structured Memory Sections */}
      <div className="flex flex-col gap-12">
        
        {/* Topics Discussed */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-[#40372e] pb-3">
            <Article size={18} className="text-[#6c5f51]" />
            <h2 className="text-subheading-custom text-[#ffedd7] tracking-[0.15em]">
              TOPICS DISCUSSED
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {meeting.topics.map((topic, i) => (
              <div key={i} className="flex flex-col gap-2 p-6 border border-[#40372e] rounded-[12px] bg-[#382416]/5">
                <span className="text-[12px] font-medium tracking-[0.15em] text-[#dc5000] uppercase">
                  {topic.title}
                </span>
                <p className="text-[14px] leading-relaxed text-[#ffedd7]/80">
                  {topic.details}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Decisions Made */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-[#40372e] pb-3">
            <CheckCircle size={18} className="text-[#6c5f51]" />
            <h2 className="text-subheading-custom text-[#ffedd7] tracking-[0.15em]">
              DECISIONS MADE
            </h2>
          </div>
          
          <ul className="flex flex-col gap-4 pl-4">
            {meeting.decisions.map((decision, i) => (
              <li key={i} className="text-[15px] leading-relaxed text-[#ffedd7] flex gap-3 items-start">
                <span className="text-[#dc5000] font-bold mt-[2px]">·</span>
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Action Items */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-[#40372e] pb-3">
            <ListChecks size={18} className="text-[#6c5f51]" />
            <h2 className="text-subheading-custom text-[#ffedd7] tracking-[0.15em]">
              ACTION ITEMS MAPPED
            </h2>
          </div>
          
          <div className="border border-[#40372e] rounded-[12px] overflow-hidden">
            <div className="grid grid-cols-12 bg-[#382416]/10 px-6 py-3 border-b border-[#40372e] text-[10px] font-medium tracking-[0.2em] text-[#6c5f51] uppercase">
              <div className="col-span-8">TASK DESCRIPTION</div>
              <div className="col-span-4 text-right">OWNER</div>
            </div>
            <div className="divide-y divide-[#40372e]/50">
              {meeting.actionItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 px-6 py-4 items-center text-[14px]">
                  <div className="col-span-8 text-[#ffedd7] pr-4">{item.item}</div>
                  <div className="col-span-4 text-right font-medium text-[#dc5000] tracking-[0.1em] uppercase text-[12px]">
                    {item.owner}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Quotes */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-[#40372e] pb-3">
            <Quotes size={18} className="text-[#6c5f51]" />
            <h2 className="text-subheading-custom text-[#ffedd7] tracking-[0.15em]">
              KEY QUOTES
            </h2>
          </div>
          
          <div className="flex flex-col gap-6">
            {meeting.quotes.map((q, i) => (
              <blockquote key={i} className="border-l-2 border-[#dc5000] pl-6 py-2 flex flex-col gap-2">
                {/* 29px mixed case rule reserved ONLY for AI summaries, keeping quotes clear at 18px */}
                <p className="text-[17px] italic leading-relaxed text-[#ffedd7]/90">
                  "{q.quote}"
                </p>
                <cite className="text-[11px] font-medium tracking-[0.2em] text-[#6c5f51] not-italic uppercase">
                  — {q.speaker}
                </cite>
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
          className="border border-[#ffedd7] rounded-[22.5px] px-6 py-[10px] text-[12px] font-medium tracking-[0.15em] text-[#ffedd7] uppercase hover:bg-[#ffedd7]/10 transition-colors cursor-pointer flex items-center gap-2 active:scale-[0.98]"
        >
          <FileText size={16} />
          {showTranscript ? "HIDE FULL TRANSCRIPT" : "VIEW FULL TRANSCRIPT"}
          {showTranscript ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>

        {showTranscript && (
          <div className="w-full mt-8 border border-[#40372e] rounded-[12px] p-6 bg-[#100904] flex flex-col gap-6 max-h-[400px] overflow-y-auto scrollbar-thin">
            {meeting.transcript.map((line, i) => (
              <div key={i} className="flex flex-col gap-1 border-l border-[#40372e]/50 pl-4 py-1 text-left">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-[#dc5000] uppercase">
                    {line.speaker}
                  </span>
                  <span className="text-[9px] font-medium text-[#6c5f51] font-mono">
                    {line.timestamp}
                  </span>
                </div>
                <p className="text-[14px] text-[#ffedd7] leading-relaxed font-sans mt-1">
                  {line.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
};
