import { MOCK_QUESTIONS } from "@/data/mockData";
import type { Citation, Meeting, MockQuestion, TranscriptLine, User } from "@/data/mockData";
import { isReadable } from "./processing";
import { byNewestFirst } from "./datetime";

/**
 * Answering a question from the archive.
 *
 * `Ask` used to hand the whole typed question to `String.includes` against the
 * module-level fixtures. That is wrong twice over: no stored sentence contains
 * a whole question, so nothing ever matched; and the fixtures are a frozen
 * copy, so an uploaded meeting was invisible and a deleted one was still cited.
 *
 * What happens instead: the query is broken into terms, meetings are scored on
 * where those terms appear, and every answer is assembled out of the archive
 * the app is actually holding. This is weighted keyword matching, not
 * embeddings - the UI says so rather than claiming retrieval it does not do.
 *
 * Only `ready` meetings are searchable. A job still transcribing genuinely has
 * no transcript, topics or gist, so it is tracked separately and reported as
 * "still processing" rather than silently counted as a miss.
 */

/* ------------------------------------------------------------------ */
/* Terms                                                                */
/* ------------------------------------------------------------------ */

/**
 * Words that appear in almost every question and so separate nothing. Dropping
 * them is what makes a one-word query like "e" resolve to *no* terms rather
 * than to a substring that matches everything.
 */
const STOPWORDS = new Set(
  ("a an and any about all are as at be been but by can did do does for from get got had has" +
    " have he her him his how i if in into is it its me my of on or our out said say she should" +
    " so than that the their them then there these they this to us was we were what when where" +
    " which who whom why will with would you your meeting meetings")
    .split(" ")
);

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Crude singular fold, applied to the index and the query alike so the two
 * meet in the middle: "buffers" finds "buffer", "sizes" finds "size".
 *
 * Deliberately only two rules. An `-es` rule would fold "sizes" to "siz" while
 * "size" stays whole, which breaks more than it fixes. "ss" and anything
 * shorter than four characters is left alone, so "css" and "ios" survive.
 */
function fold(term: string): string {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1);
  return term;
}

/** Folded, deduped, stopword-free terms. Empty for a query with no substance. */
function queryTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const token of tokenize(text)) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    terms.add(fold(token));
  }
  return Array.from(terms);
}

/* ------------------------------------------------------------------ */
/* Index                                                                */
/* ------------------------------------------------------------------ */

/**
 * How much a term is worth per field it appears in, credited once per field
 * rather than once per occurrence - otherwise a long summary outweighs a title.
 */
export const FIELD_WEIGHTS = {
  title: 6,
  topicTitle: 5,
  decision: 4,
  gist: 3,
  actionItem: 3,
  tag: 3,
  summary: 2,
  topicDetails: 2,
  quote: 2,
  transcriptLine: 1,
} as const;

/** A term in eight transcript lines is a signal; in eighty it is filler. */
const MAX_TRANSCRIPT_LINES = 4;

/** Share of the score that survives poor coverage of the query's terms. */
const COVERAGE_FLOOR = 0.4;

const MAX_SOURCE_MEETINGS = 3;
const MAX_CITATIONS = 3;

/** How much of a canned question must be asked before its answer is used. */
const CURATED_MIN_RECALL = 0.6;
/** ...and how much of what was asked that canned question must account for. */
const CURATED_MIN_PRECISION = 0.5;

/**
 * What naming somebody in the query is worth - level with a title hit.
 *
 * Deliberately not more: "sarah buffers" must not rank a Sarah meeting with no
 * buffers in it above the meeting that is actually about buffers.
 */
const PERSON_WEIGHT = 6;

interface IndexedMeeting {
  meeting: Meeting;
  /** Folded term -> total field weight in this meeting. */
  weights: Map<string, number>;
  /** Folded term -> indices of the transcript lines carrying it. */
  lines: Map<string, number[]>;
}

/**
 * The slice of the voice directory retrieval needs. `SpeakerResolver` satisfies
 * it structurally, so `Ask` passes `speakers` straight through.
 */
export interface VoiceLookup {
  people: User[];
  personIdOf(meeting: Meeting, speakerId: string): string | undefined;
  nameOf(meeting: Meeting, speakerId: string): string;
}

/**
 * Who spoke where, kept apart from the content index on purpose.
 *
 * A name is not stored on the meeting - it is resolved through the voice
 * directory, so renaming a voice changes no `Meeting` object at all. The
 * content index is cached on meeting identity and would therefore never notice
 * the rename. This layer is rebuilt on every `buildIndex` call instead, which
 * costs a few dozen map writes and is always current.
 */
interface PersonLayer {
  /** Folded name token -> person ids. "sarah" and "chen" both find her. */
  byTerm: Map<string, Set<string>>;
  /** Person id -> display name, for the prose. */
  names: Map<string, string>;
  /** Person id -> meeting id -> the slots they hold in that meeting. */
  presence: Map<string, Map<string, string[]>>;
  /** Distinct voices nobody has named yet, for the no-match hint. */
  unnamedVoices: number;
}

export interface AskIndex {
  /** Meetings that can actually be searched. */
  readable: IndexedMeeting[];
  /** In-flight jobs, indexed on the little they have (a title) so a question
   *  about one can be answered with "not yet" instead of "no". */
  pending: IndexedMeeting[];
  /** Every meeting by id, so a citation resolves against the live record. */
  byId: Map<string, Meeting>;
  /** The archive's own tags, most used first, for the no-match copy. */
  tags: string[];
  /** Who spoke where, as the voice directory currently reads it. */
  people: PersonLayer;
  /** Kept so an answer can name a voice; rebuilt with the index on rename. */
  voices: VoiceLookup;
}

/**
 * Built per meeting and cached on its identity, the same way `speakers.ts`
 * caches slot lookups. `App` spreads a new object whenever it changes a
 * meeting, so ticking one action item re-indexes that meeting alone rather
 * than the whole archive.
 */
const indexCache = new WeakMap<Meeting, IndexedMeeting>();

function indexMeeting(meeting: Meeting): IndexedMeeting {
  const cached = indexCache.get(meeting);
  if (cached) return cached;

  const weights = new Map<string, number>();
  const lines = new Map<string, number[]>();

  // Reused across fields rather than reallocated per call - one meeting can
  // run this a few hundred times.
  const seen = new Set<string>();

  const addField = (text: string, weight: number) => {
    if (!text) return;
    for (const token of tokenize(text)) {
      const term = fold(token);
      // Distinct terms per field, so repetition inside one field earns nothing.
      if (!seen.has(term)) {
        seen.add(term);
        weights.set(term, (weights.get(term) ?? 0) + weight);
      }
    }
    seen.clear();
  };

  addField(meeting.title, FIELD_WEIGHTS.title);
  addField(meeting.gist, FIELD_WEIGHTS.gist);
  addField(meeting.summary, FIELD_WEIGHTS.summary);
  for (const topic of meeting.topics) {
    addField(topic.title, FIELD_WEIGHTS.topicTitle);
    addField(topic.details, FIELD_WEIGHTS.topicDetails);
  }
  for (const decision of meeting.decisions) addField(decision, FIELD_WEIGHTS.decision);
  for (const action of meeting.actionItems) addField(action.item, FIELD_WEIGHTS.actionItem);
  for (const quote of meeting.quotes) addField(quote.quote, FIELD_WEIGHTS.quote);
  for (const tag of meeting.tags) addField(tag, FIELD_WEIGHTS.tag);

  // The transcript is indexed by line as well as scored, because a citation
  // has to name the moment a thing was said, not just the meeting.
  meeting.transcript.forEach((line, i) => {
    for (const token of tokenize(line.text)) {
      const term = fold(token);
      if (seen.has(term)) continue;
      seen.add(term);
      const hits = lines.get(term);
      if (hits) hits.push(i);
      else lines.set(term, [i]);
    }
    seen.clear();
  });

  for (const [term, hits] of lines) {
    const weight = Math.min(hits.length, MAX_TRANSCRIPT_LINES) * FIELD_WEIGHTS.transcriptLine;
    weights.set(term, (weights.get(term) ?? 0) + weight);
  }

  const indexed: IndexedMeeting = { meeting, weights, lines };
  indexCache.set(meeting, indexed);
  return indexed;
}

/**
 * Names, read fresh out of the voice directory.
 *
 * Diarization labels ("SPEAKER 2") are deliberately not indexed: "speaker"
 * appears in every meeting, so it would match everything while meaning nothing.
 * An unnamed voice is counted by its print instead, so the same anonymous voice
 * across two meetings is one person to name rather than two.
 */
function buildPersonLayer(readable: IndexedMeeting[], voices: VoiceLookup): PersonLayer {
  const byTerm = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  const presence = new Map<string, Map<string, string[]>>();
  const unnamed = new Set<string>();

  for (const { meeting } of readable) {
    for (const slot of meeting.speakers) {
      const personId = voices.personIdOf(meeting, slot.id);
      if (!personId) {
        unnamed.add(slot.voicePrint);
        continue;
      }

      names.set(personId, voices.nameOf(meeting, slot.id));

      for (const token of tokenize(names.get(personId) ?? "")) {
        const term = fold(token);
        const ids = byTerm.get(term);
        if (ids) ids.add(personId);
        else byTerm.set(term, new Set([personId]));
      }

      let heardIn = presence.get(personId);
      if (!heardIn) {
        heardIn = new Map();
        presence.set(personId, heardIn);
      }
      const slots = heardIn.get(meeting.id);
      if (slots) slots.push(slot.id);
      else heardIn.set(meeting.id, [slot.id]);
    }
  }

  return { byTerm, names, presence, unnamedVoices: unnamed.size };
}

export function buildIndex(meetings: Meeting[], voices: VoiceLookup): AskIndex {
  const readable: IndexedMeeting[] = [];
  const pending: IndexedMeeting[] = [];
  const byId = new Map<string, Meeting>();
  const tagCounts = new Map<string, number>();

  for (const meeting of meetings) {
    byId.set(meeting.id, meeting);

    if (isReadable(meeting)) {
      readable.push(indexMeeting(meeting));
      for (const tag of meeting.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    } else if (meeting.status !== "failed") {
      // A failed job will never become searchable, so it is not "coming soon".
      pending.push(indexMeeting(meeting));
    }
  }

  const tags = Array.from(tagCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);

  return { readable, pending, byId, tags, voices, people: buildPersonLayer(readable, voices) };
}

/* ------------------------------------------------------------------ */
/* Scoring                                                              */
/* ------------------------------------------------------------------ */

/** A question, with everything the index could tell us about it up front. */
interface Query {
  terms: string[];
  /** Terms that name somebody the voice directory knows. */
  personTerms: string[];
  /** Everyone the query named, whether or not they turn up in a result. */
  personNames: string[];
  /** "Who ...?" wants a person back, not a decision. */
  asksWho: boolean;
}

function readQuery(raw: string, terms: string[], people: PersonLayer): Query {
  const personTerms = terms.filter((term) => people.byTerm.has(term));
  const personNames: string[] = [];

  for (const term of personTerms) {
    for (const personId of people.byTerm.get(term) ?? []) {
      const name = people.names.get(personId);
      if (name && !personNames.includes(name)) personNames.push(name);
    }
  }

  return {
    terms,
    personTerms,
    personNames,
    // Tested on the raw text: `who` is a stopword, so by the time terms exist
    // the question's own subject has already been dropped.
    asksWho: /\bwho\b/i.test(raw),
  };
}

interface Scored {
  indexed: IndexedMeeting;
  /** The query terms this meeting actually carries, names included. */
  matched: string[];
  /** Just the terms found in the meeting's own text - what lines rank on. */
  contentMatched: string[];
  score: number;
  /** Slots held here by the people the query named. Empty if it named nobody. */
  personSlots: Set<string>;
  /** Those people's names, for the prose. */
  personNames: string[];
}

function scoreMeeting(indexed: IndexedMeeting, q: Query, people: PersonLayer): Scored | null {
  const meetingId = indexed.meeting.id;
  const personSlots = new Set<string>();
  const personNames: string[] = [];
  const namedHere = new Set<string>();

  // A person term only counts for a meeting they actually spoke in.
  for (const term of q.personTerms) {
    for (const personId of people.byTerm.get(term) ?? []) {
      const slots = people.presence.get(personId)?.get(meetingId);
      if (!slots) continue;

      namedHere.add(term);
      for (const slotId of slots) personSlots.add(slotId);

      const name = people.names.get(personId);
      if (name && !personNames.includes(name)) personNames.push(name);
    }
  }

  const matched = q.terms.filter(
    (term) => indexed.weights.has(term) || namedHere.has(term)
  );

  // A single shared word is enough for a two-word query and nowhere near
  // enough for a six-word one.
  const required = q.terms.length <= 2 ? 1 : Math.ceil(q.terms.length / 3);
  if (matched.length < required) return null;

  let raw = 0;
  for (const term of matched) {
    raw += indexed.weights.get(term) ?? 0;
    if (namedHere.has(term)) raw += PERSON_WEIGHT;
  }

  // Coverage, not raw weight, is what separates a meeting that mentions one
  // word ten times from one that answers three quarters of the question.
  const coverage = matched.length / q.terms.length;
  // A name is a person signal, never subject matter: somebody saying "Alex,
  // can you..." must not read as the meeting being *about* Alex.
  const named = new Set(q.personTerms);

  return {
    indexed,
    matched,
    contentMatched: matched.filter((term) => indexed.weights.has(term) && !named.has(term)),
    personSlots,
    personNames,
    score: raw * (COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) * coverage),
  };
}

/**
 * The transcript lines carrying the most of the query, earliest first on ties.
 *
 * `onlySlots` narrows to one person's lines, which is what turns "what did
 * Sarah say about buffers" into her words rather than anybody's.
 */
function rankLines(scored: Scored, limit: number, onlySlots?: Set<string>): TranscriptLine[] {
  const { transcript } = scored.indexed.meeting;

  // A bare name has nothing to rank on - the archive does not index a person's
  // lines under their name. Hand back their opening words rather than nothing.
  if (onlySlots && !scored.contentMatched.length) {
    return transcript.filter((line) => onlySlots.has(line.speakerId)).slice(0, limit);
  }

  const hits = new Map<number, number>();

  for (const term of scored.contentMatched) {
    for (const i of scored.indexed.lines.get(term) ?? []) {
      if (onlySlots && !onlySlots.has(transcript[i].speakerId)) continue;
      hits.set(i, (hits.get(i) ?? 0) + 1);
    }
  }

  return Array.from(hits)
    .sort((a, b) => b[1] - a[1] || transcript[a[0]].startMs - transcript[b[0]].startMs)
    .slice(0, limit)
    .map(([i]) => transcript[i]);
}

/**
 * Where to point. Every branch carries a real `startMs`, which is what makes a
 * citation an offer to listen rather than a link.
 */
function citationsFor(scored: Scored, limit: number): Citation[] {
  const { meeting } = scored.indexed;
  // Read from the live record, so a retitled meeting cites its current name.
  const common = { meetingId: meeting.id, meetingTitle: meeting.title };

  // When the query named somebody who spoke here, quote them; fall back to the
  // rest of the room only if they said nothing on the subject.
  const own = scored.personSlots.size ? rankLines(scored, limit, scored.personSlots) : [];
  const lines = own.length ? own : rankLines(scored, limit);
  if (lines.length) {
    return lines.map((line) => ({
      ...common,
      speakerId: line.speakerId,
      text: line.text,
      startMs: line.startMs,
    }));
  }

  const matched = new Set(scored.matched);
  const quote =
    meeting.quotes.find((q) => tokenize(q.quote).some((t) => matched.has(fold(t)))) ??
    meeting.quotes[0];
  if (quote) {
    return [{ ...common, speakerId: quote.speakerId, text: quote.quote, startMs: quote.startMs }];
  }

  // Nothing said, nothing pulled, nobody to attribute it to. Inventing
  // "speaker-1" here would render as UNKNOWN VOICE, so cite nothing instead.
  const [slot] = meeting.speakers;
  if (!slot || !meeting.gist) return [];
  return [{ ...common, speakerId: slot.id, text: meeting.gist, startMs: 0 }];
}

/** Whether a piece of the meeting carries any of the matched terms. */
function hitTest(scored: Scored): (text: string) => boolean {
  const matched = new Set(scored.matched);
  return (text) => tokenize(text).some((token) => matched.has(fold(token)));
}

/** The subject-matter answer: decision, else topic, else gist. */
function contentAnswer(scored: Scored): string {
  const { meeting } = scored.indexed;
  const hit = hitTest(scored);

  const decision = meeting.decisions.find(hit);
  if (decision) return `In "${meeting.title}", the decision on record is: ${decision}`;

  const topic = meeting.topics.find((t) => hit(t.title) || hit(t.details));
  if (topic) {
    return `In "${meeting.title}", the discussion under "${topic.title}" covered: ${topic.details}`;
  }

  return `In "${meeting.title}", the meeting is summarised as: ${meeting.gist}`;
}

/**
 * Prose built from whatever actually matched.
 *
 * A question about a person is answered with that person - who owns the item,
 * who said the line - because "who said that" is the thing this product is for.
 * Everything else falls through to the subject matter.
 */
function composeAnswer(
  scored: Scored,
  citations: Citation[],
  q: Query,
  voices: VoiceLookup,
  /** The query named someone who is in none of the matching meetings. */
  personMissing: boolean
): string {
  const { meeting } = scored.indexed;
  const hit = hitTest(scored);

  if (personMissing) {
    const who = q.personNames.join(" and ");
    return `${who} is not in any meeting that covers this. ${contentAnswer(scored)}`;
  }

  if (q.asksWho) {
    // An action item names its owner outright, which is the strongest answer
    // a "who" question can get.
    const owned = meeting.actionItems.find((item) => hit(item.item));
    if (owned) {
      return `${voices.nameOf(meeting, owned.speakerId)} took this on in "${meeting.title}": ${owned.item}`;
    }

    const [line] = rankLines(scored, 1);
    if (line) {
      return `${voices.nameOf(meeting, line.speakerId)} said it in "${meeting.title}": "${line.text}"`;
    }
  }

  if (scored.personNames.length) {
    const who = scored.personNames.join(" and ");
    const theirs = citations.find((cite) => scored.personSlots.has(cite.speakerId));
    if (theirs) return `${who}, in "${meeting.title}": "${theirs.text}"`;

    // Present, but silent on the subject. Say that rather than letting the
    // citation below read as something they said.
    return `${who} was in "${meeting.title}" but the matching discussion came from other voices. ${contentAnswer(scored)}`;
  }

  return contentAnswer(scored);
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                             */
/* ------------------------------------------------------------------ */

export type AskOutcome =
  | { kind: "empty-archive"; pendingCount: number }
  | { kind: "no-terms"; reason: "too-short" | "all-common" }
  | { kind: "no-match"; tags: string[]; pendingCount: number; unnamedVoices: number }
  | { kind: "processing-only"; pending: { id: string; title: string }[] }
  | {
      kind: "answer";
      /** `curated` is a hand-written fixture answer; `generated` is assembled. */
      source: "curated" | "generated";
      answer: string;
      meetingIds: string[];
      /** What the match was actually made on, shown rather than hidden. */
      terms: string[];
      citations: Citation[];
      /** In-flight jobs that might also answer this once they finish. */
      pendingCount: number;
    };

type AskAnswer = Extract<AskOutcome, { kind: "answer" }>;

/** Every source meeting still present, and still readable. */
function sourcesAreLive(entry: MockQuestion, index: AskIndex): boolean {
  return entry.sourceMeetings.every((id) => {
    const meeting = index.byId.get(id);
    return meeting !== undefined && isReadable(meeting);
  });
}

/**
 * The hand-written answers, used only when the question genuinely *is* one of
 * them. Both ratios have to clear their gate, so asking "oryzo" falls through
 * to real retrieval instead of returning an essay about a beta release, and a
 * one-letter query returns nothing at all.
 */
function curatedAnswer(terms: string[], index: AskIndex): AskAnswer | null {
  const asked = new Set(terms);
  let best: { entry: MockQuestion; recall: number } | null = null;

  for (const entry of MOCK_QUESTIONS) {
    if (!sourcesAreLive(entry, index)) continue;

    const candidate = queryTerms(entry.question);
    if (!candidate.length) continue;

    const shared = candidate.filter((term) => asked.has(term)).length;
    const recall = shared / candidate.length;
    const precision = shared / terms.length;
    if (recall < CURATED_MIN_RECALL || precision < CURATED_MIN_PRECISION) continue;

    if (!best || recall > best.recall) best = { entry, recall };
  }

  if (!best) return null;

  // The fixture citations carry their own copy of the title and a speaker slot
  // that may not exist any more. Re-project both onto the live record.
  const citations = best.entry.citations.flatMap<Citation>((cite) => {
    const live = index.byId.get(cite.meetingId);
    if (!live || !live.speakers.some((s) => s.id === cite.speakerId)) return [];
    return [{ ...cite, meetingTitle: live.title }];
  });

  return {
    kind: "answer",
    source: "curated",
    answer: best.entry.answer,
    meetingIds: best.entry.sourceMeetings,
    terms,
    citations,
    pendingCount: 0,
  };
}

export function answerQuestion(query: string, index: AskIndex): AskOutcome {
  if (!index.readable.length) {
    return { kind: "empty-archive", pendingCount: index.pending.length };
  }

  const terms = queryTerms(query);
  if (!terms.length) {
    // Why there is nothing to search on: "the" is common, "e" is just short.
    const raw = tokenize(query);
    const allCommon = raw.length > 0 && raw.every((token) => STOPWORDS.has(token));
    return { kind: "no-terms", reason: allCommon ? "all-common" : "too-short" };
  }

  const q = readQuery(query, terms, index.people);

  // Jobs whose title looks like the question. Not an answer, but the reason
  // there isn't one yet.
  const pendingHits = index.pending.filter((p) => terms.some((t) => p.weights.has(t)));

  const curated = curatedAnswer(terms, index);
  if (curated) return { ...curated, pendingCount: pendingHits.length };

  const scored = index.readable
    .map((indexed) => scoreMeeting(indexed, q, index.people))
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.score - a.score || byNewestFirst(a.indexed.meeting, b.indexed.meeting));

  /**
   * Naming somebody is a filter, not a hint - and so is the rest of the
   * question. "What did Sarah say about buffers" must not answer out of a
   * meeting Sarah was never in, and must not quietly drop "buffers" either.
   */
  const hasSubject = q.terms.length > q.personTerms.length;
  const onTopic = (s: Scored) => !hasSubject || s.contentMatched.length > 0;

  let pool = scored;
  let personMissing = false;

  if (q.personNames.length) {
    const theirs = scored.filter((s) => s.personSlots.size > 0 && onTopic(s));
    if (theirs.length) {
      pool = theirs;
    } else {
      // They were named but are in nothing that covers the subject. Say so,
      // and still answer the subject rather than returning nothing.
      const topical = scored.filter(onTopic);
      pool = topical.length ? topical : scored.filter((s) => s.personSlots.size > 0);
      personMissing = topical.length > 0;
    }
  }

  const ranked = pool.slice(0, MAX_SOURCE_MEETINGS);

  if (ranked.length) {
    const [top] = ranked;
    // One meeting gets two moments; several get one apiece.
    const citations =
      ranked.length === 1
        ? citationsFor(top, 2)
        : ranked.flatMap((scored) => citationsFor(scored, 1)).slice(0, MAX_CITATIONS);

    return {
      kind: "answer",
      source: "generated",
      // The prose speaks about the top meeting, so it is judged on the
      // citations that came from it.
      answer: composeAnswer(
        top,
        citations.filter((cite) => cite.meetingId === top.indexed.meeting.id),
        q,
        index.voices,
        personMissing
      ),
      meetingIds: ranked.map((scored) => scored.indexed.meeting.id),
      terms,
      citations,
      pendingCount: pendingHits.length,
    };
  }

  if (pendingHits.length) {
    return {
      kind: "processing-only",
      pending: pendingHits.map((p) => ({ id: p.meeting.id, title: p.meeting.title })),
    };
  }

  return {
    kind: "no-match",
    tags: index.tags.slice(0, 3),
    pendingCount: index.pending.length,
    unnamedVoices: index.people.unnamedVoices,
  };
}

/* ------------------------------------------------------------------ */
/* Suggestions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Questions worth offering, all of which the archive can currently answer.
 *
 * The curated ones come first while their meetings are still present; the rest
 * are read off the archive itself, so clearing it leaves no dead suggestions
 * behind. Deterministic, so the list does not reshuffle between renders.
 */
/**
 * "What did <the voice you hear most> say about <something they were there for>?"
 *
 * Picks the most-heard named voice, tie-broken on id so the list does not
 * reshuffle between renders, and a topic from the newest meeting they spoke in.
 */
function personSuggestion(index: AskIndex, newestFirst: Meeting[]): string | null {
  let best: { id: string; heard: number } | null = null;

  for (const [personId, heardIn] of index.people.presence) {
    if (!best || heardIn.size > best.heard || (heardIn.size === best.heard && personId < best.id)) {
      best = { id: personId, heard: heardIn.size };
    }
  }
  if (!best) return null;

  const name = index.people.names.get(best.id);
  const heardIn = index.people.presence.get(best.id);
  if (!name || !heardIn) return null;

  const meeting = newestFirst.find((m) => heardIn.has(m.id));
  const topic = meeting?.topics[0];
  return topic ? `What did ${name} say about ${topic.title}?` : null;
}

export function suggestedQuestions(index: AskIndex, limit = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (question: string) => {
    const key = question.toLowerCase();
    if (out.length >= limit || seen.has(key)) return;
    seen.add(key);
    out.push(question);
  };

  const meetings = index.readable.map((indexed) => indexed.meeting).sort(byNewestFirst);

  // One person-shaped suggestion, so asking by name is discoverable at all.
  // A slot is held back for it, or the curated five would fill the list and
  // the capability would never show itself.
  const byPerson = personSuggestion(index, meetings);
  const curatedRoom = byPerson ? limit - 1 : limit;

  for (const entry of MOCK_QUESTIONS) {
    if (out.length >= curatedRoom) break;
    if (sourcesAreLive(entry, index)) push(entry.question);
  }
  if (byPerson) push(byPerson);

  if (out.length >= limit) return out;

  // Round-robin by topic depth rather than draining one meeting, so the
  // suggestions span the archive instead of describing a single call.
  const deepest = meetings.reduce((max, m) => Math.max(max, m.topics.length), 0);
  for (let pass = 0; pass < deepest && out.length < limit; pass += 1) {
    for (const meeting of meetings) {
      const topic = meeting.topics[pass];
      if (topic) push(`What did we decide about ${topic.title}?`);
    }
  }

  for (const meeting of meetings) {
    if (!meeting.topics.length) push(`What happened in ${meeting.title}?`);
  }

  return out;
}
