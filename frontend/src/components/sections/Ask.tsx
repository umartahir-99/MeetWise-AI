import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meeting } from "@/data/mockData";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  Funnel,
  Hourglass,
  MagnifyingGlass,
  Play,
  Quotes,
} from "@phosphor-icons/react";
import { formatOffsetClock } from "@/domain/datetime";
import type { SpeakerResolver } from "@/domain/speakers";
import { answerQuestion, buildIndex, suggestedQuestions } from "@/domain/retrieval";
import type { AskOutcome } from "@/domain/retrieval";

interface AskProps {
  /** The live archive. Never the fixtures - an upload has to be findable. */
  meetings: Meeting[];
  /** `startMs` opens the meeting on the cited moment and plays it. */
  onSelectMeeting: (id: string, startMs?: number) => void;
  /** Citations name a voice slot, so they need resolving like anything else. */
  speakers: SpeakerResolver;
}

/** How long the fake round trip takes. */
const SEARCH_DELAY_MS = 600;

const plural = (n: number) => (n === 1 ? "" : "S");

/** The user's own words, never uppercased back at them. */
const Asked: React.FC<{ query: string }> = ({ query }) => (
  <span className="normal-case">&ldquo;{query}&rdquo;</span>
);

/** One shell for every "there is no answer" state, in the archive's own idiom. */
const EdgeState: React.FC<{ icon: ReactNode; children: ReactNode }> = ({ icon, children }) => (
  <div className="flex flex-col items-center gap-3 py-16 text-center text-driftwood">
    {icon}
    <p className="text-[12px] font-medium tracking-[0.2em] uppercase leading-relaxed max-w-[46ch]">
      {children}
    </p>
  </div>
);

export const Ask: React.FC<AskProps> = ({ meetings, onSelectMeeting, speakers }) => {
  const [query, setQuery] = useState("");
  // The question the outcome on screen answers. Kept apart from `query`, which
  // stays editable, so every edge state can quote what was actually asked.
  const [askedQuery, setAskedQuery] = useState("");
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Rebuilt when the archive changes and never on a keystroke; the scoring
  // itself only runs on submit. `speakers` is a dependency because naming a
  // voice has to make that person findable straight away - underneath, only
  // the cheap person layer is rebuilt, never the per-meeting content index.
  const index = useMemo(() => buildIndex(meetings, speakers), [meetings, speakers]);
  const suggestions = useMemo(() => suggestedQuestions(index), [index]);
  const emptyArchive = index.readable.length === 0;

  // The pending round trip, so leaving the page mid-search does not land a
  // state update on an unmounted component.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  const answer = outcome?.kind === "answer" ? outcome : null;

  /**
   * Citations, resolved against the archive as it stands right now.
   *
   * A meeting deleted since the answer was written is dropped rather than
   * rendered as a row that leads nowhere, and the speaker is named through the
   * voice directory, so putting a name to a voice updates the answer on screen.
   */
  const cited = useMemo(
    () =>
      (answer?.citations ?? []).flatMap((cite) => {
        const meeting = index.byId.get(cite.meetingId);
        return meeting ? [{ cite, meeting }] : [];
      }),
    [answer, index]
  );
  const dropped = (answer?.citations.length ?? 0) - cited.length;

  const handleSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setQuery(searchQuery);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Simulate short network buffer
    searchTimer.current = setTimeout(() => {
      setAskedQuery(trimmed);
      setOutcome(answerQuestion(trimmed, index));
      setIsSearching(false);
    }, SEARCH_DELAY_MS);
  };

  const handleClear = () => {
    setQuery("");
    setAskedQuery("");
    setOutcome(null);
  };

  return (
    <div className="px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 w-full justify-center">

      {/* Back button visible when results are shown */}
      {outcome && (
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-2 text-[12px] font-medium tracking-[0.2em] text-warm-cream hover:underline cursor-pointer self-start uppercase active:scale-[0.98]"
        >
          <ArrowLeft size={14} />
          ASK ANOTHER QUESTION
        </button>
      )}

      {/* Main Search Panel */}
      <div className="flex flex-col gap-8">

        {!outcome && (
          <header className="flex flex-col gap-4">
            {/* Term matching over transcripts, so it does not claim to be more. */}
            <span className="text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase">
              KEYWORD RETRIEVAL
            </span>
            <h2 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal select-none">
              ASK YOUR
              <br />
              ARCHIVE
            </h2>
          </header>
        )}

        {/* Underline Input Search Bar */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(query);
          }}
          className="relative flex items-center border-b border-warm-cream py-3 focus-within:border-ember-accent transition-colors"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about your meetings..."
            aria-label="Ask a question about your meetings"
            disabled={isSearching || emptyArchive}
            className="w-full bg-transparent text-warm-cream placeholder-driftwood focus:outline-none pr-12 text-[16px] md:text-[20px] font-sans border-0 font-medium disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={isSearching || emptyArchive || !query.trim()}
            aria-label={isSearching ? "Searching your archive" : "Search your archive"}
            aria-busy={isSearching}
            className="absolute right-0 text-warm-cream hover:text-ember-accent disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
          >
            {isSearching ? (
              <span
                aria-hidden="true"
                className="animate-spin inline-block w-6 h-6 border-2 border-t-transparent border-warm-cream rounded-full"
              />
            ) : (
              <ArrowRight size={24} />
            )}
          </button>
        </form>

        {/* Suggestions. Every one is answerable by the archive as it stands. */}
        {!outcome && !isSearching && suggestions.length > 0 && (
          <div className="flex flex-col gap-4 mt-4">
            <span className="text-[11px] font-medium tracking-[0.2em] text-driftwood uppercase">
              SUGGESTED QUERIES
            </span>
            <div className="flex flex-col gap-2 items-start">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSearch(q)}
                  /* Not uppercased: a derived suggestion carries the user's own
                     topic title, which is content rather than chrome. */
                  className="text-left text-[13px] font-medium tracking-[0.05em] text-warm-cream hover:text-ember-accent transition-colors border-b border-dashed border-cork-border py-1 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Everything a search can produce. The region is mounted up front so a
          screen reader announces whatever lands inside it. */}
      <div role="status" aria-live="polite" className="flex flex-col gap-8">

        {isSearching && (
          <span className="text-[11px] font-medium tracking-[0.2em] text-driftwood uppercase">
            SEARCHING YOUR ARCHIVE&hellip;
          </span>
        )}

        {!isSearching && emptyArchive && (
          index.pending.length > 0 ? (
            <EdgeState icon={<Hourglass size={28} weight="light" />}>
              YOUR FIRST RECORDING IS STILL PROCESSING. ASK AGAIN ONCE IT IS READY.
            </EdgeState>
          ) : (
            <EdgeState icon={<Archive size={28} weight="light" />}>
              NOTHING TO SEARCH YET. UPLOAD OR RECORD A MEETING, AND ASK ONCE IT HAS FINISHED
              PROCESSING.
            </EdgeState>
          )
        )}

        {!isSearching && !emptyArchive && outcome?.kind === "no-terms" && (
          <EdgeState icon={<MagnifyingGlass size={28} weight="light" />}>
            {outcome.reason === "too-short" ? (
              <>
                <Asked query={askedQuery} /> IS TOO SHORT TO SEARCH ON. ADD A WORD OR TWO.
              </>
            ) : (
              "THAT QUESTION IS ALL COMMON WORDS. NAME A TOPIC, A DECISION OR A PERSON."
            )}
          </EdgeState>
        )}

        {!isSearching && !emptyArchive && outcome?.kind === "no-match" && (
          <EdgeState icon={<Funnel size={28} weight="light" />}>
            NO MEETING MATCHES <Asked query={askedQuery} />.
            {outcome.tags.length > 0 && <> YOUR ARCHIVE COVERS {outcome.tags.join(", ")}.</>}
            {outcome.pendingCount > 0 && (
              <>
                {" "}
                {outcome.pendingCount} RECORDING{plural(outcome.pendingCount)} STILL PROCESSING AND
                NOT SEARCHABLE YET.
              </>
            )}
            {/* A miss on a person's name is usually a voice nobody has named,
                so point at the thing that fixes it. */}
            {outcome.unnamedVoices > 0 && (
              <>
                {" "}
                {outcome.unnamedVoices} VOICE{plural(outcome.unnamedVoices)} IN YOUR ARCHIVE{" "}
                {outcome.unnamedVoices === 1 ? "HAS" : "HAVE"} NO NAME YET — NAME{" "}
                {outcome.unnamedVoices === 1 ? "IT" : "THEM"} IN SETTINGS TO ASK ABOUT{" "}
                {outcome.unnamedVoices === 1 ? "IT" : "THEM"}.
              </>
            )}
          </EdgeState>
        )}

        {/* The answer may well exist - it is just not readable yet. Say which. */}
        {!isSearching && !emptyArchive && outcome?.kind === "processing-only" && (
          <div className="flex flex-col items-center gap-4">
            <EdgeState icon={<Hourglass size={28} weight="light" />}>
              <Asked query={askedQuery} /> LOOKS LIKE IT BELONGS TO A RECORDING STILL BEING
              PROCESSED:{" "}
              <span className="normal-case user-title text-warm-cream">
                {outcome.pending[0].title}
              </span>
              . ITS TRANSCRIPT IS NOT SEARCHABLE UNTIL ANALYSIS FINISHES.
            </EdgeState>
            <button
              type="button"
              onClick={() => onSelectMeeting(outcome.pending[0].id)}
              className="flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-ember-accent uppercase cursor-pointer hover:underline active:scale-[0.98]"
            >
              OPEN PROCESSING STATUS
              <ArrowRight size={12} />
            </button>
          </div>
        )}

        {!isSearching && answer && (
          <div className="border border-cork-border rounded-[12px] bg-bark-brown/10 p-6 md:p-9 flex flex-col gap-8 animate-fade-in">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-ember-accent uppercase font-mono">
              <Quotes size={16} />
              <span>MATCHED FROM YOUR ARCHIVE</span>
            </div>

            {/* 29px mixed-case font for response content */}
            <p className="text-body-custom text-warm-cream leading-[1.26] max-w-[65ch] font-normal font-sans">
              {answer.answer}
            </p>

            {/* Where the answer came from, and what it was matched on. */}
            <div className="flex flex-col gap-1 text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
              <span>
                {answer.source === "curated"
                  ? `CURATED ANSWER · ${answer.meetingIds.length} SOURCE MEETING${plural(answer.meetingIds.length)}`
                  : `ASSEMBLED FROM ${answer.meetingIds.length} MEETING${plural(answer.meetingIds.length)} · TERMS: ${answer.terms.join(", ")}`}
              </span>
              {answer.pendingCount > 0 && (
                <span>
                  {answer.pendingCount} RECORDING{plural(answer.pendingCount)} STILL PROCESSING MAY
                  ALSO ANSWER THIS.
                </span>
              )}
            </div>

            {(cited.length > 0 || dropped > 0) && (
              <>
                <div className="divider-dashed" />

                <div className="flex flex-col gap-6">
                  <span className="text-[11px] font-medium tracking-[0.2em] text-driftwood uppercase">
                    CITATIONS &amp; CONTEXT
                  </span>

                  <div className="flex flex-col gap-4">
                    {cited.map(({ cite, meeting }, idx) => (
                      <button
                        key={`${cite.meetingId}-${cite.startMs}-${idx}`}
                        type="button"
                        onClick={() => onSelectMeeting(cite.meetingId, cite.startMs)}
                        className="group border border-cork-border/50 rounded-[12px] p-5 hover:border-warm-cream/50 hover:bg-bark-brown/20 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-walnut-shadow/40 text-left w-full"
                      >
                        <div className="flex flex-col gap-1 md:max-w-[80%]">
                          <span className="text-[10px] font-medium tracking-[0.15em] text-ember-accent uppercase font-mono">
                            {speakers.nameOf(meeting, cite.speakerId)} &mdash; SPEECH TRANSCRIPT
                          </span>
                          <p className="text-[13px] text-warm-cream italic">
                            &ldquo;{cite.text}&rdquo;
                          </p>
                        </div>

                        {/* The citation is an offer to listen, not just a link. */}
                        <div className="flex flex-col items-start md:items-end gap-2 shrink-0 mt-2 md:mt-0">
                          <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.15em] text-ember-accent uppercase whitespace-nowrap tabular-nums">
                            <Play size={12} weight="fill" />
                            PLAY {formatOffsetClock(cite.startMs)}
                          </span>
                          <span className="flex items-center gap-2 text-[10px] font-medium tracking-[0.1em] text-driftwood group-hover:text-warm-cream uppercase whitespace-nowrap transition-colors">
                            <CalendarBlank size={12} />
                            {/* A meeting title is the user's words, not a label. */}
                            <span className="normal-case">{meeting.title.split(":")[0]}</span>
                            <ArrowRight size={11} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {dropped > 0 && (
                    <span className="text-[10px] font-medium tracking-[0.15em] text-driftwood uppercase">
                      {dropped} CITED MEETING{plural(dropped)} {dropped === 1 ? "IS" : "ARE"} NO
                      LONGER IN THE ARCHIVE.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
};
