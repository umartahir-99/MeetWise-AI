import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Meeting, User, VoiceDirectory } from "@/data/mockData";
import { getMeeting, listMeetings } from "@/api/meetings";
import { supabase } from "@/lib/supabase";
import { toMeeting } from "@/api/mappers";
import type { MeetingRow } from "@/api/rows";
import { loadPeople, loadVoiceDirectory } from "@/api/voices";

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

  /**
   * Live status.
   *
   * The processing screen advances because this fires, not because a timer
   * ran. The subscription respects row level security, so it only ever hears
   * about this user's own rows.
   *
   * A status change is patched straight onto the meeting in memory - that is
   * what moves the bar. `ready` is the one event that needs more than a patch:
   * the row now has six child tables of content the patch does not carry, so
   * that meeting is re-read in full.
   */
  useEffect(() => {
    const channel = supabase
      .channel(`archive:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings", filter: `owner_id=eq.${userId}` },
        ({ new: row }) => {
          const next = row as MeetingRow;
          if (next.status === "ready") {
            getMeeting(next.id)
              .then((full) => {
                if (full) setMeetings((prev) => prev.map((m) => (m.id === full.id ? full : m)));
              })
              .catch((failure) => console.error("Could not read the finished meeting", failure));
            return;
          }

          // The row arrives without its children; fold the status fields onto
          // what is already held rather than replacing the meeting wholesale.
          setMeetings((prev) =>
            prev.map((m) => {
              if (m.id !== next.id) return m;
              const patched = toMeeting({
                ...next,
                meeting_speakers: [],
                transcript_lines: [],
                topics: [],
                decisions: [],
                action_items: [],
                quotes: [],
              });
              return {
                ...m,
                status: patched.status,
                stageStartedAt: patched.stageStartedAt,
                failedStage: patched.failedStage,
                failureReason: patched.failureReason,
              };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "meetings" },
        ({ old }) => {
          const gone = (old as Partial<MeetingRow>).id;
          if (gone) setMeetings((prev) => prev.filter((m) => m.id !== gone));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

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
