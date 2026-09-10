import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Meeting, User, VoiceDirectory } from "./mockData";
import { listMeetings } from "./api/meetings";
import { loadPeople, loadVoiceDirectory } from "./api/voices";

/**
 * The archive, and the directory that gives it names.
 *
 * These load together because they are useless apart: a meeting without the
 * voice directory renders every speaker as "Speaker 2", which looks like data
 * loss rather than like loading. One await, one paint.
 *
 * The three pieces are held separately rather than merged, because they change
 * at different rates and for different reasons — naming a voice rewrites the
 * directory and touches no meeting at all, which is the whole point of storing
 * a name against a voice instead of inside a recording.
 */
export interface Archive {
  meetings: Meeting[];
  people: Record<string, User>;
  voices: VoiceDirectory;
  loading: boolean;
  /** Non-null once a load has failed, so the screen can say so rather than sit empty. */
  error: string | null;
  /** Re-read everything from the database. */
  refresh: () => Promise<void>;
  /**
   * Apply a change locally without a round trip.
   *
   * Ticking a box should move the moment it is clicked, not after the network
   * agrees. The write still goes out; this is what stops the interface waiting
   * for it.
   */
  patch: Dispatch<SetStateAction<Meeting[]>>;
  setPeople: Dispatch<SetStateAction<Record<string, User>>>;
  setVoices: Dispatch<SetStateAction<VoiceDirectory>>;
}

export function useArchive(userId: string): Archive {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [people, setPeople] = useState<Record<string, User>>({});
  const [voices, setVoices] = useState<VoiceDirectory>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // In parallel: they are three independent reads, and doing them in sequence
    // would make the first paint wait for the sum rather than the slowest.
    const [nextMeetings, nextPeople, nextVoices] = await Promise.all([
      listMeetings(),
      loadPeople(),
      loadVoiceDirectory(),
    ]);
    setMeetings(nextMeetings);
    setPeople(nextPeople);
    setVoices(nextVoices);
    setError(null);
  }, []);

  useEffect(() => {
    let live = true;

    // `loading` already starts true, and `Root` keys the shell on the user id,
    // so this effect runs once per account against a fresh state. Setting the
    // flag here as well would only start a second render to reach the value it
    // already has.
    //
    // The rule below cannot see that `load` is async: it suspends at its first
    // await before touching any state, so nothing here is set synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
      .catch((failure: unknown) => {
        if (!live) return;
        setError(failure instanceof Error ? failure.message : "Could not load your archive.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
    // `userId` is a dependency for honesty rather than for effect: the shell is
    // remounted per account, so this never re-runs in practice.
  }, [userId, load]);

  const refresh = useCallback(async () => {
    try {
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load your archive.");
    }
  }, [load]);

  return {
    meetings,
    people,
    voices,
    loading,
    error,
    refresh,
    patch: setMeetings,
    setPeople,
    setVoices,
  };
}
