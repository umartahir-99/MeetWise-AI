# MeetWise AI — backend

Everything server-side. There is no server to maintain: Supabase provides the database, auth,
storage and realtime, and three small Deno functions do the work that cannot happen in a browser.

```
backend/
├── supabase/
│   ├── config.toml     project settings, as a file rather than as dashboard clicks
│   ├── migrations/     the SQL that builds the database — the only way it is ever changed
│   └── functions/      the three edge functions (arriving at milestone M4)
└── scripts/            the checks that prove each milestone actually landed
```

## The one rule

**Never write SQL into the dashboard.** Always write a migration. If the database is only ever
built from files, it can be thrown away and rebuilt from them — and when the files and the database
disagree, the files win. The same goes for `config.toml`: project settings are pulled, edited and
pushed, not clicked.

## Prerequisites

| Thing | Why | Cost |
|---|---|---|
| A Supabase account | Database, auth, storage, functions | Free tier is enough |
| A Gladia API key | Speech to text, diarization included | Free — 480 min/month |
| A Gemini API key | Analysis | Free — ~15 req/min, 1,500/day |

The Gladia and Gemini keys are only needed from M4. Neither ever enters the repository or the
browser bundle — they are set with `supabase secrets set` and live on the server side alone.

## Setup

Every command below runs **from this directory**: the Supabase CLI looks for `./supabase`, so
running it from the repository root will not find the project.

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>

supabase db push                    # apply the migrations
node scripts/write-env.mjs          # write frontend/.env.local from the linked project
supabase functions deploy --use-api  # all three; no Docker needed
supabase secrets set GLADIA_API_KEY=… GEMINI_API_KEY=… WEBHOOK_SECRET=$(openssl rand -hex 32)
```

`write-env.mjs` exists because the browser needs the project's publishable key and copying it by
hand puts the project ref in the key field about half the time. It prints a masked fingerprint and
confirms the key authenticates; it never prints the key.

## The checks

Run these after anything that touches the database. Each exits non-zero on failure, so they work in
CI as they stand.

```bash
node scripts/verify-schema.mjs                    # do the row types still describe the real tables?
node scripts/isolation-test.mjs                   # can one user reach another user's rows?
node scripts/verify-m1.mjs                        # do settings and account name survive a sign-out?
node scripts/verify-m2.mjs <email> <password>     # does the archive round-trip through the mapper?
node scripts/verify-m3.mjs <email> <password>     # does an upload land, and does Realtime carry status?
node scripts/verify-m4.mjs <email> <password> <audio>   # does a real recording become a real summary?
```

`verify-m4.mjs` needs a recording with speech in it. `scripts/make-test-recording.ps1`
generates a 78-second two-voice meeting with the Windows speech synthesiser, so the
test is reproducible without anyone's real audio.

To get something to look at:

```bash
node scripts/seed.mjs <email> <password>          # the sample archive, for an account you own
```

The seed reads `frontend/src/mockData.ts` rather than carrying its own copy of
the fixtures, so there is one definition of the sample archive and it cannot
drift. It inserts through the API as the signed-in user, which means row level
security applies to it exactly as it applies to the app — a seed that needs
superuser to work is a seed that proves nothing.

**`verify-schema.mjs`** asks the linked project for its own types and diffs the column names
against `frontend/src/api/rows.ts`. That file is hand-written on purpose — a generated file the app
cannot rebuild offline is a liability — and drift is the price of that choice. This is what pays
it. Needs only the CLI login.

**`verify-m2.mjs`** reads the seeded archive back through the app's own
`mappers.ts` and compares it against the fixtures it came from, field by field,
then runs `retrieval.ts`, `commitments.ts`, `speakers.ts` and `exportArchive.ts`
over the result. M2's real claim is that those five screens keep working with no
changes to their code; this is what checks it, rather than trusting it.

**`isolation-test.mjs`** is the important one. It creates two throwaway accounts and proves that
user B cannot read, forge or delete user A's rows, along with the new-user trigger and the table
inventory. It runs through the **publishable key, never service-role**: a service-role connection
bypasses row level security entirely and would pass this test while the application leaked.

## Security model in one paragraph

Every table carries an `owner_id`, and every table has row level security enabled with a single
`for all` policy comparing that column to `(select auth.uid())`. Carrying the owner on child tables
looks redundant — a transcript line already belongs to a meeting, and the meeting has an owner —
but it makes every policy one comparison instead of a join, and simpler rules are harder to get
wrong. `with check` appears on every policy alongside `using`, because `using` alone controls
reading and would happily let somebody insert a row owned by someone else.

Edge functions bypass all of this when they use the service-role key, which is exactly why they
must check ownership themselves before touching anything.

## Where the build is

See [../docs/PROGRESS.md](../docs/PROGRESS.md) — it is kept current and distinguishes what has been
proven from what has merely been written.
