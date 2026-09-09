import { useEffect } from "react";
import type React from "react";
import type { Meeting } from "./mockData";
import { buildReadyMeeting, isTerminal, nextStatus, stageProgress } from "./processing";

/**
 * Stands in for the job runner.
 *
 * Walks every in-flight meeting through the pipeline on a wall clock, so
 * progress stays correct across re-renders and does not depend on a timer per
 * job. It only writes state at stage *boundaries* - the smooth progress bar is
 * the processing screen's own business, which keeps this from re-rendering the
 * whole app several times a second.
 *
 * Replace wholesale with polling or a socket once a real backend exists.
 */
const TICK_MS = 150;

/** How far into a stage a planned failure fires. */
const FAILURE_POINT = 0.55;

export function useProcessingEngine(
  meetings: Meeting[],
  setMeetings: React.Dispatch<React.SetStateAction<Meeting[]>>,
  /** Retention setting: throw the recording away once the transcript exists. */
  discardAudio = false
) {
  const hasActiveJob = meetings.some((m) => !isTerminal(m.status));

  useEffect(() => {
    if (!hasActiveJob) return;

    const timer = setInterval(() => {
      setMeetings((prev) => {
        const now = Date.now();
        let changed = false;

        const next = prev.map((meeting) => {
          if (isTerminal(meeting.status)) return meeting;

          const progress = stageProgress(meeting, now);

          // Planned failure lands mid-stage, the way a real one would.
          if (meeting.sim?.failAt === meeting.status && progress >= FAILURE_POINT) {
            changed = true;
            return {
              ...meeting,
              status: "failed" as const,
              failedStage: meeting.status,
              failureReason: meeting.sim.reason,
              stageStartedAt: undefined,
              // Cleared so a retry gets a clean run.
              sim: undefined,
            };
          }

          if (progress < 1) return meeting;

          const upcoming = nextStatus(meeting.status);
          if (!upcoming) return meeting;

          changed = true;
          return upcoming === "ready"
            ? buildReadyMeeting(meeting, discardAudio)
            : { ...meeting, status: upcoming, stageStartedAt: now };
        });

        return changed ? next : prev;
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [hasActiveJob, setMeetings, discardAudio]);
}
