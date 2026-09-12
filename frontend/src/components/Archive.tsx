import React, { useState, useMemo, useEffect } from "react";
import type { Meeting } from "../mockData";
import { MagnifyingGlass, Funnel, X } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { fadeUp, staggerContainer, viewportOnce } from "../motion";
import { isReadable, pendingGist } from "../processing";
import { byNewestFirst, formatMeetingDate } from "../datetime";
import type { SpeakerResolver } from "../speakers";
import { StatusPill } from "./StatusPill";

interface ArchiveProps {
  meetings: Meeting[];
  onSelectMeeting: (id: string) => void;
  speakers: SpeakerResolver;
}

/** Rows shown before "show more" — one screen, whatever the archive holds. */
const PAGE_SIZE = 10;
/** Tags shown inline on a row; the rest fold into a "+n" so the row stays one line. */
const MAX_ROW_TAGS = 2;

export const Archive: React.FC<ArchiveProps> = ({ meetings, onSelectMeeting, speakers }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  // Extract all unique tags and participants for filter lists. Names come from
  // the voice directory, so an unnamed voice filters as "SPEAKER 2" until
  // somebody says who it is.
  const { allTags, allParticipants } = useMemo(() => {
    const tags = new Set<string>();
    const participants = new Set<string>();
    meetings.forEach((m) => {
      m.tags.forEach((tag) => tags.add(tag));
      speakers.participants(m).forEach((p) => participants.add(p));
    });
    return {
      allTags: Array.from(tags),
      allParticipants: Array.from(participants),
    };
  }, [meetings, speakers]);

  // Filtered meetings list, newest first. The needle is lowercased once rather
  // than per field per meeting, and the cheap checks run before the ones that
  // have to resolve names.
  const filteredMeetings = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    const matching = meetings.filter((m) => {
      if (selectedTag && !m.tags.includes(selectedTag)) return false;

      if (
        needle &&
        !m.title.toLowerCase().includes(needle) &&
        !m.gist.toLowerCase().includes(needle) &&
        !m.summary.toLowerCase().includes(needle)
      ) {
        return false;
      }

      if (selectedParticipant && !speakers.participants(m).includes(selectedParticipant)) {
        return false;
      }

      return true;
    });

    return matching.sort(byNewestFirst);
  }, [meetings, searchTerm, selectedTag, selectedParticipant, speakers]);

  // The ledger is paged so the archive never becomes a scroll of its own: a
  // filter change starts again from the first page.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [searchTerm, selectedTag, selectedParticipant]);
  const visibleMeetings = filteredMeetings.slice(0, visibleCount);
  const hiddenCount = filteredMeetings.length - visibleMeetings.length;

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
              className="w-full bg-transparent text-ink placeholder-ink-muted focus:outline-none text-[14px] pr-8"
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

      {/* Meeting ledger */}
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
            className="ledger"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <div className="ledger__head" aria-hidden="true">
              <span>Date</span>
              <span>Meeting</span>
              <span>Members</span>
              <span>Tags</span>
            </div>

            {visibleMeetings.map((meeting) => {
              const readable = isReadable(meeting);
              const overflow = meeting.tags.length - MAX_ROW_TAGS;
              return (
                <motion.button
                  key={meeting.id}
                  type="button"
                  className="ledger__row"
                  onClick={() => onSelectMeeting(meeting.id)}
                  variants={fadeUp}
                >
                  <span className="ledger__date">{formatMeetingDate(meeting.startedAt)}</span>

                  <span className="ledger__meeting min-w-0">
                    <span className="ledger__title user-title block">{meeting.title}</span>
                    <span className="ledger__gist block">
                      {readable ? meeting.gist : pendingGist(meeting.status)}
                    </span>
                  </span>

                  {/* Members only exist once diarization has run. */}
                  <span className="ledger__members">
                    {readable ? speakers.participants(meeting).join(" · ") : "—"}
                  </span>

                  <span className="ledger__tags">
                    {readable ? (
                      <>
                        {meeting.tags.slice(0, MAX_ROW_TAGS).map((tag) => (
                          <span key={tag} className="ledger__tag">
                            {tag}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span className="ledger__tag ledger__tag--more">+{overflow}</span>
                        )}
                      </>
                    ) : (
                      <StatusPill status={meeting.status} tone="cream" />
                    )}
                  </span>
                </motion.button>
              );
            })}

            {hiddenCount > 0 && (
              <button
                type="button"
                className="ledger__more"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Show {Math.min(hiddenCount, PAGE_SIZE)} more · {hiddenCount} remaining
              </button>
            )}
          </motion.div>
        )}
      </section>

    </div>
  );
};
