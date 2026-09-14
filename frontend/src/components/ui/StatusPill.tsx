import React from "react";
import type { MeetingStatus } from "@/data/mockData";
import { isTerminal, stageMeta } from "@/domain/processing";

/** Waiting, working, done or broken — the four things a pill has to say. */
const VARIANT: Record<MeetingStatus, string> = {
  uploaded: "waiting",
  queued: "waiting",
  transcribing: "active",
  analyzing: "active",
  ready: "ready",
  failed: "failed",
};

interface StatusPillProps {
  status: MeetingStatus;
  /** `cream` re-tones the pill for the light Archive band. */
  tone?: "dark" | "cream";
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, tone = "dark", className = "" }) => (
  <span
    className={`status-pill status-pill--${VARIANT[status]} ${
      tone === "cream" ? "status-pill--cream" : ""
    } ${className}`}
  >
    {!isTerminal(status) && <span className="status-pill__dot" aria-hidden="true" />}
    {stageMeta(status)?.label ?? "FAILED"}
  </span>
);
