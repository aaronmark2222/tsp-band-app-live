# Current implementation context

This note summarizes information already documented in the public repository. It does not record private account details, live database contents, credentials, or security scan results. Check the connected Supabase project directly before relying on assumptions about its current state.

## Architecture

- The [cross-system map](SYSTEM_MAP.md) is the detailed reference for live Supabase schema and RLS, browser data flow, Ableton track groups and metadata, task meanings, and the planned MP3 export workflow.
- This repository is a **public** GitHub Pages static-site repo. The deployed app requires an account linked through Supabase Auth.
- The app is a static single page: `index.html`, `app.js`, and `styles.css`. It has no build step or server runtime. The frontend imports a pinned `@supabase/supabase-js` version from esm.sh.
- GitHub Actions workflow `.github/workflows/deploy.yml` deploys on pushes to `main` and manual dispatch. It stages the app files and required images for GitHub Pages.
- The browser uses the Supabase project URL and public publishable/anon key. A public key is expected to be visible in browser code. Never place a secret/service-role key in frontend code or Git.
- Supabase Edge Function `member-access-admin` supports administrator member-account operations. Its privileged key is read from server environment secrets, not browser code.
- Serve the repository root with a static web server for local use.

## App behavior

- Members sign in with email and password. The Supabase Auth user is matched to a `members` row.
- First-login password setup is supported for newly linked accounts.
- The main views are Songs, Setlists, Gigs, and Dashboard. Song-task ownership in `task_types.owner_member_id` controls member editing; the administrator can manage broader work and setlists. Supabase row-level security is the authorization boundary.
- The Dashboard has a tab for every active gig plus **Total Setlist**, with the next upcoming gig selected by default. New gigs appear as their own tab and show the songs in their attached setlist. Admins can mark a gig complete after its date has passed; completed gigs remain in Gigs history but no longer appear on the Dashboard.
- Setlist editing is available to the administrator; additions, removals, and ordering are staged until Save, shown on the same edit control. The control reads **Done editing** when clean and **Save** when there are changes. The bottom of edit mode has a confirmed setlist deletion action; linked gigs remain but become unattached, and related running-order items and deadlines are removed. Members can view setlists.
- The Songs page has an administrator-only **Add song** action and no setlist count card. The Add Song editor loads languages, scales, tempos, and task statuses. Expanded song details show **Scale(s)** after tempo and provide one admin **Edit** button at the right of the information line on both Songs and Setlists. The shared editor changes name, languages, scales, duration, tempo, and backing status; Song ID and its derived format are fixed identity fields.

## Data model and references

The migration files describe schema evolution; the [cross-system map](SYSTEM_MAP.md) records the live schema and migration ledger snapshots. The gigs table's `completed` field was added on 2026-10-31. Always recheck live state before database changes. Core entities cover members and linked emails; songs, languages and medley parts; task types, per-song tasks and task status history; percussion instruments; setlists and setlist items; gigs; and deadlines. Views documented in the app guide summarize readiness, setlist duration, member progress, and deadlines.

Start with:

- [App guide](APP_GUIDE.md) for screens, data flow, roles, and maintenance.
- [Product plan](../PLAN.md) for requirements and earlier decisions.
- [Project summary](../TSP%20Band%20App%20Summary.md) for confirmed behavior and the change log.
- [Supabase setup guide](../SETUP_SUPABASE.md) for initial setup history.
- [Supabase migrations](../supabase/migrations/) for schema and SQL changes.

Some documentation describes earlier stages of the product. When sources differ, inspect current frontend code and the live Supabase schema/migration history, then preserve user-confirmed behavior. Do not blindly replay the initial setup SQL against the live project.

## Future change loop

1. Read this note, the app guide, the relevant frontend files, and the relevant migration/policy files.
2. For Supabase changes, inspect the connected live schema and migration history and consult current official Supabase documentation.
3. Keep changes narrow. Preserve the member ownership model and RLS. Never put privileged credentials in public code.
4. Update the relevant documentation and this note when behavior, schema, or deployment changes.
5. Verify changes with an appropriate targeted check. Do not apply database changes or deploy to production unless that change is part of the user's request.


## Ableton metadata sync (2026-10-26)

- The connected Supabase `songs` table was synchronized for all 50 current songs from the Ableton Live master arrangement. The update covered `tempo_start`, `tempo_end`, `tempo_change`, `tempo_segments`, `duration_seconds`, and the starting `keys` value.
- The 58 `song_languages` links and 6 language definitions were left unchanged. Ableton's `Other` language labels are not used to overwrite the app's language values.
- Tempo means Ableton playback tempo. The app shows the start BPM and an Ableton-style step icon for an immediate change or a slope icon for a gradual change; downward changes flip the glyph vertically. Expanding tempo shows the exact bar or bar range relative to the song's first bar.
- Song duration is measured across the locator-bounded Ableton arrangement region and rounded to the nearest second. A medley key is its starting key only.
- Source-of-truth SQL is [the Ableton metadata migration](../supabase/migrations/20261026130000_sync_song_metadata_from_ableton.sql). See [the sync notes](ABLETON_METADATA_SYNC.md) for methods and the seven recorded tempo transitions.


## Repeating tempo changes

- The live `public.songs.tempo_segments` column is `jsonb` and stores an ordered array of tempo points. Each point has its own `transition_to_next` value (`instant` or `gradual`), so the list supports any number of changes and mixed transition types.
- The scalar `tempo_change` enum remains a compatibility summary of the first transition; the full chain is stored in `tempo_segments` and read from there by the app.
- The Add Song and shared Edit song details forms append one BPM field when a transition glyph is chosen after the current point. The glyph choices repeat after every BPM field. Clicking a selected glyph cancels that transition and removes its following tempo point; if there are later points, their following transition is carried back to the current point.

- A tempo point’s `change_start_bar` and `change_end_bar` fields store song-relative positions. Immediate changes use the same bar for both fields; gradual changes use their start and end bars. The compact tempo and bar fields in Add Song and the admin **Edit tempo** dialog write these fields, and the existing Songs tempo detail reads them.


## Song library ordering (2026-11-01)

- New songs now inherit their sort position from neighboring IDs with the same alphabetic prefix. The Songs view uses a natural numeric tie-breaker so E8 follows E7 when they share the same sort position.
- E8 (Sweet Caroline) was moved in Supabase from the end of the repertoire to immediately after E7. Existing later songs keep their established group order.


## Add Song duration entry (2026-11-01)

- The Add Song duration field accepts minutes and seconds in M:SS format, for example 4:22, and saves the equivalent total seconds to `songs.duration_seconds`. Seconds must be 00–59. The shared song editor still uses decimal minutes.
