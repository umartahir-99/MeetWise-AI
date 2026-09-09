import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, CheckCircle, Circle } from "@phosphor-icons/react";
import type { Meeting, User } from "../mockData";
import type { SpeakerResolver } from "../speakers";
import type { CommitmentScope, CommitmentStatus } from "../commitments";
import { collectCommitments } from "../commitments";
import { formatAgo, formatMeetingDate } from "../datetime";
import { fadeUp, staggerContainer, viewportOnce } from "../motion";

interface CommitmentsProps {
  meetings: Meeting[];
  speakers: SpeakerResolver;
  account: User;
  onSelectMeeting: (id: string) => void;
  onToggleActionItem: (meetingId: string, index: number) => void;
}

const SCOPES: { id: CommitmentScope; label: string }[] = [
  { id: "mine", label: "MINE" },
  { id: "everyone", label: "EVERYONE" },
];

const STATUSES: { id: CommitmentStatus; label: string }[] = [
  { id: "open", label: "OPEN" },
  { id: "done", label: "DONE" },
  { id: "all", label: "ALL" },
];

/**
 * What you owe.
 *
 * Every other screen is organised by meeting, which is the right shape for
 * remembering and the wrong shape for doing. This one cuts the other way:
 * one person's promises, gathered from wherever they were made, oldest first.
 */
export const Commitments: React.FC<CommitmentsProps> = ({
  meetings,
  speakers,
  account,
  onSelectMeeting,
  onToggleActionItem,
}) => {
  const [scope, setScope] = useState<CommitmentScope>("mine");
  const [status, setStatus] = useState<CommitmentStatus>("open");

  const commitments = useMemo(
    () => collectCommitments(meetings, speakers, { scope, status, personId: account.id }),
    [meetings, speakers, scope, status, account.id]
  );

  // On the default "open" filter the list already *is* the open items, so
  // counting them again over the whole archive is a second pass for nothing.
  const openCount = useMemo(
    () =>
      status === "open"
        ? commitments.length
        : collectCommitments(meetings, speakers, {
            scope,
            status: "open",
            personId: account.id,
          }).length,
    [status, commitments, meetings, speakers, scope, account.id]
  );

  const oldest = commitments.find((c) => !c.done);

  return (
    <div className="px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 w-full">
      <motion.header
        className="flex flex-col gap-4"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
      >
        <span className="text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase">
          OPEN LOOPS
        </span>
        <h2 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal select-none">
          WHAT YOU
          <br />
          OWE
        </h2>
        <p className="text-[14px] md:text-[15px] font-medium tracking-[0.1em] text-driftwood uppercase max-w-[52ch] leading-[1.6]">
          {openCount === 0
            ? scope === "mine"
              ? "Nothing outstanding. Every commitment you made has been closed."
              : "Nothing outstanding across the archive."
            : `${openCount} open ${openCount === 1 ? "commitment" : "commitments"}${
                oldest ? ` — the oldest from ${formatAgo(oldest.startedAt)}` : ""
              }`}
        </p>
      </motion.header>

      <div className="divider-dashed" />

      {/* Filters ------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase font-mono">
            WHOSE
          </span>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((option) => (
              <button
                key={option.id}
                onClick={() => setScope(option.id)}
                className="filter-chip"
                data-active={scope === option.id ? "true" : undefined}
                type="button"
              >
                {option.id === "mine" ? account.name : option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase font-mono">
            STATUS
          </span>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((option) => (
              <button
                key={option.id}
                onClick={() => setStatus(option.id)}
                className="filter-chip"
                data-active={status === option.id ? "true" : undefined}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The list ------------------------------------------------------ */}
      {commitments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-driftwood">
          <CheckCircle size={28} weight="light" />
          <p className="text-[12px] font-medium tracking-[0.2em] uppercase leading-relaxed max-w-[40ch]">
            {status === "done"
              ? "Nothing has been ticked off yet."
              : "Nothing here. Action items appear once a meeting has been analysed."}
          </p>
        </div>
      ) : (
        <motion.ul
          className="flex flex-col"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {commitments.map((commitment) => (
            <motion.li
              key={`${commitment.meetingId}-${commitment.index}`}
              variants={fadeUp}
              className={`commitment ${commitment.done ? "commitment--done" : ""}`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={commitment.done}
                aria-label={
                  commitment.done ? `Reopen: ${commitment.item}` : `Mark done: ${commitment.item}`
                }
                onClick={() => onToggleActionItem(commitment.meetingId, commitment.index)}
                className="commitment__tick"
              >
                {commitment.done ? (
                  <CheckCircle size={20} weight="fill" />
                ) : (
                  <Circle size={20} weight="light" />
                )}
              </button>

              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <span className="commitment__item">{commitment.item}</span>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium tracking-[0.15em] text-driftwood uppercase">
                  {scope === "everyone" && (
                    <>
                      <span className="text-ember-accent">{commitment.ownerName}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{formatMeetingDate(commitment.startedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatAgo(commitment.startedAt)}</span>
                </div>
              </div>

              {/* The item is a claim about a conversation; this is the way back. */}
              <button
                type="button"
                onClick={() => onSelectMeeting(commitment.meetingId)}
                className="commitment__source"
              >
                <span className="user-title truncate">{commitment.meetingTitle}</span>
                <ArrowUpRight size={13} className="shrink-0" />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
};
