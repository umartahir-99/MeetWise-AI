import React, { useMemo } from "react";
import type { Meeting } from "@/data/mockData";
import { ArrowRight, ArrowUpRight, Clock, UsersThree } from "@phosphor-icons/react";
import { Hero } from "./Hero";
import { motion } from "motion/react";
import { cardHover, cardTap, fadeUp, staggerContainer, viewportOnce } from "@/lib/motion";
import { isReadable, pendingGist } from "@/domain/processing";
import { byNewestFirst, formatDurationLabel, formatMeetingDate } from "@/domain/datetime";
import { StatusPill } from "@/components/ui/StatusPill";

interface HomeProps {
  meetings: Meeting[];
  onSelectMeeting: (id: string) => void;
  onStartUpload: () => void;
  onBrowseAll: () => void;
  /** Open action items owned by whoever is signed in. */
  openCommitments: number;
  onViewCommitments: () => void;
}

export const Home: React.FC<HomeProps> = ({
  meetings,
  onSelectMeeting,
  onStartUpload,
  onBrowseAll,
  openCommitments,
  onViewCommitments,
}) => {
  // The 3 most recent meetings, by when they actually happened. Anything still
  // in the pipeline is pinned to the front, so a freshly uploaded recording
  // does not vanish down the list just because it was recorded a while ago.
  const recentMeetings = useMemo(
    () =>
      [...meetings]
        .sort((a, b) => Number(isReadable(a)) - Number(isReadable(b)) || byNewestFirst(a, b))
        .slice(0, 3),
    [meetings]
  );

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section - exactly 100vh */}
      <Hero onStartUpload={onStartUpload} />

      {/* Recent Meetings Section */}
      <section className="pt-20 pb-0 px-6 md:px-12 max-w-[1200px] mx-auto flex flex-col gap-18 w-full">
        {/* Dashed Line separator */}
        <div className="divider-dashed" />

        {/* The one thing worth surfacing before the archive: outstanding promises. */}
        {openCommitments > 0 && (
          <button type="button" onClick={onViewCommitments} className="owed-strip">
            <span className="owed-strip__count">{openCommitments}</span>
            <span className="owed-strip__label">
              {openCommitments === 1 ? "thing you owe" : "things you owe"}, across your meetings
            </span>
            <ArrowRight size={16} className="shrink-0" />
          </button>
        )}

        {/* Recent Meetings Grid */}
        <div className="flex flex-col gap-9">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium tracking-[0.25em] text-ember-accent mb-3">
                MEMORY INDEX / 2026
              </p>
              <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em]">
                RECENT ENTRIES
              </h2>
            </div>
            <span className="text-[10px] font-medium tracking-[0.25em] text-driftwood">
              SHOWING 03 OF {meetings.length.toString().padStart(2, "0")}
            </span>
          </div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            {recentMeetings.map((meeting, index) => (
              <motion.div
                key={meeting.id}
                onClick={() => onSelectMeeting(meeting.id)}
                variants={fadeUp}
                whileHover={cardHover}
                whileTap={cardTap}
                className={`group border border-cork-border rounded-[12px] bg-walnut-shadow hover:bg-bark-brown/20 hover:border-driftwood transition-colors cursor-pointer flex flex-col ${index === 0 ? "lg:row-span-2 p-6 md:p-9 justify-between min-h-[360px]" : "p-6 md:p-7"}`}
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium tracking-[0.2em] text-ember-accent">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {!isReadable(meeting) && <StatusPill status={meeting.status} />}
                  </div>
                  <ArrowUpRight
                    size={20}
                    weight="light"
                    className="text-driftwood group-hover:text-ember-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-5 mt-10 lg:mt-0">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-driftwood">
                    {formatMeetingDate(meeting.startedAt)}
                  </span>
                  <h3 className={`${index === 0 ? "text-heading-sm-custom md:text-[32px]" : "text-heading-sm-custom md:text-[23px]"} text-warm-cream group-hover:text-warm-cream transition-colors max-w-[26ch] user-title`}>
                    {meeting.title}
                  </h3>
                  <p className={`${index === 0 ? "text-body-custom" : "text-[16px] leading-[1.45]"} text-warm-cream max-w-[65ch] font-normal font-sans`}>
                    {isReadable(meeting) ? meeting.gist : pendingGist(meeting.status)}
                  </p>
                </div>

                {isReadable(meeting) && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-8 pt-5 border-t border-cork-border">
                    <span className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.15em] text-driftwood">
                      <Clock size={14} weight="light" />
                      {formatDurationLabel(meeting.durationMs)}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.15em] text-driftwood">
                      <UsersThree size={14} weight="light" />
                      {meeting.speakers.length} VOICES
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      {meeting.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[9px] font-medium tracking-[0.15em] text-warm-cream/70 border border-cork-border rounded-full px-2.5 py-1 uppercase">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Continues into the archive section below */}
          <motion.button
            type="button"
            onClick={onBrowseAll}
            whileHover={{ x: 6 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="group flex items-center gap-3 self-start text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase cursor-pointer hover:underline"
          >
            <span>BROWSE THE FULL ARCHIVE</span>
            <ArrowRight size={14} />
          </motion.button>
        </div>
      </section>
    </div>
  );
};
