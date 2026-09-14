# MeetWise AI — Status

**As of:** 2026-09-15 · **Branch:** `main` · **State:** the product is real and runs entirely on free tiers.

Read this first when picking the work back up. The reasoning behind everything
here is in [DECISIONS.md](./DECISIONS.md).

---

## The final test

Sign up → upload a real recording → watch real progress → read a summary about
*that* meeting → name the voices → ask a question → click a citation and hear
the moment → tick an action item → export → close the browser, come back,
everything is there.

**All ten confirmed on the owner's own recording, 2026-09-11.**

---

## Milestones

| Step | Milestone | State |
|---|---|---|
| 1–2 | M0 — schema, RLS, storage, triggers; security proof | Done |
| 3 | M1 — sign in; settings and account persist | Done |
| 4 | M2 — the archive lives in the database | Done |
| 5 | M3 — real uploads; Realtime status; fake pipeline deleted | Done |
| 6 | M4 — Gladia + Gemini; real transcripts and summaries | Done |
| — | Review — measured every stage; halved analysis time; strict free tier; stuck-job recovery | Done |
| 7 | M5 — nightly retention sweep (rows *and* files); signed-URL refresh; discard-audio | Done |
| 8 | M6 — cross-meeting voice identity | **Database half done; model half needs a decision** |
| — | Live Capture — record in the browser (mic + tab/screen audio), then the upload pipeline | Done |

Every milestone has a script that proves it. The full suite is green.

---

## Measured performance

Five timed runs through the deployed pipeline:

| Audio | start | transcribing | analyzing | total |
|---|---|---|---|---|
| 1:18 | 5.7–7.8 s | 4.6–13.2 s | 8–12 s → **4.4 s** at thinking `low` | 21–33 s |
| 9:46 | 7.2–7.6 s | 6.6–7.6 s | 15–20 s | 29–36 s |

**The pipeline takes 21–36 seconds regardless of recording length.** Gladia
transcribes at ~80× real time; its wall time is queue and overhead.

---

## Free-tier limits, verified

| Service | Limit | What it means |
|---|---|---|
| Gemini 3.5 Flash | **20 requests/day** (this key) | 20 meetings a day. The tightest limit. Pro is not offered. |
| Gladia | 10 hours/month, refreshing | ~120 five-minute meetings |
| Supabase storage | **50 MiB per file** | An hour fits only as compressed audio ≤ ~96 kbps — not WAV, not video |
| Supabase egress | 5 GB/month | ~100 max-size uploads; each is downloaded once by Gladia |
| Edge functions | 150 s wall-clock | Analysis peaks at ~20 s |

Every script that spends a Gemini request says so in its header.

---

## What is honest to say is not done

- **Cross-meeting voice matching needs a model.** The schema is in place and
  inert. The zero-cost route is a ~90 MB in-browser model whose feasibility
  test could not run on this connection. Naming works within one recording.
- **Owed's `MINE` filter is empty for real uploads.** Nothing links a voice to
  the account. Tasks show under `EVERYONE`. Fix written down; deferred.
- **Only Gladia transcribes.** Deepgram and Whisper appear in settings, unwired.
- **Live Capture records; it does not transcribe live.** The screen shows a
  level meter, elapsed time and file size, and the transcript arrives through
  the same pipeline as an upload once the user stops. A live transcript would
  need a streaming service and a place to relay it; the bot that joins a call
  is still a separate project. Tab audio needs Chrome or Edge.
- **A capture lost mid-upload survives only in memory.** The file is held in
  the browser so `RETRY` can send it again; a refresh before it lands loses it.
- **One first-upload time (2:30 for 5:44) is unexplained.** The next upload
  records its own breakdown on `processing_jobs`.

---

## Next, in order

1. **Decide M6's model half** — accept the one-time ~90 MB browser download
   and build `api/voiceprints.ts`, or keep per-meeting naming.
2. **Read `processing_jobs` after the next real upload** — it will say where
   the 2:30 went and whether thinking `low` keeps producing fewer quotes.
3. **The `MINE` fix**, when a real meeting with assigned tasks makes the case.

---

## Verification

From `backend/`. The first six cost nothing.

```bash
node scripts/verify-schema.mjs                     # row types match the live tables
node scripts/isolation-test.mjs                    # user B cannot see, forge or delete user A's rows
node scripts/verify-m1.mjs                         # settings and account name survive sign-out
node scripts/verify-m2.mjs <email> <password>      # the archive round-trips through the mapper
node scripts/verify-m3.mjs <email> <password>      # uploads land; Realtime carries status
node scripts/verify-m5.mjs                         # expired meetings and their files go (own account)
node scripts/verify-m6.mjs                         # a known voice matches across meetings (synthetic vectors)
node scripts/verify-reaper.mjs <email> <password>  # a stuck job becomes retryable (waits on cron)

node scripts/verify-m4.mjs <email> <password> <audio>       # one Gemini request, a few Gladia minutes
node scripts/bench-pipeline.mjs <email> <password> <audio>  # one Gemini request, a few Gladia minutes
```

`scripts/make-test-recording.ps1` generates a 78-second two-voice recording so
M4 is reproducible without anyone's real audio. `scripts/seed.mjs` puts the
sample archive into an account you own.

---

## Credentials

All set. None enters the repository or the browser bundle.

| Credential | Where |
|---|---|
| Supabase URL + publishable key | `frontend/.env.local` (git-ignored; `scripts/write-env.mjs` writes it) |
| `GLADIA_API_KEY`, `GEMINI_API_KEY` | `supabase secrets set` |
| `WEBHOOK_SECRET` | `supabase secrets set`, generated locally |
| `cron_secret` | Generated inside the database into Vault by migration |

Project: `wvvexjktntliwkrwhohk` (Mumbai). A second project with a similar name
exists on the account and is not the target.
