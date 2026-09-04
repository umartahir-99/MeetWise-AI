# MeetWise AI — Project Status Assessment

_Assessed 2026-08-30 against `MeetWise_AI_Workflow.md`, `design.md`, and the full `src/` tree. Build compiles clean (`npm run build`)._

---

## Summary

What exists today is a **UI shell, 100% mock-driven**. Roughly 3,000 lines of React 19 / Vite 8 / Tailwind 4. There are no network calls, no persistence, and no media APIs anywhere in the codebase — a grep across `src/` returns zero hits for `fetch`, `localStorage`, `indexedDB`, `getUserMedia`, and `MediaRecorder`.

**Overall MVP completion: ~15%.** The frontend is the smallest remaining piece of work.

| Area | Done |
| --- | --- |
| Design system / visual language | ~90% |
| Screen layouts (structure) | ~65% |
| Frontend wired to real data | ~5% |
| Backend | 0% |
| AI pipeline (STT → analysis → RAG) | 0% |
| Auth / infra / deploy | 0% |

---

## Pipeline status

Mapped against the 8 stages defined in the workflow document:

| Stage | Status | Reality |
| --- | --- | --- |
| Recording | Not started | `src/components/LiveCapture.tsx:33` replays `MOCK_LIVE_SPEECH_STREAM` on a 3.5s `setTimeout`. No mic access. No upload UI either. |
| Speech-to-text | Not started | Nothing exists |
| Speaker identification | Not started | Speakers are hardcoded in mock data |
| AI analysis | Not started | `src/components/LiveCapture.tsx:44-84` hardcodes topic titles by matching string literals such as `"IndexDB Speed Tests"` |
| Meeting memory | **Done** | The `Meeting` schema at `src/mockData.ts:22-38` is well-shaped and is the one piece of genuinely reusable work |
| Store | Not started | `useState` only. A page refresh discards everything. |
| RAG / search | Not started | `src/components/Ask.tsx:46-58` is `.toLowerCase().includes()` behind a fake 600ms delay |
| AI answer | Not started | Template string: `` `I found details in the meeting "${title}"...` `` |

---

## Bugs in what is already built

1. **Ask cannot see newly saved meetings.** `src/components/Ask.tsx:12` imports `MOCK_MEETINGS` and searches that array directly rather than the `meetings` state held in `App.tsx`. Save a live capture, then ask about it — it will never be found.
2. **No empty state.** `src/components/Home.tsx:18` calls `meetings.slice(0, 3)` and renders `SHOWING 03 OF 00` above an empty grid. A first-run user sees a broken page.
3. **No routing.** `react-router` is not installed. Navigation is scroll position plus component state, so there are no shareable meeting links, the browser back button does nothing, and `/m/oryzo-integration` does not exist. For a product whose value is *"here is what we decided, look"*, unshareable answers is a product flaw rather than a technical nicety.
4. **Native `confirm()` / `alert()`** in `src/App.tsx:78-82` break out of the design system entirely.

---

## Design changes to make before writing any backend

### 1. The future feature was designed, not the MVP

The workflow document defines the MVP as record → **upload** → process, and explicitly defers live capture to a future phase. The frontend's centerpiece is real-time live capture. There is no upload flow, and more importantly **no processing state anywhere in the design**. Transcribing a 45-minute meeting takes minutes. A screen covering `uploaded → queued → transcribing → analyzing → ready → failed` is required and does not exist.

This is the largest gap.

### 2. The data model will break on contact with real data

Dates are stored as pre-uppercased display strings (`"AUG 22, 2026"`), which cannot be sorted or filtered. Transcript timestamps are strings (`"14:03"`).

Change to ISO dates and numeric `startMs` / `endMs`, and add `status`, `audioUrl`, and `ownerId` to `Meeting`.

### 3. No audio player — the missing killer feature

A meeting-memory product should let a user click a quote and hear it. Once timestamps are numeric, a citation becomes "jump to 12:03 and play." That is the point at which the product stops being a summarizer.

### 4. Speaker labeling is unaddressed

Diarization returns `Speaker 1` / `Speaker 2`. Someone has to name them once and have those names persist across meetings. There is no UI for this anywhere. It is mandatory and absent.

### 5. Settings is fiction

The Settings section advertises AES-GCM-256, IndexedDB enclaves, 24-hour key rotation, and zero cloud telemetry. None of it exists, and most of it contradicts the planned cloud STT and LLM stack.

Replace with real settings: account, model choice, speaker name mapping, language, retention, and export.

### 6. Uppercase everything fights user content

The all-caps rule in `design.md` works well for chrome. Meeting titles, however, are user-generated, and the mocks cheat by uppercasing at the data layer (`title: "ORYZO KICK-OFF: ..."`). Real titles will arrive as "q3 planning sync."

Keep uppercase for labels and eyebrows. Move user content to sentence case, applied through CSS rather than baked into the data.

### 7. Finish the token migration

`Archive.tsx` uses semantic tokens (`text-ink`, `border-wheat-border`). Every other component hardcodes `#ffedd7` / `#40372e` inline. Pick one approach.

### 8. Missing screen: "what do I owe?"

Action items currently exist only inside individual meetings. A cross-meeting view of a user's own open items is the feature people would open daily. The design has no place for it.

---

## Stack: simplify before starting

The workflow document lists both PostgreSQL and MongoDB, plus three vector database options. Cut it down to:

- **PostgreSQL + pgvector** — one service covering both relational storage and vector search
- **Deepgram or AssemblyAI** for speech-to-text — critically, both return transcription *and* diarization in a single API call. Whisper alone provides no speaker separation, which would mean running pyannote separately.
- **Claude with structured tool-use output** so extraction conforms to the existing `Meeting` interface by construction
- **Clerk** for auth, added last

---

## Recommended build order

1. Fix the Ask bug, add an `src/api/` seam so components stop importing mocks directly, and add routing — roughly one week, pure frontend
2. Express + PostgreSQL, `POST /meetings` with file upload feeding a job queue
3. Deepgram integration producing transcript plus speakers
4. Claude extraction returning JSON matching `Meeting`
5. pgvector: chunk by utterance groups, embed with speaker and timestamp metadata
6. RAG endpoint returning answers with `meetingId` and `startMs` citations
7. Auth, then live capture
