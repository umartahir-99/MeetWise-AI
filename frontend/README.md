# MeetWise AI — frontend

React 19, Vite, Tailwind 4, TypeScript. One long scrolling page with five sections, plus four
full-screen views that replace it.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

`.env.local` must exist first — `cd ../backend && node scripts/write-env.mjs` writes it from the
linked Supabase project.

## How it is arranged

```
src/
├── App.tsx           state for the whole app, and the session gate
├── components/       every screen and every piece of one
├── api/              the database, and the mappers that keep it out of the components
├── lib/supabase.ts   the one client
└── *.ts              pure logic: retrieval, commitments, speakers, processing, export
```

The `.ts` files at the top level are deliberately React-free and side-effect-free —
`retrieval.ts`, `commitments.ts`, `speakers.ts`, `processing.ts`, `exportArchive.ts`,
`datetime.ts`. That is roughly where the product's real thinking lives, and keeping it out of
components is what makes it testable and what let the backend migration happen without touching
the screens.

## Two ideas worth knowing before editing

**A speaker's name is not stored on a meeting.** Diarization separates voices but cannot name them,
so a meeting stores slots (`speaker-1`) and everything in it points at a slot. The name lives in
the voice directory, keyed by voice print. That indirection is the whole feature: naming a voice
once renames it in every meeting that voice has ever spoken in, without a single record being
rewritten. `speakers.ts` owns this; see `SpeakerResolver`.

**`api/mappers.ts` is the file that protects every component.** The `Meeting` interface was already
a good API contract — real ISO instants, offsets in milliseconds, a proper status enum — so the
backend's job is to produce that exact shape from database rows, not to design a new one. When a
screen looks wrong after a data change, the mapper is wrong. Fix it there, not in the screen.

`src/api/rows.ts` describes the database tables and is hand-written. Run
`../backend/scripts/verify-schema.mjs` after any migration: when it and the database disagree, the
migration is the truth.

## The design system

Tokens live at the top of `src/index.css`. Walnut ground, cream type, one ember accent that earns
its rarity by appearing seldom. Uppercase tracked labels, hairline dashed dividers, square inputs
with a single rule beneath them. New UI is built from the existing classes wherever they fit — a
screen that needs its own stylesheet usually needed a component instead.
