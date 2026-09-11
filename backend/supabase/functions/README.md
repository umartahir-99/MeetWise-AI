# Edge functions

Three of them, all TypeScript on Deno, all deployed. `_shared/common.ts` holds what they have
in common: the clients, the readable-failure writer, and the hand-off to analysis.

These are Deno files, not Node. An editor without the Deno extension will flag `Deno` and the
`npm:` imports as unknown; `deno.json` here is what the extension reads.

Deploy with `supabase functions deploy <name> --use-api` from `backend/` — the `--use-api` flag
bundles server-side, so Docker is not needed.

```
functions/
├── start-processing/        called by the browser, hands the audio to Gladia
├── transcription-webhook/   called by Gladia when the transcript is ready
├── analyze-meeting/         handed off by the webhook, asks Gemini for the analysis
└── retention-sweep/         called nightly by pg_cron, or by a user from Settings
```

## Why the sweep is a function and not SQL

Deleting a row from `storage.objects` does not delete the object behind it. The file stays in
the bucket, orphaned and billed, with no row left to find it by. Only the Storage API removes a
file, so the nightly sweep runs here. `pg_cron` calls it through `pg_net` with a secret that the
migration generated inside the database into Vault — the scheduler reads it from Vault to send
and the function reads it from Vault to check, and it never exists in any file.

## Why three, and not one

**Nothing waits.** Transcribing a 45-minute recording takes minutes, and neither a browser request
nor an edge function may live that long. So the work is handed off and the answer arrives later
through a different door.

`start-processing` signs a URL for the uploaded audio, posts it to Gladia with a callback pointing
back here, and returns in well under a second. The browser is already subscribed to the meeting row
over Realtime, so from that moment the progress bar moves because the *database* moved — there is
no timer anywhere.

`transcription-webhook` and `analyze-meeting` are separate for a specific reason: the webhook must
answer Gladia fast. If it also waited for Gemini to read a long transcript, Gladia would time out
and retry, and the same meeting would be analysed three times.

## The webhook is a public door

`transcription-webhook` runs with no login token, because Gladia has none to offer. Three defences,
all required:

1. Verify the shared secret riding in the callback URL's query string.
2. Confirm the transcription id matches a row in `processing_jobs`. An id we never issued is not
   ours, and is dropped without comment.
3. Never trust a meeting id from the request body — always look it up from the job row.

## Two details that break things silently

**Gladia returns seconds as floats.** Multiply by 1000 when writing `start_ms` and `end_ms`. Miss
it and every citation and audio jump in the app is off by a factor of a thousand.

**Ask Gemini for a `responseSchema`, not for JSON in the prompt.** The schema constrains the output;
the prompt merely requests it. And validate what comes back: every `speakerSlot` must exist in
`meeting_speakers`, and every quote's `startMs` must land inside a real transcript line. A quote
with an invented timestamp is a citation that fails silently when clicked.

## One thing the TRD describes differently

TRD 7.3 has a *database webhook* fire `analyze-meeting`. That needs `pg_net` and a secret the
trigger can read — which means either a secret inside a migration file, or a Vault entry set by
hand. Neither is reproducible from files alone. So `transcription-webhook` hands the meeting to
`analyze-meeting` itself, through `EdgeRuntime.waitUntil`, and still answers Gladia in
milliseconds. `analyze-meeting` accepts only the service-role key, so nothing reachable from a
browser can trigger it.

Full specification: [../../../docs/TRD.md](../../../docs/TRD.md), section 7.
