# TSP Work — operations: storage, backups, restore, retention

_Current as of 2026-11-12. Facts marked **verified** were checked against the live services on that date; items marked **to check** need the Cloudflare or Supabase dashboard, which the AI sessions could not sign in to._

## 1. Practice audio in Cloudflare R2

| Item | State |
|---|---|
| Bucket | `tsp-practice`, APAC, Standard class (**verified**) |
| Key format | `songs/<SONG ID>/<element-slug>.m4a` (AAC 128 kbps), or `.mp3` for older/manual uploads |
| Access | Only through the `practice-audio` Edge Function, which requires a signed-in linked account. Play/download links last 3 hours; a manual upload link 15 minutes; overnight-export upload/delete links 24 hours and are admin-only (**verified in the deployed function**) |
| Records | `practice_audio_state`: 655 rows, 62 songs, 15 elements (**verified**) |
| Exact files vs records | Shown in the app: **Ableton Sync → Practice audio → "Storage check"** compares every file in the bucket with every upload record by song and element, and lists older MP3s and files for unknown song IDs |
| Public access (r2.dev subdomain, custom domains) | **To check** in Cloudflare → R2 → `tsp-practice` → Settings. Both must be off/empty |
| CORS | **To check**: should allow only `https://aaronmark2222.github.io` (GET, PUT, HEAD) |
| Lifecycle rules | **To check**: none are needed; do not add an expiry rule (it would delete practice audio) |
| Size | About 3.1 GB of the 10 GB free tier. The app shows the current figure next to the storage check |

Never delete or move R2 objects by hand unless the Storage check (or a listing) has given the exact keys, and the song can be exported again from Ableton. The exports on the SSD (`TSP Exports`) are the recovery copy for audio.

## 2. Supabase backups

The project is on the **Free plan (verified)**. Free projects have **no automatic backups and no point-in-time recovery**, and a free project is paused after a week without activity. The database is small (16 MB), so a manual export is quick.

What matters most (cannot be rebuilt from Ableton): `song_tasks`, `task_status_log`, `task_types`, `members`, `member_emails`, `setlists`, `setlist_items`, `gigs`, `songs` (names, languages, manual backing status), `song_lyrics_edits` (pending edits), `ableton_sync_snoozes`.
Rebuilt by pressing Sync Ableton Set: `song_lyrics`, tempo/duration/keys, `app_meta` colours and fingerprints.

### Export (run on Aaron's Mac, about a minute)

1. Supabase dashboard → Project Settings → Database → copy the **connection string (URI, session pooler)**. It contains the database password: never paste it into chat, the repo or the app.
2. In Terminal (needs `pg_dump` 17: `brew install libpq`):
   ```
   pg_dump "<connection string>" --schema=public --no-owner --no-privileges -Fc -f ~/TSP-backups/tsp-$(date +%Y%m%d).dump
   ```
3. Keep the last few files on the Mac and one copy on the SSD. Do this before any database change and at least once a month, and always before a gig week.

### Restore rehearsal (never touches production)

1. Create a second free Supabase project (for example `tsp-restore-test`), or run Postgres locally with Docker.
2. `pg_restore --no-owner --no-privileges -d "<test connection string>" ~/TSP-backups/tsp-YYYYMMDD.dump`
3. Check row counts against production: `select count(*) from song_tasks` (1,426 on 2026-11-12), `songs` (62), `task_status_log`, `setlist_items`.
4. Delete the test project. The rehearsal has passed when the counts match and `song_readiness` returns 62 rows.

Auth accounts (logins) are not in the `public` schema dump. If the project were lost, re-create logins from Member access; member records and their task ownership come back with the dump.

## 3. Sign-in settings (verified 2026-11-12 from the project's public auth settings)

- Public sign-ups: **disabled**. Email is the only provider.
- A new account is never linked to a member by email match (migration `20261111180453`); only the admin's Member access function links accounts.
- Leaked-password protection is a paid-plan feature and is not available on the Free plan.

## 4. Activity logs and growth

`app_sessions` (335 rows), `page_visits` (900) and `practice_plays` (84) started on 2026-11-08 and grow by roughly 100 sessions and 300 page visits a day with seven users, a few tens of MB a year against the Free plan's 500 MB database limit (the database is 16 MB now). No clean-up is needed for a long time, but check the size every few months. When a Stats page exists, keep 12 months of detail and delete older rows in a migration reviewed by Aaron. `task_status_log` is history and should be kept.

## 5. Clean-up candidates (recommendations only; nothing has been removed)

| Item | Recommendation | Recovery if removed |
|---|---|---|
| Table `practice_audio_state_backup_20261109` (655 rows, no policies, not reachable by members) | Keep until the fingerprint testing phase (APP_PLAN §13.1) ends, then export it with `pg_dump -t` and drop it in a migration | The dump file |
| About 75 merged branches on GitHub | Delete from the GitHub Branches page once Aaron confirms none is in use; keep `stable-before-ableton-sync` | Commits stay reachable from `main`; a deleted branch can be restored from the same page for a while |
| Folder `tsp-band-app-live/` inside the repo (an old copy of `app.js`/`index.html`) and `apple-touch-icon.png.png` | Remove in a normal commit; nothing references them and the deploy does not copy them | `git revert` |
| A member email that used to be in `TSP Band App Summary.md` | Removed from current files. It is still in old commits. Removing it from history needs a force-push that rewrites every commit hash; only worth it if the address must not be discoverable. The simpler fix is changing that login's email in Member access | — |
