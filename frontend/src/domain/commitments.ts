import type { Meeting } from "@/data/mockData";
import type { SpeakerResolver } from "./speakers";

/**
 * Action items, pulled out of the meetings they were buried in.
 *
 * Inside a single meeting an action item is a record of what was said. Across
 * the archive it is something else entirely - the list of things you have
 * promised and not yet done. That list is the reason to open this product on a
 * Tuesday morning, and it only exists once the items are gathered up and
 * filtered down to one person.
 */
export interface Commitment {
  meetingId: string;
  meetingTitle: string;
  startedAt: string;
  /**
   * The action item's own row id, which is how it gets ticked.
   *
   * Absent only for items that were never rows - the live-capture demo builds
   * some in memory. Position is kept alongside it for display order, never for
   * identity: an index is a fact about an array, not about a promise.
   */
  id?: string;
  /** Position in that meeting's `actionItems`. */
  index: number;
  item: string;
  ownerName: string;
  /** The resolved person, absent while that voice is still unnamed. */
  ownerId?: string;
  done: boolean;
}

/** Whose commitments to show. */
export type CommitmentScope = "mine" | "everyone";

export type CommitmentStatus = "open" | "done" | "all";

export interface CommitmentQuery {
  scope: CommitmentScope;
  status: CommitmentStatus;
  /** The person "mine" refers to. */
  personId: string;
}

/**
 * Every action item in the archive, flattened and filtered.
 *
 * Open items come back oldest first: a promise made three weeks ago is more
 * pressing than one made yesterday, and burying it under newer work is how it
 * gets forgotten. Completed items sort the other way, most recent first, since
 * those are a record rather than a queue.
 */
export function collectCommitments(
  meetings: Meeting[],
  speakers: SpeakerResolver,
  { scope, status, personId }: CommitmentQuery
): Commitment[] {
  const all: Commitment[] = [];

  for (const meeting of meetings) {
    meeting.actionItems.forEach((action, index) => {
      const ownerId = speakers.personIdOf(meeting, action.speakerId);
      if (scope === "mine" && ownerId !== personId) return;

      const done = action.done === true;
      if (status === "open" && done) return;
      if (status === "done" && !done) return;

      all.push({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        startedAt: meeting.startedAt,
        id: action.id,
        index,
        item: action.item,
        ownerName: speakers.nameOf(meeting, action.speakerId),
        ownerId,
        done,
      });
    });
  }

  return all.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const aMs = Date.parse(a.startedAt);
    const bMs = Date.parse(b.startedAt);
    return a.done ? bMs - aMs : aMs - bMs;
  });
}

/**
 * How many open items a person is carrying, for badges and summaries.
 *
 * Counts in place rather than calling `collectCommitments`: a badge only needs
 * the number, so building and sorting a throwaway array of every commitment in
 * the archive is work with nothing to show for it.
 */
export function countOpen(
  meetings: Meeting[],
  speakers: SpeakerResolver,
  personId: string
): number {
  let count = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actionItems) {
      if (action.done === true) continue;
      if (speakers.personIdOf(meeting, action.speakerId) !== personId) continue;
      count += 1;
    }
  }
  return count;
}
