# WORK LOG — TSP Work

Living project reference and activity log for `/Users/aaron/Claude Folders/TSP Band App` and `aaronmark2222/tsp-band-app-live`.

Keep this file and the repository copy in sync for every meaningful project step. GitHub tracking issue: https://github.com/aaronmark2222/tsp-band-app-live/issues/61

## Current app and system structure

### App source and deployment

- Product name: **TSP Work**, a private workspace for The String Project band.
- Source repository: [aaronmark2222/tsp-band-app-live](https://github.com/aaronmark2222/tsp-band-app-live), public, default branch `main`.
- The live app is a static, single-page site: `index.html`, `app.js`, `styles.css`, service worker `sw.js`, and image assets. It has no build step; the browser loads Supabase JS at runtime.
- GitHub Actions deploys from `main` to GitHub Pages. The workflow copies only the app files/assets it names; a push to `main` still runs the deployment workflow.
- Main app areas in the current master plan: Songs, Setlists, Gigs, Dashboard, Practice, and admin Ableton Sync. The user-facing app uses Supabase Auth; database RLS is the access boundary.
- `APP_PLAN.md` is the current master reference. Older `PLAN.md`, project summaries, and dated snapshots are historical when they differ from the live app or database.

### Live Supabase state — read on 2026-11-10

- Project: `tsp-band-app` (`hzvfrvjuqvmkeqbrgmqu`), status `ACTIVE_HEALTHY`, region `ap-northeast-1`.
- All 26 tables returned in the `public` schema inspection had RLS enabled.
- Live migration ledger: **30 entries**, latest `20261108210451_member_roles_guest`.
- Active Edge Functions: `member-access-admin` v8 and `practice-audio` v7. Both require JWT verification.
- Current row counts returned by the live table listing:

| Table | Rows | Notes |
|---|---:|---|
| `members` | 8 | 7 band roles plus guest role in the current plan |
| `member_emails` | 5 | Admin-managed account mapping |
| `languages` | 6 | |
| `songs` | 62 | |
| `song_languages` | 71 | |
| `medley_parts` | 0 | Schema exists; app workflow not implemented |
| `task_types` | 23 | AbleSet, utility, backing, and parts |
| `song_tasks` | 1,426 | Per-song task status rows |
| `task_status_log` | 518 | Change history |
| `percussion_instruments` | 12 | |
| `song_percussion` | 0 | Schema exists; no assignments currently |
| `setlists` | 3 | |
| `setlist_items` | 70 | |
| `gigs` | 3 | |
| `deadlines` | 0 | Schema exists; no rows currently |
| `ableton_sync_runs` | 23 | Ableton sync history |
| `ableton_sync_snoozes` | 22 | |
| `practice_tracks` | 10 | Legacy upload index; R2 listing is documented as authoritative |
| `song_lyrics` | 62 | Ableton-derived lyrics, sections, tempo, bars, tone |
| `app_meta` | 3 | Shared settings/metadata |
| `practice_export_log` | 71 | Practice audio export history |
| `practice_audio_state` | 655 | Practice audio fingerprints |
| `app_sessions` | 116 | |
| `page_visits` | 296 | |
| `practice_plays` | 53 | |
| `practice_audio_state_backup_20261109` | 655 | Dated backup; not the canonical live state table |

### Current product rules

- Members can read shared band data; task ownership controls task edits, while Aaron is admin. Public code uses only a public Supabase key; privileged keys stay in server-side secrets.
- Performance readiness is based on Mixed backing plus all required backing and AbleSet tasks completed or marked No. Parts and utility tasks do not gate readiness; Corrections and Recorded remain unfinished.
- Songs and Ableton are linked by song ID. Ableton is the source for arrangement regions and derived playback metadata; Supabase is the source for ownership, statuses, readiness, gigs, setlists, and member accounts.
- The local Ableton sync tool reads the saved `.als` read-only, suggests/apply task evidence, asks before metadata changes by default, and records runs. Never write or save the master `.als`.

### Cloudflare / practice audio — verification pending

- Current project documentation identifies Cloudflare R2 bucket **`tsp-practice`**, used by the `practice-audio` Supabase Edge Function. The documented object pattern is `songs/<SONG ID>/<element-slug>.m4a` (some older `.mp3` files).
- On 2026-11-10, Cloudflare connector calls for identity, accounts, and API search all failed with `Unknown tool`; the bucket and token permissions could not be read.
- Tried the Cloudflare dashboard in Chrome and reached its GitHub sign-in page, which requires the user to authenticate. The browser is left at that sign-in step for handoff.
- **Do not treat the documented bucket name as live-verified.** After Aaron completes sign-in/reconnects the Cloudflare connector, verify the authenticated account, list R2 buckets and confirm the exact `tsp-practice` bucket, then inspect current read/list/write permissions. Do not broaden or grant permissions without checking the exact required scope and asking at the action point.

### Local workspace vs. GitHub source

- This local directory is not a Git checkout and has no Git remote.
- It contains `tsp-work-local/` (an older local-test frontend), `ableton-sync/` (read-only Ableton sync tool and historical reports/prototypes), and `TSPWork control surface/` (Ableton Remote Script and patches).
- Local `tsp-work-local/app.js` is about 120 KB; current GitHub `main` `app.js` is about 359 KB. Use GitHub `main` as the current app implementation source; preserve the local Ableton work and reconcile intentionally.

### Working rules

- Before changing the database, inspect the live schema and migration ledger. Save each new migration using the exact version returned by Supabase.
- Do not put service-role keys, R2 keys, passwords, or tokens in code, GitHub, or this log.
- Changes pushed to `main` trigger a Pages deployment. Follow the current `APP_PLAN.md` checks and bump the frontend cache marker for frontend changes.
- Keep task ownership, readiness rules, and RLS intact unless Aaron changes them.
- Update this local WORK LOG and its GitHub copy after each meaningful work step.

## Activity

### 2026-11-10 — Project intake

- Read all local Markdown/README files: `ABLETON_INTEGRATION_PLAN.md`, `ableton-sync/README.md`, and `TSPWork control surface/README.md`.
- Read all repository Markdown/README files, including the current `APP_PLAN.md`, the app guide/system map/current-state docs, the historical plan/summary/setup docs, and migration README.
- Confirmed GitHub access to `aaronmark2222/tsp-band-app-live` with push permission. No app code was changed.
- Read current Supabase project status, public tables/RLS/row counts, migration ledger, and Edge Function versions. No database change was made.
- Created GitHub issue #61 as the cross-session activity thread.
- Cloudflare connection was unavailable; no bucket access or permissions were changed.

### 2026-11-10 — Refreshed live inventory and log naming

- Re-read live Supabase table counts, migration ledger, and function versions. This refreshed several counts from the 2026-11-08 plan snapshot: `member_emails` 5, `task_status_log` 518, `app_meta` 3, and `practice_export_log` 71.
- Renamed the local log to the requested `WORK LOG.md` filename and added the matching copy to the GitHub repository.
- Retried Cloudflare's connector; calls still report `Unknown tool`. Opened the dashboard and reached GitHub authentication; waiting for Aaron to complete sign-in before verifying the account, bucket, or permissions.
- No app, Supabase, Cloudflare, or Ableton data was changed.