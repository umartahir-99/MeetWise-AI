# MeetWise AI

A memory system for meetings.

Most meeting tools tell you **what happened** — a transcript, a summary, and then you never open
them again. MeetWise is built for three harder questions:

- **What happened?** — the summary, topics and decisions.
- **Why did it happen?** — the discussion that led to a decision, not just the decision.
- **Who said it?** — every fact tied to the person who said it, at the second they said it.

Upload a recording. It is transcribed, the voices are separated, and the topics, decisions, action
items and key quotes are pulled out. All of it is kept in one archive you can search, ask questions
of, and export as Markdown or JSON.

---

## Layout

```
MeetWiseAi/
├── frontend/     React 19 + Vite + Tailwind 4. The app.
├── backend/      Supabase: schema, security, edge functions, and the checks that prove them.
└── docs/         What this is, how it is built, and where the build has got to.
```

Each half has its own README. Start with [backend/README.md](backend/README.md) if you are setting
the project up.

## Documentation

| Document | What it covers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What the product does, feature by feature — including an honest ledger of what is still simulated |
| [docs/TRD.md](docs/TRD.md) | The technical design: schema, RLS, storage, edge functions, and the risks |
| [docs/SUPABASE_BACKEND_PLAN.md](docs/SUPABASE_BACKEND_PLAN.md) | The order to build the backend in, milestone by milestone |
| [docs/PROGRESS.md](docs/PROGRESS.md) | **Where the build actually is.** Read this first when picking the work back up |

## Running it

```bash
# the app
cd frontend
npm install
npm run dev          # http://localhost:5173

# the checks
cd backend
node scripts/verify-schema.mjs     # do the row types still match the database?
node scripts/isolation-test.mjs    # can one user read another's meetings?
```

`frontend/.env.local` needs a Supabase URL and key before either will do anything;
[backend/README.md](backend/README.md) explains how to get them.

## Status

The frontend is complete and runs against real data for auth and settings. The archive itself is
still fixture data — moving it to the database is the next milestone. `docs/PROGRESS.md` is kept
current and says precisely what is proven and what is not.
