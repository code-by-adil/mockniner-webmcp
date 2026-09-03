# Local storage, backups, and deployment

Built-in content is validated from `src/content`. Agent-supplied content passes
through the same schemas and renderers. Submitted attempts retain an immutable
package, response, and result snapshot. Clearing the site's storage removes all
learner data.

## Storage architecture

IELTS code lives in `src/modules/ielts`; the universal runtime lives in
`src/modules/assessment-engine`. React and WebMCP call the same application
commands in `src/application/ieltsCommands.ts` and
`src/application/assessmentCommands.ts`. The hooks handle React lifecycle and
load the repositories; commands own submission and evaluation rules.

SQLite holds one `practice_drafts` row per unfinished attempt. Native drafts pin
content keys to saved documents; universal drafts own a package snapshot from
the start, so an updated catalog cannot change an unfinished test. Answer and
timer updates share a serialized, coalescing save queue. Submission and draft
retirement happen in one transaction; full IELTS retains its remaining sections.
Only one tab can edit the local workspace, enforced by a Web Lock before the app
loads. WebMCP waits for pending saves before reporting a successful action.

Speaking saves each completed answer in `draft_recordings` before moving on. Raw
audio survives reload even if transcription fails. Resuming continues at the
next unanswered question; completed transcripts are reused. A recording still in
progress is not saved. Agents cannot read draft recordings or transcripts.

## Older saved data

Legacy `localStorage` drafts are imported once. Their raw values are retained in
`storage_imports`; the original key is removed only after a successful import.
Invalid records are kept and reported, not replaced with empty data. Migration 9
archives incompatible older universal tables under `legacy_*_v8` names, and
migration 10 accepts older audio-only Speaking records. Recovery applies to
records retained in the database or a backup.

## Backups

UI history and WebMCP use the same typed summary reader. A malformed record is
reported as unavailable without hiding valid attempts or exposing response text.
The **Local data** panel provides a simple backup flow:

1. Choose **Export backup** and keep the downloaded `.sqlite3` file somewhere safe.
2. In the practice library on another browser or device, open **Local data → Import backup** and choose that file.
3. Check the summary, then choose **Replace and import**. The app reloads and opens the restored practice.

Import replaces this browser's saved data; it does not merge two histories.
Export current work first if you want to keep it. Cancelling the confirmation
leaves current data unchanged. Backups include saved practice, drafts, completed
recordings, generated Listening audio, submissions, feedback, activity and
retained recovery data. A microphone recording still in progress and downloaded
voice-model caches are not included. Backup files are unencrypted and remain on
the device. Store them securely. Clearing site data removes local work even when
persistent storage has been granted.

Imports accept current-format SQLite backups and version 12 backups made before
objective explanations were added, up to 256 MB. Version 12 imports start with
no saved objective explanations. Validation runs against a separate staging
file; unsupported versions, damaged files, unexpected tables, views and triggers
are rejected. Only rows are copied into application-owned tables, in one
transaction. An import failure rolls back the replacement. A confirmed restore
runs under the single-writer lock, before application hooks and WebMCP mount, so
stale autosaves cannot overwrite restored work. If interrupted, the next load
retries the pending import; a failed import offers Retry and Cancel. Older
archived tables remain inert recovery data, not executable imported SQL.

## Scoring and feedback records

IELTS multiple-selection groups award credit for distinct correct choices,
regardless of selection order. Writing corrections use exact UTF-16 offsets in
the submitted response. Agents may omit offsets for an unambiguous exact quote;
repeated quotes need offsets or exact surrounding context. Writing and
custom-assessment feedback support revisions with an `expectedRevision` check.
Speaking feedback is saved once. See the [WebMCP reference](./WEBMCP.md) for
retry and revision handling.

## Deployment

SQLocal requires cross-origin isolation to persist data in the browser.
`public/_headers` configures the production headers expected by Cloudflare:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Other static hosts must return equivalent headers.

See the [SQLocal setup guide](https://sqlocal.dev/guide/setup) for browser
storage requirements.
