# TSP Work: system map

_Last consolidated: 2026-10-26. This note connects the deployed band app, its live Supabase database, the Ableton master project, and the planned local export workflow. It records confirmed implementation separately from future work._

## Start here

- [App guide](APP_GUIDE.md): screens, current interactions, and maintenance details.
- [Current implementation context](CURRENT_STATE.md): concise current-state reference.
- [Ableton metadata sync record](ABLETON_METADATA_SYNC.md): the song metadata audit and the ALS-derived tempo changes.
- [Repository README](../README.md): setup and deployment entry points.
- [Migrations](../supabase/migrations/): versioned schema and data changes.

The current Ableton source file is on Aaron's Mac, outside GitHub:
`/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als`.
The repository stores documentation and the audited metadata update, not a copy of the Live Set. The `.als` file is an XML-based compressed Live Set; inspect it read-only and never rewrite it as a side effect of documentation or export work.

## 1. System boundaries and data flow

```text
Band member browser
  ├─ GitHub Pages: static HTML/CSS/JS
  └─ Supabase Auth + PostgREST
       ├─ Auth session identifies a member
       ├─ public tables/views read through RLS
       ├─ task and song changes written through RLS
       └─ member admin operations call a protected Edge Function
            └─ service-role key exists only in Supabase function secrets

Ableton Live master project
  ├─ source repertoire, song/section regions, tempo, starting key
  ├─ reference stems, practice inputs, parts, live channels, CPC, backing groups
  └─ future local MP3 export process → per-song folders on the Mac
```

These are related systems with different responsibilities:

- **Ableton is the playback and arrangement source of truth.** Its master tempo automation determines playback tempo. Song ID MIDI clips and arrangement markers/locators identify each song region. AbleSet sections further divide each song.
- **Supabase stores the app's shared song metadata and work state.** The frontend presents that data, task assignments, readiness, gigs, and setlists. It does not read the ALS file at runtime.
- **The app's setlist order is for a gig in the app.** AbleSet controls Ableton performance order. Do not infer Ableton's song order from the database's `sort_order` or app setlists.
- **The proposed MP3 exporter is not implemented yet.** It should read completed app statuses and the Ableton project to select and export tracks; the first output destination is a local Mac folder. Google Drive is deferred.

## 2. App and deployment

The repository `aaronmark2222/tsp-band-app-live` is a public static site. The app has no server-side frontend runtime or build step. `index.html`, `app.js`, and `styles.css` are served by GitHub Pages. GitHub Actions deploys when changes reach `main` (or on manual dispatch). A Pages deployment does not apply Supabase migrations or update database contents.

The browser imports Supabase JS from the pinned esm.sh package in `app.js`, then connects to project ref `hzvfrvjuqvmkeqbrgmqu` at `https://hzvfrvjuqvmkeqbrgmqu.supabase.co`. The URL and publishable/anon key are public client configuration. Never put a database password or `service_role` key in the repository or browser code.

### Sign-in path

1. A member signs in using Supabase Auth email/password.
2. `members.user_id` links the Auth user UUID to the band member row.
3. The app loads member data only after finding that row; it also enforces the first-login password change flag.
4. RLS is the real authorization boundary. UI controls are an additional affordance, not security.
5. Admin-only member account management calls `supabase/functions/member-access-admin`. The Edge Function validates the bearer token, confirms the caller's linked member is an admin, and uses a service-role key stored in function secrets for Auth Admin actions. It permits member listing, reset emails, and generation of temporary passwords.

Public sign-ups should stay disabled. Members are linked by the administrator. Email addresses are in `member_emails`, not in the member-readable profile table.

### App data flow

- On login, `app.js` loads `songs`, `song_tasks`, `task_types`, `song_languages` (with language labels), `languages`, `setlists`, `gigs`, and `members`; it reads readiness from `song_readiness`.
- Expanding a song shows metadata and its task rows. Admins can add songs and edit tempo metadata. The song ID prefix determines instrumental/vocal and single/medley identity; there is no separate format choice.
- Inserting a song triggers task-row creation for every configured task type. The app then attaches language rows and any initial task statuses. If its multi-step save fails, the frontend attempts to clean up the created song.
- Updating a task writes `song_tasks.status`; a database trigger records changes to `task_status_log`. RLS permits the task owner or an admin to update status.
- Updating the manual backing state writes `songs.backing_track_manual`. A null value means automatic state from backing task statuses; the UI calls this “Auto”.
- App setlist editing writes ordered `setlist_items`; gigs link to a setlist. The database views supply totals and progress.
- Errors from Supabase are surfaced in the UI; successful UI rendering does not bypass database policy checks.

### Main screens

- **Songs:** searchable/filterable repertoire, song metadata, member and band progress, task statuses, backing status; admin-only add song and tempo editor.
- **Setlists:** ordered gig repertoire, song details, runtime, and admin editing. Legacy break/note item types remain in the schema.
- **Gigs:** gig date/time/location/notes and associated setlist. Creating a gig also creates an initially empty setlist.
- **Dashboard:** outstanding work by gig or full repertoire and selected member. Looking at another member's dashboard does not grant permission to edit their tasks.
- **Member access:** admin operations routed through the protected Edge Function.

### Task status meaning and readiness

The live task status enum is `Incomplete`, `Completed`, `No`, `Corrections`, `Review`, `Draft`, and `Recorded`. Each `task_types` row has its own allowed statuses, owner, and `done_statuses`. In current data, `Completed` is the done status; `No` means not applicable. `Corrections` remains incomplete. `Recorded` is not the same as completed and is tracked separately in progress summaries.

The user's workflow definitions:

- **AbleSet tasks** (`Sections`, `Lyrics`, `Chords`): Completed means the writing/annotation work is finished in the relevant AbleSet MIDI clips/tracks.
- **Band Parts:** Recorded means a member has recorded their part. Completed means the recording was reviewed and timing/tuning corrections were made. Parts are reference/practice material, not live performance audio. They can be used as a practice substitute when a member is absent.
- **Backing tasks:** Recorded is an initial recording state; Completed means reviewed/fixed. Backing output then goes to mix. The app's backing state is `Sent to Mix` while waiting and `Mixed` after the returned mix is received.

The live `song_readiness` view requires all configured backing task rows and all AbleSet task rows to be `Completed` or `No`, and the manual backing state to be `Mixed`. Parts are intentionally optional and do not affect readiness. Thus `Sent to Mix` is not ready. The view also exposes a `parts_complete` informational value, but readiness does not include it. The app should not duplicate this calculation in frontend-only logic.

One nuance for future export automation: Part task completion is an export-selection rule for corresponding Live Channels, even though Parts themselves do not enter the live mix. Do not confuse the export gate with the app's performance-readiness calculation.

## 3. Supabase model and policies

The current live project was queried on 2026-10-26. Snapshot counts were 50 songs, 7 members, 6 languages (58 song-language links), 18 task types, 900 song-task rows, and 12 percussion instruments. Its public schema has 15 primary tables and 4 views:

| Table | Role in the app |
| --- | --- |
| `members` | Band member identity, instrument/role, admin flag, Auth user link, first-login flag, sort order. |
| `member_emails` | Private admin-managed email mapping for onboarding. |
| `songs` | Song ID/name/type, medley flag, keys, playback tempo, duration, backing override, order, timestamps, and tempo JSON. |
| `languages` | Language code, exact language name, short label, sort order. |
| `song_languages` | Many-to-many song/language links with display position. |
| `medley_parts` | Optional constituent-song details for a medley. |
| `task_types` | Task catalogue, category, owner, allowed statuses, done statuses, display order. |
| `song_tasks` | Current status for one song and one task key; composite song/task identity. |
| `task_status_log` | Trigger-written history of status changes. |
| `percussion_instruments`, `song_percussion` | Instrument catalogue and per-song percussion assignments. |
| `setlists`, `setlist_items` | Setlist header and ordered song/break/note rows. |
| `gigs` | Performance date/time/location/notes and optional linked setlist. |
| `deadlines` | Gig-, song-, task-, or member-associated due dates. |

Views used by the app:

- `song_readiness`: backing completion, optional Parts completion, AbleSet completion, derived/overridden backing label, and ready boolean.
- `setlist_summary`: song count, song seconds, break seconds, and total seconds.
- `setlist_member_progress`: per-setlist progress grouped by task owner, including a distinct Recorded count.
- `setlist_deadline_list`: gig dates plus explicit deadlines in a common list.

Important `songs` fields:

- `id` is a text primary key (for example `I5`, `EM3`, `HM2`); the prefixes encode song format/language conventions.
- `keys` is a text array. App metadata stores the starting key; for medleys this is only the medley-level starting key. Song-by-song medley details can live in `medley_parts` when populated.
- `tempo_start`, `tempo_end`, `tempo_change` are legacy/summary columns. `tempo_change` enum uses `none`, `ramp`, `jump`.
- `tempo_segments` is a non-null JSONB array containing the full ordered tempo map. It supports any number of changes and different transition types in the same song. A tempo point contains `bpm` and `transition_to_next` (`gradual` or `instant`); change-specific data belongs to the point that leads into the next tempo.
- `duration_seconds` stores arrangement-region duration in seconds.
- `backing_track_manual` is null (Auto), `Sent to Mix`, or `Mixed`.

Example for a gradual change from 90 to 82 BPM, from relative bar 21 through bar 34:

```json
[
  {
    "bpm": 90,
    "transition_to_next": "gradual",
    "change_start_bar": 21,
    "change_end_bar": 34,
    "change_start_beat": 80,
    "change_end_beat": 132
  },
  { "bpm": 82, "transition_to_next": null }
]
```

For an immediate transition, `change_start_bar` and `change_end_bar` are the same. Bar numbers are relative to the first bar of the song. Beat positions are also song-relative. The scalar `tempo_change` remains a compatibility summary of the first transition: `ramp` for gradual and `jump` for immediate. The Add Song form and admin Edit tempo control edit the JSONB tempo chain; clicking a selected glyph cancels that transition. The transition UI uses compact left-aligned BPM and bar boxes.

### Live security model

RLS is enabled on application tables:

- Linked authenticated band members can read shared repertoire, task progress, setlists, gigs, deadlines, and reference data; no linked member means no app data access.
- The task owner or an admin can update a `song_tasks` status. Only admins can create/delete task rows and change general song/setup/setlist/gig/deadline data.
- `member_emails` is admin-only.
- The percussion task owner or admin can add/remove per-song percussion assignments.
- Status history is read-only for members and written by database trigger.
- Views use security-invoker semantics in the schema migration; underlying RLS still applies.
- The Edge Function is the only documented browser workflow that needs service-role powers. Its key is held in Supabase secrets, never in GitHub Pages.

### Migration and live drift notes

`SETUP_SUPABASE.md` and repository files in `supabase/migrations/` preserve historical bootstrap/source material; they are not safe instructions to blindly replay against production. The bootstrap guide's original expected `song_tasks` count (700) predates the current 18-task catalogue; the live snapshot currently has 900 rows. The live migration ledger, queried 2026-10-26, included:

- `0006_split_ableset_tasks`
- `0007_optional_parts_dashboard_readiness`
- `0008_dashboard_all_songs_readiness`
- `0009_readiness_null_safe`
- `0010_corrections_remain_incomplete`
- `0011_oct_30_setlist_and_guitar_tone_owner`
- `first_login_password_setup`
- `song_tempo_segments`
- `readiness_requires_mixed_backing_and_ableset_completion`

The live ledger did not list every repository baseline/import SQL file, and the metadata sync file is an explicit song-data update. Inspect the current schema, migration ledger, policies, and target rows before applying future database work. Prefer a new, narrowly scoped migration for schema changes. Never use `service_role` in frontend code.

## 4. Ableton master project

### How song regions and musical metadata are read

The master project contains the whole repertoire. The song ID MIDI track has clips spanning song regions; arrangement markers/locators also bound those regions. These two signals should align. The user reported merging the two E6 song-ID clips; recheck E6 when auditing a later Live Set. The song/section grid is further divided in the **Sections** track, which AbleSet uses.

- **Song ID clips and locators/markers:** identify song boundaries and duration regions. App `sort_order` is not Ableton performance order.
- **Master tempo automation:** source for playback tempo, including immediate jumps and gradual ramps. The app must describe playback tempo rather than original-record tempo.
- **AbleSet MIDI clips at the start of the region:** source for the general starting key. For medleys, the app key is the starting key only.
- **Sections track:** section structure used by AbleSet; the app's Sections task is complete once that AbleSet work is written.
- **Duration:** elapsed playback time across the locator-bounded arrangement region, integrated against tempo automation, rounded to seconds.
- **Language:** preserve Supabase's exact language entries. Ableton's `Other` is not a replacement language value in the app.

The ALS metadata review documented 50 song rows. All song-ID clip boundaries were cross-checked against locators after the E6 clips were merged. When the Live Set changes, re-parse both boundaries and compare every song before refreshing data; do not infer bounds from track order alone.

### Confirmed track groups and purpose

The track names below are user-explained group roles. They describe the project workflow, not schema table names.

| Ableton group / tracks | Meaning and relation to app |
| --- | --- |
| **STEMS**: `TRACK`, `VOCALS`, `BASS`, `DRUMS`, `OTHERS` | `TRACK` holds the original cover source. It is separated into the four original stems, used as reference while arranging. These stems do not feed the produced Backing Tracks group. |
| **CPC** (Clicks, Prompts, Counts) | Click track and count-ins; in-ear band prompts such as “Chorus in 1 2 3 4” or “Break in 1 2 3 4”; separate singer-recorded vocal prompts announcing song name/key; and **Intro Que**, a short reminder of the intro played with the vocal prompt. Export CPC's main group only. |
| **Inputs** | Physical instrument inputs from the interface during practice, assigned to the relevant instrument. They are input sources for the corresponding Live Channels. |
| **LIVE CHANNELS** | Main channel for each instrument and the source for that instrument's live sound. Inputs feed these channels. The future export selects a channel only when its corresponding Parts task qualifies as Completed. |
| **Parts** | Recorded member parts are fixed reference for the expected performance and can stand in during practice if a member is absent. They are not themselves live-performance audio and should not be included as separate live mix stems. The user earlier described Parts routing toward corresponding Live Channels, then clarified Parts is reference only and has no role in live performance; verify actual signal routing before automating any export. |
| **Backing Tracks** | Produced backing arrangement group. This is where recreated iconic sounds inspired by source stems belong. The produced group's main output feeds Master. Export the Backing Tracks main group only; do not export its subgroups separately. |
| **Master** | Receives the produced Backing Tracks group and the live channels for the overall playback mix. |

The app tracks production/checklist state rather than individual Ableton track audio. Current task keys connect broadly as follows:

| App category/key | Ableton relation |
| --- | --- |
| `ableset`: `sections`, `lyrics`, `chords` | Written AbleSet annotations/arrangement metadata; not a track-audio export by themselves. |
| `utility`: `prompts`, `guitar_tone_midi` | Prompts are CPC work; Guitar Tone Midi is the Ableton MIDI tone programming check. |
| `backing`: `backing_music`, `backing_vocals_dale`, `backing_vocals_anston`, `backing_percussion`, `backing_sfx` | Backing group production/checklist pieces. Export the Backing Tracks main group, not each subgroup. |
| `part`: `bass_part`, `keyboard_part`, `guitar_part`, `violin_part`, `percussion_part`, `drums_part`, `vox_dale`, `vox_anston` | Tracks whether the member's recorded reference part has been made and reviewed. These task rows gate Live Channel export selection per the user's requested process; they do not make the Parts group a live mix source. |

### Metadata import snapshot

The repository's ALS-derived metadata sync record updates tempo, duration, starting key, and tempo segments for 50 existing songs; it intentionally leaves `languages` and `song_languages` unchanged. The previously inspected changes with tempo transitions are:

| Song ID | Playback tempo change | Song-relative bars |
| --- | --- | --- |
| I5 | 90 → 82, gradual decrease | 21–34 |
| EM1 | 130 → 124, gradual decrease | 45–60 |
| EM3 | 148 → 116, immediate decrease | at 125 |
| EM4 | 136 → 125, gradual decrease | 81–89 |
| HM2 | 130 → 140, immediate increase | at 113 |
| EHM4 | 102 → 109, gradual increase | 28–44 |
| EHKM1 | 136 → 133, gradual decrease | 137–148 |

These values are a snapshot from the project inspected on 2026-10-26, not a promise that later Ableton edits have been synchronized.

## 5. Requested local MP3 export workflow (planned)

The requested deliverable is a repeatable local export run that can be left overnight and produce neatly organized song folders on the Mac. Google Drive upload comes later.

### Candidate exports

For each selected song region, make available:

1. Four original source stems: VOCALS, DRUMS, BASS, OTHERS.
2. Each **LIVE CHANNEL** for which the matching Parts task is `Completed` (not merely `Recorded`). A `No` task should not cause an unrelated channel to be exported.
3. CPC main group only.
4. Backing Tracks main group only.
5. **Main mix, no CPC:** completed/qualified Live Channels plus the Backing Tracks main group.
6. **Main mix + CPC:** the previous mix plus CPC main group.

The source stems are reference-only; they are never implicitly routed into the backing mix. The Main mix definitions above come from the user's export brief. Verify exact Ableton group/track paths, render ranges, and any routing differences against the current ALS before building automation.

### Output and completion gates

- Output format: MP3.
- First destination: a local folder on the Mac, organized into one folder per song with clear, stable filenames.
- Song boundaries: markers/locators reconciled with song-ID clips.
- Selective export: export only the requested track/group combinations for the selected songs; group exports should use main groups where specified.
- Gate Live Channels by their corresponding app Parts task being **Completed**. Parts' meaning of Completed includes review/timing/tuning correction.
- Export backing main-group audio as a completed deliverable only after its production state is complete. The database's `Sent to Mix` / `Mixed` flag describes external mix return; do not treat `Sent to Mix` as final readiness.
- Do not upload to Google Drive until that integration is separately requested.

This is a product requirement, not a currently available app action. The repository does not yet contain an ALS automation/export script or a nightly job. Before implementation, resolve the exact mapping from each app song ID to Ableton locator names, group names, and corresponding instrument Live Channels, then verify a small sample of MP3 outputs.

## 6. Maintenance rules and change record

- Keep the GitHub Pages frontend and Supabase migration/data history as separate deployment concerns.
- For database changes, inspect the live project first, create a migration for schema/policy changes, and verify the live migration ledger. Do not replay a seed/import file blindly.
- Keep app language records authoritative for language names; do not overwrite them from Ableton's `Other` track.
- Keep every app/Ableton mapping explicit. When track names or task keys change, update this guide and the exporter mapping together.
- When the master ALS changes, record its modified date or checksum, recheck song ID clip/locator alignment, section markers, tempo automation, starting keys, and durations before synchronizing.
- Never commit passwords, service-role keys, Auth tokens, or other secrets.

### Change log

| Date | Change |
| --- | --- |
| 2026-10-26 | Documented the live project/schema relationship, RLS and app data flow, ALS track groups, task meanings, tempo-bar storage, metadata sync snapshot, and local MP3 export requirements. |
| 2026-10-26 | Recorded the user's E6 Song ID clip merge and the requirement to revalidate it on future ALS audits. |
| 2026-10-26 | Tempo editor updated in PRs #49–#52: multi-transition bar-aware tempo segments; edit existing songs; selected glyph cancels; compact left-aligned BPM/bar inputs. |
