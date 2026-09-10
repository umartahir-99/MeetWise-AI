import type { Meeting, SpeakerSlot, User, VoiceDirectory } from "./mockData";

/**
 * Turning anonymous voices into people.
 *
 * Diarization separates voices but cannot name them, so a meeting stores slots
 * ("speaker-1") and everything in it - transcript lines, quotes, action item
 * owners - points at a slot rather than at a name. A name lives in the voice
 * directory, keyed by the slot's `voicePrint`.
 *
 * That indirection is the whole feature: naming a voice writes one entry in
 * the directory, and every meeting that voice has ever spoken in resolves to
 * the new name without a single record being rewritten.
 */

/** A voice as it appears across the whole archive, for the directory UI. */
export interface VoiceEntry {
  voicePrint: string;
  /** Resolved name, or null while nobody has named this voice. */
  name: string | null;
  /** What diarization called it, for when there is no name yet. */
  label: string;
  meetingCount: number;
  lineCount: number;
}

export interface SpeakerResolver {
  /** Known people, for the "who is this?" suggestions. */
  people: User[];
  slot(meeting: Meeting, speakerId: string): SpeakerSlot | undefined;
  /** Display name for a slot: the person's name, or diarization's label. */
  nameOf(meeting: Meeting, speakerId: string): string;
  /** The person behind a slot, or undefined while the voice is unnamed. */
  personIdOf(meeting: Meeting, speakerId: string): string | undefined;
  isNamed(meeting: Meeting, speakerId: string): boolean;
  /** Everyone who spoke, in first-appearance order. */
  participants(meeting: Meeting): string[];
  /**
   * Display name for whoever owns a recording.
   *
   * Owners are people too, so they resolve through the same directory every
   * voice does - which is what makes a rename reach the byline on a meeting as
   * well as the lines inside it. Falls back to the raw id, which in practice
   * only shows for a meeting whose owner is no longer in the directory.
   */
  ownerNameOf(ownerId: string): string;
  /** Slots still waiting for a name. */
  unnamed(meeting: Meeting): SpeakerSlot[];
  /** How many meetings a voice has been heard in. */
  heardIn(voicePrint: string, meetings: Meeting[]): number;
  /** Every voice in the archive, named or not. */
  roster(meetings: Meeting[]): VoiceEntry[];
}

/** Lines this voice speaks in this meeting. */
export function countLines(meeting: Meeting, speakerId: string): number {
  return meeting.transcript.filter((line) => line.speakerId === speakerId).length;
}

/** First thing this voice says, to help whoever is putting a name to it. */
export function sampleLine(meeting: Meeting, speakerId: string): string | undefined {
  return meeting.transcript.find((line) => line.speakerId === speakerId)?.text;
}

/** Stable id for a newly named person. */
export function personIdFor(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `u-${slug || "unnamed"}`;
}

export function createSpeakerResolver(
  people: Record<string, User>,
  voices: VoiceDirectory
): SpeakerResolver {
  const personFor = (slot: SpeakerSlot): User | undefined => {
    const personId = voices[slot.voicePrint];
    return personId ? people[personId] : undefined;
  };

  /**
   * Slots indexed by id, built once per meeting.
   *
   * Every transcript line, quote and action item resolves a name through here,
   * so a linear scan of `meeting.speakers` per lookup turns rendering one
   * transcript into O(lines x speakers). The cache is weak, so it costs nothing
   * once a meeting is no longer being displayed, and a resolver is rebuilt
   * whenever the people or voice directory change anyway.
   */
  const slotIndex = new WeakMap<Meeting, Map<string, SpeakerSlot>>();

  const slotsOf = (meeting: Meeting): Map<string, SpeakerSlot> => {
    let index = slotIndex.get(meeting);
    if (!index) {
      index = new Map(meeting.speakers.map((s) => [s.id, s]));
      slotIndex.set(meeting, index);
    }
    return index;
  };

  const slot = (meeting: Meeting, speakerId: string) => slotsOf(meeting).get(speakerId);

  const nameOf = (meeting: Meeting, speakerId: string) => {
    const found = slot(meeting, speakerId);
    if (!found) return "UNKNOWN VOICE";
    return personFor(found)?.name ?? found.label;
  };

  return {
    people: Object.values(people),
    slot,
    nameOf,
    personIdOf: (meeting, speakerId) => {
      const found = slot(meeting, speakerId);
      return found ? personFor(found)?.id : undefined;
    },
    isNamed: (meeting, speakerId) => {
      const found = slot(meeting, speakerId);
      return found ? personFor(found) !== undefined : false;
    },
    participants: (meeting) => meeting.speakers.map((s) => nameOf(meeting, s.id)),
    ownerNameOf: (ownerId) => people[ownerId]?.name ?? ownerId,
    unnamed: (meeting) => meeting.speakers.filter((s) => personFor(s) === undefined),
    heardIn: (voicePrint, meetings) =>
      meetings.filter((m) => m.speakers.some((s) => s.voicePrint === voicePrint)).length,
    roster: (meetings) => {
      const byPrint = new Map<string, VoiceEntry>();

      for (const meeting of meetings) {
        // One pass over the transcript tallies every voice at once. Asking
        // `countLines` per speaker instead re-walks the whole transcript for
        // each of them, which is the same work multiplied by the head count.
        const linesById = new Map<string, number>();
        for (const line of meeting.transcript) {
          linesById.set(line.speakerId, (linesById.get(line.speakerId) ?? 0) + 1);
        }

        for (const s of meeting.speakers) {
          const existing = byPrint.get(s.voicePrint);
          const lines = linesById.get(s.id) ?? 0;
          if (existing) {
            existing.meetingCount += 1;
            existing.lineCount += lines;
          } else {
            byPrint.set(s.voicePrint, {
              voicePrint: s.voicePrint,
              name: personFor(s)?.name ?? null,
              label: s.label,
              meetingCount: 1,
              lineCount: lines,
            });
          }
        }
      }

      // Unnamed voices first - they are the ones asking to be dealt with.
      return Array.from(byPrint.values()).sort((a, b) => {
        if ((a.name === null) !== (b.name === null)) return a.name === null ? -1 : 1;
        return b.meetingCount - a.meetingCount;
      });
    },
  };
}
