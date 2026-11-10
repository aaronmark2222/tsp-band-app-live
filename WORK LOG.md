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

### Cloudflare / practice audio — verified

- Signed into Aaron's Cloudflare account and confirmed the correct R2 bucket is **`tsp-practice`**. The Cloudflare dashboard showed 655 objects totaling 3.14 GB; bucket **Public Access is Disabled**.
- Cloudflare's R2 API Tokens page shows an active token scoped to `tsp-practice` with **Object Read & Write**. Cloudflare documents this S3-compatible API scope as read, write, and list on selected buckets; its S3 write actions include `PutObject` and `DeleteObject`.
- The deployed Supabase `practice-audio` function (v7) names `tsp-practice` as its bucket and uses S3-compatible R2 signing for object listing/reads and admin uploads/deletes. Its R2 credential values remain in Supabase secrets and were not read or copied.
- The bucket scope and permission level are sufficient for the documented app operations. No Cloudflare bucket, token, public-access, or permission settings were changed.
- The Cloudflare API connector itself still fails (`whoami`, account listing, search, and execute return `Unknown tool`). Dashboard access works in the signed-in browser, which remains available for UI checks. The exact token secret configured in Supabase cannot be compared to the dashboard token without exposing secrets; no secret values were inspected.
- References: [R2 API token permissions](https://developers.cloudflare.com/r2/api/tokens/) and [temporary S3 credential permissions](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).
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
- Retried Cloudflare's connector; calls still report `Unknown tool`. Aaron signed into the dashboard, where the target R2 bucket and active bucket-scoped Object Read & Write token were verified.
- No app, Supabase, Cloudflare, or Ableton data was changed.

### 2026-11-10 — Verified Cloudflare R2 access

- Confirmed the authenticated Cloudflare account contains the app's `tsp-practice` bucket, with 655 objects (3.14 GB) and public access disabled.
- Confirmed an active R2 API token is scoped to this bucket with Object Read & Write, matching the deployed `practice-audio` function's list/read/upload/delete operations. No token secret was viewed or copied.
- The Cloudflare API connector still returns `Unknown tool`, but the authenticated dashboard provides the bucket and token verification. No permissions or bucket settings were changed.

### 2026-11-10 — Practice downloads and layout fixes

- Created GitHub review branch `fix/practice-mp3-downloads-and-layout` from the latest `main`; app edits remain off `main`, so this work does not trigger the Pages deployment.
- Refreshed the local current-app snapshot in `tsp-band-app-live/` from GitHub `main`. The older `tsp-work-local/` frontend remains untouched and is not the source for these changes.
- Practice → Download now saves real MP3 files. Existing MP3 objects are saved as MP3; AAC/M4A objects are fetched and converted in the browser at 192 kbps using pinned lamejs 1.2.1 from jsDelivr. Download all converts and downloads each track sequentially. The app's Offline audio cache continues saving its original playback files.
- Offline audio progress now gives its changing status text the flexible space and anchors Stop at the right edge.
- Multitrack meters now read each decoded track before its on/off gain, so disabled tracks still show their audio level; disabled meters use a neutral grey fill.
- The Songs list wrapper now clips its contents to the rounded frame, removing square corners behind its border.
- Bumped the `app.js` and `styles.css` cache marker in `index.html` to `20261110-practice-mp3`.
- Read the live `practice-audio` v7 Edge Function: R2 objects may be `.m4a` or `.mp3`, with the current upload path writing AAC/M4A. No Supabase, Cloudflare, bucket, token, or permission settings were changed.
- Repository-required JavaScript syntax check passed with `node --check`. No browser UI checks or broader tests were run.

### 2026-11-10 — Review branch ready

- Opened draft [PR #62](https://github.com/aaronmark2222/tsp-band-app-live/pull/62) against `main` and recorded the work in tracking issue [#61](https://github.com/aaronmark2222/tsp-band-app-live/issues/61). The PR is unmerged and no deployment has run.

### 2026-11-10 — Local sign-in preview

- Diagnosed the input clearing in the local file preview: `file://` does not provide the web origin the app's JavaScript module needs to load, so the sign-in submit handler cannot prevent the browser's normal form reload.
- Started the current review build at http://127.0.0.1:8000/ and confirmed the sign-in form loads there without browser console errors. The live app's `practice-audio` function already allows this localhost origin for local preview use.
- No credentials or Supabase Auth settings were changed. The local preview server is running; use the localhost address for sign-in rather than opening `index.html` directly.

### 2026-11-10 — Local Practice audio access and retry fix

- Diagnosed local audio fetch failures: the correct `tsp-practice` R2 bucket CORS policy initially allowed browser requests only from the deployed GitHub Pages origin. The review app runs at localhost, so its MP3 conversion and multitrack fetches were blocked by the browser.
- Added a separate R2 CORS rule for `http://127.0.0.1:8000` and `http://localhost:8000`, limited to GET and HEAD. The existing GitHub Pages rule, bucket contents, and disabled public access remain unchanged; localhost was not granted PUT access.
- Removed the extra MP3 conversion sentence from the Download header.
- Multitrack loading now retains tracks after a fetch failure, keeps the Download buttons connected, and shows how many failed tracks can be retried instead of removing the section.
- Bumped the app/style cache marker to `20261110-practice-mp3b`.
- Changes are in progress on the existing draft PR #62. R2 rule is saved; browser download and multitrack retry are being rechecked.
