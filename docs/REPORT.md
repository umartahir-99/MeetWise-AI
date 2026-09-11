# MeetWise AI — Project Report

**Date:** 2026-09-11 · **Branch:** `backend/supabase-migration` · **Status:** Product is real and running on free tiers.

---

## 1. What it is

A memory system for meetings. Upload a recording; get a transcript with speakers separated, a summary, topics, decisions, action items, and quotes — each tied to the second it was said. Ask the archive a question and get an answer with playable citations. Everything persists.

## 2. The three ideas that make it different

| Idea | How it works |
|---|---|
| **Name a voice once, it's named everywhere** | A name is stored against the *voice*, not the recording. Renaming touches one row; every meeting re-resolves on render. |
| **Commitments outlive the meeting** | "Owed" gathers every action item across the archive, open ones oldest-first. |
| **Every answer points at a playable moment** | A citation is a line, a speaker, and a millisecond. Click it and the audio plays from there. |

## 3. Architecture

```
Browser (React 19 + Vite + Tailwind)
   │  supabase-js
Supabase — Auth · Postgres (12 tables, RLS) · Storage · Realtime · 4 Edge Functions
   │  HTTPS
Gladia (speech-to-text + diarization) · Gemini 3.5 Flash (analysis)
```

No server to maintain. Nothing runs while idle.

## 4. The pipeline

```
uploaded → queued → transcribing → analyzing → ready
```

1. Browser inserts the row, uploads the file straight to Storage, calls `start-processing`.
2. `start-processing` signs a URL, POSTs it to Gladia with a callback, returns in <1s.
3. Gladia calls `transcription-webhook` when done. It verifies a shared secret, fetches the result itself, writes speakers and transcript lines, hands off to analysis.
4. `analyze-meeting` sends the transcript to Gemini with a **response schema**, validates every slot and timestamp, writes the results, sets `ready`.
5. The browser sees each step over **Realtime** — the progress bar moves because the database moved. There is no timer.

**Measured:** 21–36 seconds end to end, regardless of recording length. Gladia transcribes at ~80× real time.

## 5. Security model

- Every table has `owner_id` and Row Level Security with one `for all` policy: `owner_id = auth.uid()`, with `with check` so nobody can insert a row owned by someone else.
- Storage bucket is private; paths are `{user_id}/{meeting_id}/…` so the policy is a prefix check. Playback uses signed URLs that expire.
- Edge functions run service-role and **check ownership themselves**.
- The public webhook has three defences: shared secret, job-id must be one we issued, meeting id taken from our job row never the request body.
- Verified by `isolation-test.mjs`: user B sees zero of user A's rows, cannot forge, cannot delete.

## 6. Milestones — what was built, in order

| Step | Milestone | Delivered |
|---|---|---|
| 1–2 | M0 Ground | Schema, RLS, storage, triggers as migrations. Security proof. |
| 3 | M1 Auth | Sign in/up, settings and account name persist. |
| 4 | M2 Archive | Meetings read/written from the database. Zero component changes — the mapper produces the shape the app already used. |
| 5 | M3 Uploads | Real files to Storage, Realtime status, fake pipeline deleted. |
| 6 | M4 AI | Gladia + Gemini. Real transcript, real summary, correct action-item owners, playable quotes. |
| — | Review | Measured every stage; halved analysis time; strict free tier; stuck-job recovery. |
| 7 | M5 Housekeeping | Nightly retention sweep (rows *and* files), signed-URL refresh, discard-audio. |
| 8 | M6 Voice identity | Database half (pgvector, matching, visible + undoable). Model half needs a decision. |

Every milestone has a verification script that proves it. Full suite: 100+ checks, green.

## 7. Free-tier reality

| Service | Limit | What it means |
|---|---|---|
| Gemini 3.5 Flash | **20 requests/day** | 20 meetings a day. The tightest limit. Pro removed from the app entirely. |
| Gladia | 10 hours/month | ~120 five-minute meetings. |
| Supabase storage | **50 MiB per file** | An hour fits only as compressed audio (M4A/MP3 ≤ 96 kbps). Not WAV, not video. |
| Supabase egress | 5 GB/month | ~100 max-size uploads. |
| Edge functions | 150s wall-clock | Analysis peaks at ~20s. |

## 8. Decisions worth defending

- **Never write SQL in the dashboard.** Everything is a migration; the database is rebuildable from files.
- **The mapper protects the components.** ~3,000 lines of tested UI logic were not touched by the backend.
- **Analysis hand-off via `EdgeRuntime.waitUntil`, not a database webhook** — the plan's approach needed a secret inside a migration file.
- **Retention sweep is a function, not SQL** — deleting from `storage.objects` orphans the file and still bills for it.
- **The scheduler's secret is generated inside the database into Vault.** It never exists in any file.
- **Gemini thinking level `low`** — analysis 8–12s → 4.4s, decisions and owners identical; quotes 3→2. Measured, recorded on every job, one constant to flip.
- **Product model ids mapped to vendor ids in one table** — Google renamed and withdrew models mid-build; no saved setting broke.
- **Every job records its own timing** — the next performance question is a query, not a benchmark.

## 9. What's honest to say is not done

- **Cross-meeting voice matching needs a model.** The zero-cost route is a 90 MB in-browser model; its feasibility test couldn't run on this connection. Naming works within one recording today.
- **Owed's "MINE" filter is empty for real uploads** — nothing links a voice to the account yet. Tasks show under EVERYONE. Fix is written down; deferred until a real meeting makes the case.
- **Live Capture is a labelled demo.** The real bot is a separate project.
- **Only Gladia transcribes.** Deepgram and Whisper appear in settings but aren't wired.
- **The 2:30 first-upload time is unexplained** by measurement. The next upload will record its own breakdown.

## 10. The final test

Sign up → upload a real recording → watch real progress → read a summary about *that* meeting → name the voices → ask a question → click a citation and hear the moment → tick an action item → export → close the browser, come back, everything is there.

**All ten confirmed on the owner's own recording.**
