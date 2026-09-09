Introduction:-

What is the Project?

An AI-powered memory system for meetings.

What am  I Building ?


MeetWise AI is an AI-powered meeting tool. Rather than other tools, it can not only tells what happened but tells what happens, why this happens and who said that. It allows users to upload meeting recordings, convert the recordings into transcripts, extract topics , decisions, actions and key takeaways. It also summarizes the meeting and can keep long-term memory. It provides the markdown file and JSON file of that meeting.
In Future, i will integrate Live meeting AI Bot in meetings, where the bot can join the meeting , listens the whoel conversations,and at the end of meeting it provides the doc of meeting.

Who it is for?

Basically it is for those who have to attend multiple meetings online through different platforms. For those it will be better option to adopt as it provides multiple facilities at a time.



Rules:


Optimize the whole code means every code snippet is written in optimized way.
Keep the existing MeetWise design and UI consistent.
Explain and plan changes before implementing them.








---

## Ask / retrieval  (added 2026-09-02)

**The archive is the array `App` owns — never `MOCK_MEETINGS`.** No component may
import the fixtures for display or search. `Ask` used to, which meant uploads
were invisible to it and deleted meetings were still cited; that is the bug this
section exists to keep fixed.

`src/retrieval.ts` is the whole retrieval path, pure and React-free, in the same
shape as `processing.ts` / `commitments.ts` / `speakers.ts`. `Ask.tsx` stays
presentational: it takes `meetings` and `speakers`, calls
`buildIndex(meetings, speakers)` in a `useMemo`, and calls `answerQuestion` on
submit. Retrieval declares only the slice of the resolver it needs, as
`VoiceLookup` — `SpeakerResolver` satisfies it structurally.

**The two-layer index is load-bearing.** A name is not stored on a `Meeting`; it
is resolved through the voice directory, so renaming a voice changes no `Meeting`
object at all. The **content index is cached in a `WeakMap` keyed on meeting
identity and must stay names-free** — put a name in it and it goes silently stale
on the next rename. Anything resolved through the voice directory belongs in the
**person layer**, which is rebuilt on every `buildIndex` call and costs a few
dozen map writes. That is why `Ask`'s memo depends on `speakers`: naming a voice
rebuilds the cheap layer and reuses every content index.

- **Term scoring, not substring matching.** The query is tokenized, stripped of
  stopwords and folded for plurals; meetings are scored on weighted field hits
  (`FIELD_WEIGHTS`) multiplied by how much of the query they cover. Passing a
  whole question to `String.includes` is what made Ask look like it worked while
  matching nothing.
- **Only `ready` meetings are searchable.** A job still transcribing has no
  transcript, so it is indexed on its title alone and reported as
  `processing-only` — "not yet", never a silent miss.
- **`MOCK_QUESTIONS` answers are gated.** They fire only when the asked question
  genuinely is that question (recall and precision both clear a threshold) *and*
  every `sourceMeetings` id is still live and readable. Without the gate a
  one-character query returned a confident canned answer.
- **Citations resolve at render time.** `Ask` looks each `meetingId` up in the
  live index: a meeting that is gone has its row dropped rather than rendered as
  a dead click, and the speaker is named through `SpeakerResolver`, so naming a
  voice updates an answer already on screen. Every citation carries a real
  `startMs` — that contract is what makes it playable.
- **People are searchable, and naming one is a filter.** A query term that names
  a known voice restricts the answer to meetings that person actually spoke in,
  and steers citations to *their* lines. It never discards the rest of the
  question: if they are in no meeting covering the subject, the answer says so
  and still answers the subject. If they were present but silent on it, it says
  that too rather than letting a citation read as something they said.
- **A name is a person signal, never subject matter.** Person terms are excluded
  from `contentMatched`, so somebody saying "Alex, can you…" does not make the
  meeting read as being *about* Alex. Diarization labels are not indexed either —
  "speaker" appears everywhere and would match everything.
- **"Who …?" is detected on the raw query**, before terms are built — `who` is a
  stopword, so by then the question's own subject is already gone. Such a query
  is answered with a person: the action item's owner, else the speaker of the
  matching line.
- **Suggestions are live.** Curated questions appear only while their meetings
  exist; the rest are derived from the archive's own topics, plus exactly one
  person-shaped suggestion (a slot is reserved for it, or the curated five would
  crowd it out and asking by name would never be discoverable).
- **`AskOutcome` is a total union.** Five outcomes, all designed. Add a state to
  the union before rendering it.

Retrieval is keyword matching, so the UI says `KEYWORD RETRIEVAL` and
`MATCHED FROM YOUR ARCHIVE`, not "semantic" and not "AI response engine". The
provenance rail under each answer names the terms it matched on. Do not restore
the stronger wording until there is a model behind it.


<!-- # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # tsc -b (project references) then vite build
npm run lint      # oxlint (not ESLint)
npm run preview   # serve the production build
```

There is no test framework in this project — `npm run build` (which type-checks via `tsc -b`) plus `npm run lint` are the full verification path.

## What this is

Meetwise AI — a **single-page, front-end-only prototype** of a meeting-capture / recall product. React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (via `@tailwindcss/vite`, no PostCSS config) + `motion` (Framer Motion's successor).

There is no backend, no router, and no persistence. Everything is driven by `src/mockData.ts`; state lives in `useState` in `App.tsx` and resets on reload. "Live capture" is a scripted playback of `MOCK_LIVE_SPEECH_STREAM` on timers, and "Ask" is a `setTimeout` + substring match over `MOCK_QUESTIONS` with a keyword fallback across `MOCK_MEETINGS`. When adding features, follow this convention: extend the mock data and simulate, rather than reaching for a real API.

## Architecture

**Navigation is hand-rolled, not routed.** `App.tsx` holds two orthogonal pieces of state:

- `view: "landing" | "live" | "detail"` — full-screen views that *replace* the landing page entirely (early `return`s before the landing JSX).
- `activeSection: "home" | "owed" | "meetings" | "ask" | "settings"` — which landing section the sticky nav underlines.

All five landing sections render simultaneously as `<section id={...}>` on one scrolling page. Nav clicks call `scrollIntoView`; an `IntersectionObserver` with `rootMargin: "-68px 0px -55% 0px"` (the `--nav-height` band under the sticky nav) drives `activeSection` back the other way. `returnSection` is a ref recording where to scroll back to when leaving `live`/`detail` — and because a section only exists in the DOM once the landing page renders, navigating away from a full-screen view sets `view` first, then scrolls inside a `requestAnimationFrame`.

**Data model** — everything hangs off the `Meeting` interface in `src/mockData.ts` (topics, decisions, actionItems, quotes, transcript, tags). `LiveCapture` builds a fully-formed `Meeting` on save and hands it to `App`, which prepends it and jumps straight to `detail`.

**Time is stored as data, never as display text.** `Meeting.startedAt` is an ISO 8601 UTC instant and `durationMs` is a number; each `TranscriptLine` carries `startMs`/`endMs` offsets from `startedAt`. Every human-readable label (`"AUG 22, 2026"`, `"14:00 - 14:45 (45 MIN)"`) is derived at render time by `src/datetime.ts` — do not add pre-formatted date, time or duration strings back to the model. Instants render in the *viewer's* time zone, so the UTC fixtures read as local clock times. `timed()` in `mockData.ts` fills `endMs` in from word count for hand-authored lines. `ownerId` keys into `MOCK_USERS`; `audioUrl` is a blob URL on uploads and absent on the seeded fixtures.

**Speakers are identities, not strings.** Diarization cannot name voices, so `Meeting.speakers` holds `SpeakerSlot`s (`{ id: "speaker-1", label: "SPEAKER 1", voicePrint }`) and every reference to a person inside a meeting — `TranscriptLine.speakerId`, `Quote.speakerId`, `ActionItem.speakerId`, `Citation.speakerId` — points at a slot. There is no `participants` field; it is derived. Names live in the voice directory (`voicePrint -> personId`, seeded by `INITIAL_VOICE_DIRECTORY`), which `App` holds alongside `people` and exposes to components as a single `SpeakerResolver` prop built by `createSpeakerResolver` in `src/speakers.ts`.

That indirection is the feature: naming a voice writes one directory entry, so it applies retroactively to every meeting that voice has ever spoken in, and typing a name that already exists merges the voice into that person rather than duplicating them. Never resolve a name by writing it into a meeting record. `SpeakerPanel` is the per-meeting naming UI; `Settings` shows the whole directory. The sample upload deliberately carries one known voice print and two unknown ones, so the naming flow has something to do.

**Playback** — `src/useMeetingAudio.ts` owns a playhead in milliseconds; `AudioPlayer` is its transport. Quotes (`Quote.startMs`), transcript lines (`TranscriptLine.startMs`) and Ask citations (`Citation.startMs`) are all seek targets into that one playhead, which is what makes a citation "jump to 12:03 and play" rather than just a link. `Ask` passes a timestamp through `onSelectMeeting(id, startMs)`; `App` holds it as `pendingSeekMs` and hands it to `MeetingDetail` as `initialSeekMs`.

There are two engines behind the playhead. A meeting with an `audioUrl` (an upload) plays the real file through an `Audio` element. The seeded fixtures have no audio file, so they fall back to `narration` — the browser's speech synthesis reads the transcript line under the playhead, labelled as synthesised in the UI rather than passed off as a recording. Narration skips any gap longer than `SILENCE_SKIP_MS`, including the run-up before the first line and the tail after the last, because there is no recording to play through. `silent` is the third mode: no file and no speech synthesis, so the timeline still seeks and highlights but claims no audio.

**Commitments are a projection, not a second store.** Action items live on their meeting and nowhere else; `src/commitments.ts` flattens them across the archive and filters by owner, resolving `ActionItem.speakerId` through `speakers.personIdOf` so "mine" means the voice directory says that voice is you. Ticking one calls `App.handleToggleActionItem(meetingId, index)`, which updates that meeting — never a parallel task list. Open items sort oldest first (a three-week-old promise outranks yesterday's); completed ones sort newest first and sink below. An item owned by an unnamed voice has no `ownerId`, so it can never be "mine" — naming that voice is what claims it.

**Settings are real, and say what is true.** `src/settings.ts` holds `AppSettings` (transcription model, analysis model, language, retention window, discard-audio-after-processing) with the option lists and `expiredMeetings`; `src/exportArchive.ts` renders the archive to JSON or Markdown with speaker slots and offsets resolved, so an export reads on its own. `App` owns the settings state and the account/voice directory, and passes handlers down.

An earlier version of this page advertised AES-GCM-256, IndexedDB enclaves, 24-hour key rotation, and zero cloud telemetry. None of it existed, and it contradicts the intended stack — cloud speech-to-text followed by an LLM pass. **Do not reintroduce capability claims the build cannot honour.** Anything not yet wired up is labelled as such in the Settings footer and on the upload screen, which state plainly that processing is simulated and that recordings will go to third-party services once real. Model choice and language are surfaced on the `Processing` screen; retention purge, discard-audio, speaker naming, account rename, and export all actually do what they say.

**Components** (`src/components/`) are presentational and take callbacks from `App`; none of them own cross-section state. `Home` embeds `Hero`; `TopNav` is rendered by `App` for both landing and detail views.

## Styling

Tailwind v4 with the design tokens declared in an `@theme` block at the top of `src/index.css` — colors (`--color-warm-cream`, `--color-walnut-shadow`, `--color-ember-accent`, …), the `--font-sans` brand family, radii, and `--nav-height`. The cream/wheat palette (`--color-cream-bg`, `--color-ink`, …) exists solely for the one inverted light band, the Archive section (`.landing-section--cream`).

Custom classes live in `@layer utilities` in `src/index.css`, using BEM-ish names (`hero__nav-item`, `timeline-marker`, `landing-section`, `divider-dashed`) alongside a hand-rolled type scale (`text-display-custom`, `text-heading-custom`, `text-body-custom`, `text-label-uppercase`). **Colors go through the tokens, always.** Every color in the app is a `@theme` token used as a Tailwind utility (`bg-walnut-shadow`, `text-warm-cream/85`, `border-cork-border/50`, `divide-cork-border`) or as `var(--color-*)` inside `@layer utilities`. Arbitrary hex values (`bg-[#100904]`) are gone and should not come back — they were the same values as the tokens, just unsearchable and impossible to retheme. Non-color arbitrary values (`text-[10px]`, `rounded-[12px]`, `tracking-[0.2em]`) are still normal and fine. If you need a shade that has no token, add one to `@theme` rather than inlining it — that is what `--color-bark-raised` is.

`src/App.css` is leftover Vite template CSS and is **not imported anywhere** — ignore it.

`src/components/Logo.tsx` loads `/logo.svg` from `public/`, which does not exist in the repo; the component renders nothing on error by design.

## Motion

Shared animation variants live in `src/motion.ts` (`fadeUp`, `staggerContainer`, `fadeInFrom`, `markerPop`, `cardHover`, `cardTap`, `viewportOnce`) so the page animates as one system — import from there rather than defining new inline timings. `App` wraps everything in `<MotionConfig reducedMotion="user">`, so individual components must **not** re-check `prefers-reduced-motion` (the one exception is the imperative `scrollIntoView` in `App.tsx`, which Motion can't see).

## Design system

`design.md` is the authoritative style reference ("ORYZO AI" darkroom-editorial system) — read its Do's and Don'ts before making visual changes. The load-bearing rules:

- Never pure `#fff` text or `#000` backgrounds; warm cream `#ffedd7` on walnut shadow `#100904`.
- Ember `#dc5000` is an *editorial accent only* — labels, tags, credit lines. Note the codebase deviates from this on the hero/nav CTA buttons, which are ember-filled.
- Uppercase, weight 500 for essentially all UI text; mixed-case weight 400 is reserved for body copy. **This applies to chrome only** — see the casing rule below, a deliberate deviation from `design.md`, which describes a marketing site with no user-generated content and so says never to sentence-case a heading.
- No drop shadows — depth is the two-step surface stack `#100904 → #382416`.
- Radius vocabulary is only 12px (cards), 22.5px (ghost buttons), 36px (pill CTAs), 0px (inputs/links), 9999px (full).

### Casing: chrome vs user content

`design.md` sets everything in caps, which is right for a site whose every word is written by the designer. This product has user-generated content, and uppercase fights it: real titles arrive as `q3 planning sync`, not `Q3 PLANNING SYNC`.

**Never bake casing into the data.** Meeting titles, topic headings, tags, and people's names are stored exactly as typed (`title: "Oryzo kick-off: design stack & manufacturing"`, `name: "Sarah Chen"`, `tags: ["Design"]`). Casing is a display decision:

- **Chrome** — eyebrows, section headings, nav, button labels, status pills, meta rails, stage names: uppercase, applied with the `uppercase` utility at the render site.
- **User content shown as a label** — tags, speaker names, participant chips, action-item owners: stored naturally, uppercased in CSS where it is rendered as chrome.
- **User content shown as itself** — meeting titles, topic headings, summaries, quotes, transcript text: left alone. Titles carry `.user-title`, which capitalises only the first letter via `::first-letter`, so `q3 planning sync` reads as `Q3 planning sync` while `iOS` and `WebAudio` survive.
- **Anything the user is typing** — the archive search box, the title field, the voice-name field: never transformed. Uppercasing someone's input as they type it is the worst version of this bug.

The typeface in `design.md` (halyard-display-variable) is substituted here with **Satoshi**, loaded from Fontshare in `src/index.css` and preconnected in `index.html`.

`.agents/skills/design-taste-frontend/SKILL.md` is a vendored anti-generic-design skill (pinned in `skills-lock.json`) covering frontend design direction — consult it for larger visual/layout work. -->
