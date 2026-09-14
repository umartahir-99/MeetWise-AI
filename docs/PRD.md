# MeetWise AI — Product Requirements Document

**Version:** 1.0
**Date:** 2026-09-08
**Status:** Written before the backend existed. For what is built and verified today, see [STATUS.md](./STATUS.md).

---

## Table of contents

1. [What MeetWise AI is](#1-what-meetwise-ai-is)
2. [Who it is for](#2-who-it-is-for)
3. [The three ideas that make it different](#3-the-three-ideas-that-make-it-different)
4. [The five places in the app](#4-the-five-places-in-the-app)
5. [Feature by feature](#5-feature-by-feature)
6. [The honesty ledger — what is fake today](#6-the-honesty-ledger--what-is-fake-today)
7. [Out of scope for version 1](#7-out-of-scope-for-version-1)
8. [What "done" means](#8-what-done-means)

---

## 1. What MeetWise AI is

MeetWise AI is a memory system for meetings.

Most meeting tools tell you **what happened**. They give you a transcript and a summary, and
then you never open them again. MeetWise is built to answer three harder questions:

- **What happened?** — the summary, topics and decisions.
- **Why did it happen?** — the discussion that led to a decision, not just the decision.
- **Who said it?** — every fact tied to the person who said it, at the second they said it.

You upload a recording. The system transcribes it, separates the voices, and pulls out the
topics, the decisions, the action items and the key quotes. Then it keeps all of that, forever,
in one archive you can search and ask questions of.

You can export any meeting as a Markdown file or a JSON file.

---

## 2. Who it is for

People who sit in a lot of online meetings, across a lot of different platforms — Zoom one day,
Google Meet the next, Teams the day after.

Those people have a specific problem. Their meeting notes are scattered across four tools, none
of which talk to each other, and none of which remember anything from last month. MeetWise is
one archive that does not care which platform the recording came from.

---

## 3. The three ideas that make it different

These are the parts worth protecting. Everything else is table stakes.

### 3.1 Name a voice once, and it is named everywhere

When a computer separates voices in a recording, it can tell them apart but it cannot name them.
It says "Speaker 1", "Speaker 2". So MeetWise does something specific: **the name is stored
against the voice, not against the recording.**

You type "Sarah Chen" once, in one meeting. Every other meeting that same voice appears in now
says "Sarah Chen" too — including meetings you recorded last month. Nothing is rewritten. The
name is looked up fresh every time the screen draws.

If you type a name that already exists, the two voices merge into that one person instead of
creating a duplicate.

> **Important limitation:** see [risk 1 in the TRD](./TRD.md#101-cross-meeting-voice-identity-is-not-free).
> This feature works today because the sample data has fake voice fingerprints built in. Real
> transcription services do **not** return a fingerprint that is stable across recordings, so
> when the backend is built this will first work *inside* one meeting only. Matching a voice
> across meetings automatically needs an extra step, planned as milestone M6.

### 3.2 Commitments outlive the meeting they were made in

Inside one meeting, an action item is a record of something somebody said.

Across the whole archive, the same action items are something completely different: **the list
of things you promised and have not done yet.** That list is the reason to open this app on a
Tuesday morning.

So the app has a section called "Owed" that gathers every action item from every meeting,
filters it down to you, and sorts the open ones **oldest first** — because a promise made three
weeks ago matters more than one made yesterday, and burying it under newer work is exactly how
it gets forgotten. Completed items sort the other way, newest first, because those are a record
and not a queue.

### 3.3 Every answer points at a moment you can play

When you ask the archive a question, the answer comes with citations. A citation is not just
"this came from the Oryzo meeting". It is a specific line, said by a specific person, at a
specific millisecond.

Click it and the app opens that meeting, jumps the audio to that exact second, and starts
playing. That is what makes an answer checkable instead of something you have to trust.

---

## 4. The five places in the app

The app is one long scrolling page with five sections, plus four full-screen views that replace
the page when you need them.

| Section | What it is for |
|---|---|
| **Home** | The front door. Your three most recent meetings, and a banner if you owe anything. |
| **Owed** | Every action item you have not finished, from every meeting. |
| **Meetings** | The full archive, with search and filters. |
| **Ask** | Ask a question in plain English, get an answer with citations. |
| **Settings** | Your name, which AI models to use, speaker names, retention, export. |

The four full-screen views are **Upload**, **Processing**, **Meeting Detail**, and
**Live Capture**.

"Owed" sits second on purpose — above the archive, above search. The daily reason to open this
product is the list of what you owe, so it gets the position right under the front door.

---

## 5. Feature by feature

Each feature below is described the same way: what you see, what you can do, and **what is
real today versus simulated**.

---

### 5.1 Upload a recording

**What you see.** A large drop zone. You can drag a file onto it or click "OR CHOOSE A FILE".

**What you can do.**

- Drop or pick an audio or video file. Accepted: MP3, M4A, WAV, AAC, OGG, MP4, MOV, WEBM.
- The app immediately shows the file name, its size, and its real length ("READING DURATION…"
  while it works it out, then something like `45:12`, or "DURATION UNAVAILABLE" if the browser
  cannot decode that container).
- Edit the title. It is pre-filled from the file name, so `q3_planning-sync.m4a` becomes
  "q3 planning sync".
- Clear the file with the X button and start again.
- Press "START PROCESSING".
- Or, with no recording to bring, "START LIVE CAPTURE" and record from the browser (§5.10).

**Rules that are enforced.**

- The file must have an accepted extension, or you get a clear message naming what is supported.
- The file cannot be empty.
- The file cannot be larger than 2 GB. If it is, the message tells you the actual size and
  the limit.
- The submit button stays disabled until there is a valid file.
- For long meetings, a hint suggests exporting audio-only (M4A or MP3) instead of video —
  smaller file, faster upload, no difference in what gets transcribed. This is a nudge, not a
  requirement: video files upload and process the same way, just larger and slower.

**Real today?** The file picking, the validation, and reading the real duration out of the file
are all real. **The upload is not.** Nothing leaves your browser. The app just makes a temporary
in-memory handle on the file and starts a fake timer.

**What the backend changes.** The file gets uploaded to real storage. The processing that
follows becomes real work on real audio.

---

### 5.2 Watch a recording being processed

**What you see.** A full-screen status page with a five-step tracker:

```
UPLOADED  →  QUEUED  →  TRANSCRIBING  →  ANALYZING  →  READY
```

Plus a percentage counter, a progress bar, a countdown ("ABOUT 12s REMAINING"), the file's
details, and which AI models this job is running under.

**Why this is a whole screen and not a spinner.** Transcribing a 45-minute recording genuinely
takes minutes. A spinner for four minutes is a broken-looking app. So the wait is designed:
every stage says what the system is doing in plain words, and each pending stage also shows what
it really costs in production — for example, transcribing says *"About 1 to 3 minutes for a 45
minute recording."* That note exists so the fast prototype timing never reads as a promise.

**What you can do.**

- Leave the page. It says so directly: "YOU CAN LEAVE THIS PAGE — PROCESSING CONTINUES".
- If it finishes: "OPEN THE MEMORY".
- If it fails: "RETRY PROCESSING" or "DISCARD UPLOAD".

**When something fails.** The screen names the stage it died in and gives a human reason. It
also reassures you that your file was not deleted and that retrying reuses the same upload.
A retry restarts from the queue, not from the upload.

**Real today?** No. The whole thing is a timer. Every stage has a hardcoded length and the five
stages together take about 18 seconds no matter how long your recording is. The failure path is
triggered by a trick: **any file with the word "fail" in its name** is scripted to die during
transcription. That trick exists only so the failure screen is reachable at all without a
server.

**What the backend changes.** The stages advance because the database says so. The status
arrives over a live connection, so the bar moves when real work finishes.

---

### 5.3 Read a meeting

**What you see**, top to bottom:

1. **An audio player** with a scrub bar and small tick marks showing where the key quotes are.
2. **The header** — date, how long ago it was, how long it ran, who owns it, tags, title, and
   the list of people who spoke.
3. **The speaker panel** — for naming voices (section 5.4).
4. **AI SUMMARY INDEX** — one editorial paragraph explaining what the meeting was about.
5. **TOPICS DISCUSSED** — each topic with a title and a few sentences of detail.
6. **DECISIONS MADE** — a plain list of what was actually decided.
7. **ACTION ITEMS MAPPED** — a table of task and owner.
8. **KEY QUOTES** — the memorable lines, each with a **"HEAR IT — 12:03"** button.
9. **VIEW FULL TRANSCRIPT** — expands the complete line-by-line transcript.

**What you can do.**

- Play, pause and scrub the recording.
- Click "HEAR IT" on any quote to jump straight to that moment.
- Click any transcript line to jump the audio there.
- While audio plays, the current line highlights itself and scrolls into view automatically.
- Arrive from a citation elsewhere in the app, and the page opens the transcript and starts
  playing at the right second by itself.

**Real today?** The layout, the seeking, the highlighting and the deep links are all real. **The
audio usually is not.** If the meeting has no real recording behind it — which is true for every
sample meeting — the app falls back to the browser reading the transcript out loud with a
computer voice. It says so honestly under the player: *"SYNTHESISED NARRATION — NO RECORDING ON
FILE."* There are three modes and the player always tells you which one you are in:

| Mode | The note under the player |
|---|---|
| A real uploaded file exists | PLAYING THE UPLOADED RECORDING |
| No file, but there is a transcript | SYNTHESISED NARRATION — NO RECORDING ON FILE |
| Neither | NO AUDIO ON FILE — THE TIMELINE STILL SEEKS |

**What the backend changes.** Real recordings are stored and played back properly. The narration
fallback stays for meetings whose audio was deliberately discarded.

---

### 5.4 Put names to voices

**What you see.** A panel called "VOICES IN THIS RECORDING". At the top it says how many are
still unnamed: *"2 STILL UNNAMED — NAME ONCE, APPLIES EVERYWHERE"*, or *"ALL VOICES
IDENTIFIED"*.

Each voice gets a card showing:

- Its name, or a placeholder like "SPEAKER 2" in orange if nobody has named it.
- How many lines it speaks in this meeting.
- "HEARD IN 4 MEETINGS", if this voice appears elsewhere in your archive.
- For unnamed voices, **the first thing that voice says** — so you have something to recognise
  them by.

**What you can do.**

- Type a name into "Who is this?" and save. An autocomplete suggests people you already know.
- Rename a voice you already named.
- Forget a voice from Settings, which unlinks it and turns it back into "SPEAKER n".

**The rule.** The panel states it at the bottom: *"Names are stored against the voice, not this
recording — naming one here renames it in every meeting that voice appears in."*

**Real today?** The naming, the merging and the instant retroactive rename are all real and work
properly. What is fake is the underlying voice fingerprint — in the sample data it is just a
hardcoded string like `vp-sarah-chen`. There is no actual voice matching happening.

---

### 5.5 See what you owe

**What you see.** A section headed "WHAT YOU OWE", with a line like *"You have 4 open items, the
oldest from three weeks ago."* Or, when you are clear, a message saying so.

Then a list. Each row has a tick circle, the task, the meeting it came from, how long ago that
was, and a link back to the source meeting.

**What you can do.**

- Switch between **MINE** and **EVERYONE**.
- Filter by **OPEN**, **DONE** or **ALL**.
- Tick an item off, or put it back.
- Jump to the meeting where the promise was made.

**Real today?** Yes, all of it — the gathering, the filtering, the sorting and the ticking. The
one problem is that ticking an item is lost the moment you refresh the page.

**What the backend changes.** A ticked item stays ticked.

---

### 5.6 Ask the archive a question

**What you see.** A question box, some suggested questions, and — after you ask — an answer with
its sources listed underneath.

**What you can do.** Type a question in plain English. For example:

- "What did we decide about the cork borders?"
- "Who owns the backfill report?"
- "What did Sarah say about buffers?"

**How it actually works.** This is keyword matching, not an AI model, and the interface says so:
it is labelled **KEYWORD RETRIEVAL** and **MATCHED FROM YOUR ARCHIVE**, never "semantic" and
never "AI response engine". Under every answer, a rail lists the exact words the match was made
on, so you can see why you got what you got.

The details that matter:

- Your question is broken into words. Common words like "the" and "who" are dropped, and plurals
  are folded together. Meetings are scored on where the remaining words appear — a hit in the
  title counts for more than a hit deep in the transcript — multiplied by how much of your
  question that meeting actually covers.
- **Only finished meetings are searchable.** A recording still transcribing has no transcript
  yet, so it is matched on its title alone and reported as *"not yet"* rather than silently
  skipped.
- **Naming a person filters the answer.** If you name someone the archive knows, the answer is
  restricted to meetings that person actually spoke in, and the citations point at *their*
  lines. But it never throws the rest of your question away: if they are in no meeting about
  that subject, it says so and still answers the subject. If they were there but said nothing
  about it, it says that too — instead of showing you a citation that reads like something they
  said.
- **A name is treated as a person, never as a topic.** Somebody saying "Alex, can you handle
  this?" does not make that meeting be *about* Alex.
- **Citations are checked when they are drawn.** If a cited meeting was deleted, that row
  disappears rather than becoming a dead link. If you rename a voice, an answer already on your
  screen updates to the new name.

**Five possible outcomes**, all designed on purpose — not one happy path and four error states:

| Outcome | When |
|---|---|
| An answer | Something matched |
| Empty archive | There is nothing to search yet |
| No usable words | Your question was one letter, or all common words |
| No match | Real words, nothing found — shows you what tags do exist |
| Still processing | The only thing that looks relevant is not finished yet |

**Suggested questions are live.** They come from your archive's own topics, and one slot is
always reserved for a question that names a person — otherwise asking by name would never be
discoverable.

**Real today?** Yes. This is genuinely working logic over whatever is in your archive.

---

### 5.7 Browse and filter the archive

**What you see.** A count ("12 of 20 shown"), a search box, filter chips, and a vertical timeline
of meeting cards alternating left and right.

**What you can do.**

- Search by words in the title, gist or summary.
- Filter by a tag.
- Filter by a person who spoke.
- Clear all filters with one link.
- Click any card to open it.

Each card shows the date, the tags (or a status pill if it is still processing), the title, the
one-line gist, and who was in it. Meetings that are not finished yet show a "pending" placeholder
instead of a fake summary.

**Real today?** Yes, entirely.

---

### 5.8 Settings

Six groups.

**Account.** Change your display name — which is also the name your own voice resolves to. Shows
how many meetings and voices you have. "DELETE ALL" wipes everything and restores the samples.

**Models.** Two dropdowns, marked "APPLIES TO THE NEXT UPLOAD":

- *Speech to text:* Gladia Solaria-3 (best accuracy, built-in diarization, free tier covers real
  use), Deepgram Nova-3 (fastest and cheapest, weaker on crosstalk), Whisper Large-v3 (best on
  accents and bad audio, slowest).
- *Analysis:* Gemini 3 Flash (balanced, generous free tier — the default), Gemini 3.1 Flash-Lite
  (fastest and cheapest, for short stand-ups), Gemini 2.5 Pro (deepest reading, paid — Google
  removed Pro from the free tier in April 2026).

**Language.** Auto-detect, or one of ten languages including English (US/UK), Spanish, French,
German, Portuguese, Hindi, Urdu and Japanese.

**Speaker names.** The full voice directory across your whole archive. Unnamed voices are listed
first, because those are the ones asking to be dealt with. Each shows how many meetings and how
many lines. Name them, or forget them.

**Retention.** Keep meetings for 30 days, 90 days, 6 months, 1 year, or forever. If any meetings
are already past the window, a "DELETE 3" button appears. There is also a toggle:
**"DISCARD AUDIO AFTER PROCESSING"** — keep the transcript, throw the recording away.

**Export.** Two buttons, MARKDOWN and JSON, that download your entire archive.

**Real today?** The naming, retention purge, export and account rename are all real. **The model
and language choices are not** — they are saved and displayed, but nothing sends them anywhere.
The screen admits this in its own footer.

---

### 5.9 Export your archive

**What you see.** Two buttons in Settings.

**What you get.**

- **JSON** — a structured file with every meeting: title, date, duration, owner, participants,
  tags, gist, summary, topics, decisions, action items, quotes and the full transcript.
- **Markdown** — the same thing as a readable document, with headings per meeting, block quotes
  for the key lines, and timestamps down the transcript.

The important detail: the export resolves everything the app resolves on screen. Speaker slots
become real names, and millisecond offsets become clock times like `12:03`. The file is readable
on its own — it is not a dump of internal IDs.

**Real today?** Yes. This is fully working, and it is the only feature that gets real data out of
the app today.

---

### 5.10 Live Capture

**What you see.** A two-panel screen. On the left, a pulsing red dot, an elapsed timer and a
level meter that moves with what the microphone hears — or, if the microphone was refused, the
reason and a "TRY AGAIN". On the right, "CAPTURE": a title field, the two sources (MICROPHONE,
MEETING AUDIO) with their state, and the recording's bitrate, size so far and how much room is
left under the storage cap. A line at the bottom says the transcript and summary are produced
after you stop, and that nothing is analysed live.

**What you can do.**
- Speak. The meter is the proof the recording is real.
- "ADD TAB OR SCREEN AUDIO" — Chrome's share picker opens; pick the tab or screen the call is in
  and tick "Share tab audio" / "Share system audio". Its sound is mixed into the same recording,
  so the other side of a call is captured too. Sharing without the audio box ticked reports
  "NO AUDIO IN THAT SOURCE"; stopping the share from the browser reports "STOPPED" and the
  microphone carries on.
- Give it a title, or accept "Live capture · SEP 15, 2026 14:30".
- "END & SAVE MEMORY" (enabled after two seconds) — the recording becomes a file and goes
  through exactly the upload path: a row is created, the file goes to storage, and the
  Processing screen opens on the real stages. "ABANDON" releases the microphone and creates
  nothing.

**Rules that are enforced.**
- Opus in WebM at 48 kbps (MP4 where WebM is unavailable), so an hour weighs ~21 MB. At the
  50 MiB storage cap the recorder stops itself and saves what it has.
- A capture whose upload fails is kept in the browser's memory so "RETRY PROCESSING" can send it
  again without returning to the upload screen. A refresh before it lands loses it.
- Sharing tab or screen audio needs Chrome or Edge; elsewhere the button says so and only the
  microphone is recorded.

**Real today?** Yes — the recording is. It is transcribed, separated by speaker and summarised
by the same pipeline as an upload. What is *not* real, and is not shown: a live transcript or
live notes. That would need a streaming transcription service and somewhere to relay it, and the
bot that joins a call on its own is still a separate project.

---

## 6. The honesty ledger — what is fake today

*A snapshot from before the backend was built, kept as the record of what had to change. Nearly every "Fake" below is now real; [STATUS.md](./STATUS.md) has the current list of what is not.*

This table exists so nothing gets shipped as real by accident.

| Feature | State | The specific fake |
|---|---|---|
| File validation | **Real** | — |
| Reading file duration | **Real** | — |
| Upload to a server | **Fake** | Nothing leaves the browser |
| The 5-stage pipeline | **Fake** | A timer. ~18 seconds total, whatever the file |
| Meeting summary / topics / decisions | **Fake** | Every upload gets the *same* canned fixture |
| Failure handling | **Fake trigger** | Any file with "fail" in its name dies on purpose |
| Audio playback | **Partly fake** | Falls back to computer text-to-speech reading the transcript |
| Voice fingerprints | **Fake** | Hardcoded strings, no real voice matching |
| Speaker naming logic | **Real** | Lost on refresh |
| Commitments rollup | **Real** | Ticking is lost on refresh |
| Ask / retrieval | **Real** | Keyword matching, honestly labelled |
| Archive search & filters | **Real** | — |
| Export | **Real** | — |
| Retention purge | **Real** | Deletes from memory only |
| Model & language settings | **Inert** | Saved and shown, sent nowhere |
| Live Capture | **Fake** (now real: records mic + tab audio, then the upload pipeline) | A fixed 9-line script, no microphone |
| **Anything surviving a refresh** | **None of it** | All state is in memory |

> **The single most important line in this document:** there is no storage of any kind in the app
> right now — no database, no server, not even browser storage. Close the tab and every upload,
> every name, every ticked box is gone.

---

## 7. Out of scope for version 1

These are deliberate exclusions, not oversights.

- **A real live meeting bot.** The future goal of a bot that joins a call, listens, and produces
  the document at the end. Large enough to be its own project.
- **Teams and sharing.** Version 1 is a personal archive. One person, their own meetings, nobody
  else's. The database is designed so a workspace can be added later without a rewrite.
- **Semantic / vector search.** Ask stays keyword-based until there is a model behind it. The
  wording in the interface will not be upgraded to "semantic" before the engine is.
- **Editing AI output.** You cannot currently correct a wrong summary or reassign an action item
  to a different person.
- **Mobile app.** Web only.
- **Calendar or meeting-platform integrations.**

---

## 8. What "done" means

Version 1 is finished when a real person can do this, end to end, without anything being faked:

1. Sign up with an email and password.
2. Upload a real recording of a real meeting.
3. Watch the progress advance because real work is finishing — not because a timer ran.
4. Open the meeting and read a summary **that is actually about that recording**.
5. Put a name to each voice.
6. Ask the archive a question and get an answer with citations.
7. Click a citation and hear the real audio at the right second.
8. Tick off an action item.
9. Export the archive.
10. **Close the browser, come back tomorrow, and find all of it still there.**

Step 10 is the one that does not work today, and it is the reason for the backend.

---

**Next:** [TRD.md](./TRD.md) for the technical design ·
[SUPABASE_BACKEND_PLAN.md](./SUPABASE_BACKEND_PLAN.md) for the build order.
