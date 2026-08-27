import React, { useState, useMemo } from "react";
import type { Meeting } from "../mockData";
import { MagnifyingGlass, Funnel, X } from "@phosphor-icons/react";
import { motion } from "motion/react";
import {
  cardHover,
  cardTap,
  fadeInFrom,
  fadeUp,
  markerPop,
  staggerContainer,
  viewportOnce,
} from "../motion";

interface ArchiveProps {
  meetings: Meeting[];
  onSelectMeeting: (id: string) => void;
}

export const Archive: React.FC<ArchiveProps> = ({ meetings, onSelectMeeting }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  // Extract all unique tags and participants for filter lists
  const { allTags, allParticipants } = useMemo(() => {
    const tags = new Set<string>();
    const participants = new Set<string>();
    meetings.forEach((m) => {
      m.tags.forEach((tag) => tags.add(tag));
      m.participants.forEach((p) => participants.add(p));
    });
    return {
      allTags: Array.from(tags),
      allParticipants: Array.from(participants),
    };
  }, [meetings]);

  // Filtered meetings list
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchesSearch =
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.gist.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.summary.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTag = selectedTag ? m.tags.includes(selectedTag) : true;
      const matchesParticipant = selectedParticipant ? m.participants.includes(selectedParticipant) : true;

      return matchesSearch && matchesTag && matchesParticipant;
    });
  }, [meetings, searchTerm, selectedTag, selectedParticipant]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedTag(null);
    setSelectedParticipant(null);
  };

  const hasActiveFilters = searchTerm !== "" || selectedTag !== null || selectedParticipant !== null;

  return (
    <div className="px-6 md:px-12 max-w-[1200px] mx-auto flex flex-col gap-12 w-full">
      
      {/* Archive Header */}
      <motion.header
        className="section-opener"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <span className="section-eyebrow">SYSTEM ARCHIVE</span>
        <h2 className="text-display-custom text-ink leading-[0.9] tracking-normal select-none">
          HISTORICAL
          <br />
          MEMORIES
        </h2>
        <p className="text-[14px] md:text-[15px] font-medium tracking-[0.1em] text-ink-muted uppercase max-w-[46ch]">
          All indexed conversations ({filteredMeetings.length} of {meetings.length} shown)
        </p>
      </motion.header>

      {/* Dashed Line */}
      <div className="divider-dashed-wheat" />

      {/* Search and Filters Section */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* LEFT: Search Input (col 5) */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <span className="text-[10px] font-medium tracking-[0.2em] text-ink-muted uppercase font-mono">
            SEARCH TERM
          </span>
          <div className="relative flex items-center border-b border-ink/25 py-2 focus-within:border-ink transition-colors">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search title, description..."
              className="w-full bg-transparent text-ink placeholder-ink-muted focus:outline-none text-[14px] pr-8 uppercase"
            />
            <MagnifyingGlass size={16} className="absolute right-0 text-ink-muted" />
          </div>
        </div>

        {/* MID: Filters (col 7) */}
        <div className="md:col-span-7 flex flex-wrap gap-8">
          
          {/* Tag Filter */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-medium tracking-[0.2em] text-ink-muted uppercase font-mono">
              FILTER BY TAG
            </span>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`text-[11px] font-medium tracking-[0.1em] px-3 py-1 rounded-[12px] uppercase border cursor-pointer transition-colors active:scale-95 ${
                    selectedTag === tag
                      ? "bg-ink text-cream-bg border-ink"
                      : "bg-transparent text-ink border-wheat-border hover:border-olive"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Participant Filter */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-medium tracking-[0.2em] text-ink-muted uppercase font-mono">
              FILTER BY SPEAKER
            </span>
            <div className="flex flex-wrap gap-2">
              {allParticipants.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedParticipant(selectedParticipant === p ? null : p)}
                  className={`text-[11px] font-medium tracking-[0.1em] px-3 py-1 rounded-[12px] uppercase border cursor-pointer transition-colors active:scale-95 ${
                    selectedParticipant === p
                      ? "bg-ink text-cream-bg border-ink"
                      : "bg-transparent text-ink border-wheat-border hover:border-olive"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Clear Filters Button (If active) */}
        {hasActiveFilters && (
          <div className="md:col-span-12 self-start flex justify-end">
            <button
              onClick={handleResetFilters}
              className="text-[11px] font-medium tracking-[0.15em] text-ember-deep hover:underline cursor-pointer flex items-center gap-1.5 uppercase active:scale-95"
            >
              <X size={14} weight="bold" />
              CLEAR ACTIVE FILTERS
            </button>
          </div>
        )}
      </section>

      {/* Dashed Line */}
      <div className="divider-dashed-wheat" />

      {/* Meeting Archive Entries */}
      <section className="flex flex-col gap-8">
        {filteredMeetings.length === 0 ? (
          <div className="border border-wheat-border border-dashed rounded-[12px] p-12 text-center text-ink-muted flex flex-col gap-3 items-center">
            <Funnel size={32} />
            <p className="text-[12px] font-medium tracking-[0.2em] uppercase leading-relaxed max-w-[40ch]">
              No historical memories match your active filter configuration.
            </p>
          </div>
        ) : (
          <motion.div
            className="timeline"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {filteredMeetings.map((meeting, index) => (
              <div
                key={meeting.id}
                className={`timeline-row ${
                  index % 2 === 0 ? "timeline-row--right" : "timeline-row--left"
                }`}
              >
                <motion.span
                  className="timeline-marker"
                  aria-hidden="true"
                  variants={markerPop}
                >
                  {index + 1}
                </motion.span>

                <motion.div
                  onClick={() => onSelectMeeting(meeting.id)}
                  variants={fadeInFrom(index % 2 === 0 ? "right" : "left")}
                  whileHover={cardHover}
                  whileTap={cardTap}
                  className="timeline-card group border border-wheat-border rounded-[12px] p-6 md:p-8 bg-wheat-surface hover:bg-wheat-deep hover:border-olive transition-colors cursor-pointer flex flex-col gap-6"
                >
                  {/* Meta details */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span className="text-[12px] font-medium tracking-[0.15em] text-ink-muted">
                      {meeting.date}
                    </span>
                  
                    <div className="flex items-center gap-2">
                      {meeting.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] font-medium tracking-[0.1em] text-ember-deep border border-ember-deep/30 px-2 py-0.5 rounded-[4px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-heading-sm-custom md:text-[24px] text-ink transition-colors">
                    {meeting.title}
                  </h3>

                  {/* AI gist - 29px mixed case */}
                  <p className="text-[15px] md:text-[16px] text-ink leading-[1.6] font-normal font-sans">
                    {meeting.gist}
                  </p>

                  {/* Participants List */}
                  <div className="flex items-center gap-2 text-[10px] font-medium tracking-[0.15em] text-ink-muted uppercase">
                    <span>MEMBERS:</span>
                    <span>{meeting.participants.join(" · ")}</span>
                  </div>
                </motion.div>
              </div>
            ))}
          </motion.div>
        )}
      </section>

    </div>
  );
};
