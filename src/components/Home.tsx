import React from "react";
import type { Meeting } from "../mockData";
import { ArrowRight, ArrowUpRight, Clock, UsersThree } from "@phosphor-icons/react";
import { Hero } from "./Hero";
import { motion } from "motion/react";
import { cardHover, cardTap, fadeUp, staggerContainer, viewportOnce } from "../motion";

interface HomeProps {
  meetings: Meeting[];
  onSelectMeeting: (id: string) => void;
  onStartCapture: () => void;
  onBrowseAll: () => void;
}

export const Home: React.FC<HomeProps> = ({ meetings, onSelectMeeting, onStartCapture, onBrowseAll }) => {
  // Get the 3 most recent meetings
  const recentMeetings = meetings.slice(0, 3);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section - exactly 100vh */}
      <Hero onStartCapture={onStartCapture} />

      {/* Recent Meetings Section */}
      <section className="pt-20 pb-0 px-6 md:px-12 max-w-[1200px] mx-auto flex flex-col gap-18 w-full">
        {/* Dashed Line separator */}
        <div className="divider-dashed" />

        {/* Recent Meetings Grid */}
        <div className="flex flex-col gap-9">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium tracking-[0.25em] text-[#dc5000] mb-3">
                MEMORY INDEX / 2026
              </p>
              <h2 className="text-subheading-custom text-[#ffedd7] tracking-[0.15em]">
                RECENT ENTRIES
              </h2>
            </div>
            <span className="text-[10px] font-medium tracking-[0.25em] text-[#6c5f51]">
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
                className={`group border border-[#40372e] rounded-[12px] bg-[#100904] hover:bg-[#382416]/20 hover:border-[#6c5f51] transition-colors cursor-pointer flex flex-col ${index === 0 ? "lg:row-span-2 p-6 md:p-9 justify-between min-h-[360px]" : "p-6 md:p-7"}`}
              >
                <div className="flex items-start justify-between gap-5">
                  <span className="text-[11px] font-medium tracking-[0.2em] text-[#dc5000]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <ArrowUpRight
                    size={20}
                    weight="light"
                    className="text-[#6c5f51] group-hover:text-[#dc5000] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-5 mt-10 lg:mt-0">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-[#6c5f51]">
                    {meeting.date}
                  </span>
                  <h3 className={`${index === 0 ? "text-heading-sm-custom md:text-[32px]" : "text-heading-sm-custom md:text-[23px]"} text-[#ffedd7] group-hover:text-[#ffedd7] transition-colors max-w-[26ch]`}>
                    {meeting.title}
                  </h3>
                  <p className={`${index === 0 ? "text-body-custom" : "text-[16px] leading-[1.45]"} text-[#ffedd7] max-w-[65ch] font-normal font-sans`}>
                    {meeting.gist}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mt-8 pt-5 border-t border-[#40372e]">
                  <span className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.15em] text-[#6c5f51]">
                    <Clock size={14} weight="light" />
                    {meeting.duration}
                  </span>
                  <span className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.15em] text-[#6c5f51]">
                    <UsersThree size={14} weight="light" />
                    {meeting.participants.length} VOICES
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    {meeting.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[9px] font-medium tracking-[0.15em] text-[#ffedd7]/70 border border-[#40372e] rounded-full px-2.5 py-1">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
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
            className="group flex items-center gap-3 self-start text-[12px] font-medium tracking-[0.2em] text-[#dc5000] uppercase cursor-pointer hover:underline"
          >
            <span>BROWSE THE FULL ARCHIVE</span>
            <ArrowRight size={14} />
          </motion.button>
        </div>
      </section>
    </div>
  );
};
