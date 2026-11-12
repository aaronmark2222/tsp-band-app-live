# TSP Work — public project status

_Last reconciled: 12 November 2026._ This public status page summarizes the project. Machine-specific paths, member activity details, and operational history remain in the private local handover log.

## Current state

- GitHub Pages serves the static frontend from `main`. Every push is syntax-checked and tested in GitHub Actions before it is published. The page carries a Content-Security-Policy.
- Supabase is healthy. The live ledger has 37 migrations through `20261111194231_lyrics_track_relay_state`; all 27 public tables have row-level security. Guests can read only Practice data; public sign-ups are disabled.
- The active Edge Functions are `practice-audio` v7 and `member-access-admin` v8.
- Practice audio lives in the private Cloudflare R2 bucket `tsp-practice` and is reached only through signed links. The admin's Sync page compares the bucket's files with the upload records.
- The Ableton bridge (TSPWork) is local to the band administrator's Mac and listens on the loopback address only. Repository source is 1.28 (commands require the signed-in admin's short-lived token); the installed copy is 1.27 until it can be updated safely.
- The app never saves the Live set; lyric edits change clip names in Live's memory and are confirmed only after a manual save.

Use `APP_PLAN.md`, `docs/OPERATIONS.md` and live service state for future work. Other documents in this repository are historical.
