# TSP Work — App Plan (master document)

_Last updated: **2026-11-08** · App version marker `?v=20261108-pwa2` · TSPWork remote script **1.17** (alsreader md5 `b356e5fa…`, exporter md5 `639f2b48…`, tspwork md5 `223967ff…`) · Supabase ledger head `20261107190244_practice_audio_state` · Edge Functions `practice-audio` v7, `member-access-admin` v6._

This is the **single source of truth for resuming work** on TSP Work (the TSP Band App) for The String Project. It is written for an AI model (or a person) picking the project up cold. Read sections 0–4 before touching anything. Older documents (section 16) are history; where they disagree with this file, this file wins, and the live code/database win over both.

---

## 0. How to use and update this file

**Resume checklist (do this first, every session):**
1. Read sections 0–4 of this file (purpose, systems, locations, rules).
2. Look at the live state rather than trusting memory:
   - Repo: `git log --oneline | head -20` on `aaronmark2222/tsp-band-app-live` (branch `main`).
   - Supabase: `list_migrations` and `list_tables` on project `hzvfrvjuqvmkeqbrgmqu`.
   - Edge Functions: `list_edge_functions` (versions above).
   - Mac (if the device bridge is connected): md5 of `~/Music/Ableton/User Library/Remote Scripts/TSPWork/*.py` versus `tools/ableton-remote-script/TSPWork/*.py` in the repo.
3. If anything differs from the header line above, investigate before building on it.

**"Update App Plan" (Aaron's trigger phrase).** When Aaron says **"Update App Plan"**, do all of this:
1. Make sure everything is committed and pushed to `main` (frontend, `tools/`, `supabase/functions/`, `supabase/migrations/`).
2. Compare the Supabase migration ledger with `supabase/migrations/`. Every live migration needs a file named `<live version>_<name>.sql` (read the version from `list_migrations`). Fetch any missing SQL from `supabase_migrations.schema_migrations.statements`.
3. Compare deployed Edge Function source (`get_edge_function`) with `supabase/functions/*/index.ts`; commit any difference.
4. Compare the Mac's TSPWork files with `tools/ableton-remote-script/TSPWork/` (md5).
5. Re-read recent commits, the live schema, and the conversation, then update **this file**: the header line, any changed sections, the decision log (section 14), known issues (section 15) and the changelog (section 17). Keep it accurate rather than long; remove what is no longer true.
6. Commit as "Update App Plan (<date>)", push, and copy the file to the claude.ai Project doc `claude/APP_PLAN.md`.
7. Tell Aaron in a few lines what changed in the plan and anything that was out of sync.

---

## 1. What TSP Work is

**The String Project (TSP)** is a 7-member live band. **TSP Work** is their private web app. It replaces the old "Master Setlist" Google Sheet and Apps Script, and it is tied tightly to Aaron's **Ableton Live master project**, which runs the band's backing tracks and AbleSet lyric screens on stage.

The app does four jobs:
1. **Work tracker.** Every song has tasks (backing production, AbleSet charts, recorded parts, cues). Every member sees everything and edits only their own tasks; Aaron (admin) edits everything. Readiness for performance is computed.
2. **Gigs and setlists.** Gigs with dates and setlists, running times, and per-gig dashboards of remaining work.
3. **Ableton Sync** (admin, on Aaron's MacBook). Reads the saved `.als`, proposes task completions from clip evidence, keeps duration, tempo and key in sync, flags chord mismatches and project problems, jumps or zooms Ableton to work for review, and exports per-song practice audio overnight to Cloudflare R2.
4. **Practice** (all members). Streams each song's Mixdown or an Ableton-style multitrack (parts, backing, CPC, stems) with AbleSet-style lyrics/chords synced to the audio, live key and tempo, downloads, and (for the guitarist) MIDI guitar-tone changes sent to his own Ableton.

The app's visible name is **TSP Work**. The repo and Supabase project keep their technical names.

### The band

| Member | Slug | Instrument (DB) | Admin | Linked login |
|---|---|---|---|---|
| Aaron | `aaron` | Bass / playback engineer | **yes** | yes |
| Dale | `dale` | Female vocals | no | yes |
| Anston | `anston` | Male vocals / violin | no | yes |
| Rowen | `rowen` | Guitar | no | yes |
| Albert (Milton) | `albert` | Keyboard | no | yes |
| Gautham | `gautham` | Percussion | no | **not linked yet** |
| Nishanth | `nishanth` | Drums | no | yes |

Aaron is the owner and the only person who runs Ableton Sync and exports. He mostly uses the app on iPhone (home-screen web app) and on his MacBook in Safari. He is not a programmer: explain things simply, and do the work rather than handing him steps, except steps only he can do (passwords, keys, GUI permission prompts).

---

## 2. Systems and how data flows

```text
                    ┌───────────────────────────── GitHub (public repo) ─────────────────────────────┐
                    │ aaronmark2222/tsp-band-app-live · push to main → Actions → GitHub Pages        │
                    │ https://aaronmark2222.github.io/tsp-band-app-live/  (index.html, app.js, css)  │
                    └───────────────┬───────────────────────────────────────────────┬────────────────┘
                                    │ browser (any member)                           │ browser on Aaron's MacBook
                                    ▼                                                ▼
 Supabase (hzvfrvjuqvmkeqbrgmqu) ◄── Auth + PostgREST (RLS) ──►  app.js  ──fetch https://127.0.0.1:47711──► TSPWork
   tables/views/RPCs                                              │                                       (Ableton remote script
   Edge Fn member-access-admin (service role in secrets)          │                                        inside Live 12, Python)
   Edge Fn practice-audio (R2 keys in secrets) ──presigned URLs──►│◄── audio GET (presigned) ── Cloudflare R2   │
                                                                  │                              bucket tsp-practice
   TSPWork ── reads saved .als (alsreader) ── renders exports via Live's Export dialog (exporter)
          └── PUT presigned uploads (curl) ──────────────────────────────────────────────► R2
          └── OSC 127.0.0.1:39051 → AbleSet floating window (lyrics page)
 Rowen's MacBook (Chrome) ── Web MIDI ── IAC Driver ── his Ableton ── his guitar processor
```

**Who is the source of truth for what:**
- **Ableton `.als`:** song regions (SONG ID clips plus locators), playback tempo map, time signatures, keys (`[Key:]` clips), sections, lyrics/chord charts (`+LYRICS` tracks), guitar tone notes, track colours, and evidence that work exists. Sync writes these into Supabase.
- **Supabase:** task statuses, owners, readiness, gigs, setlists, members, plus copies of `.als`-derived data (song metadata, `song_lyrics`, `app_meta` colours).
- **R2 bucket:** which practice audio exists. There is no table listing files; `practice-audio` lists the bucket.
- **App setlist order is not AbleSet order.** AbleSet controls the stage order in Ableton.

---

## 3. Locations, identifiers, ports

| Thing | Value |
|---|---|
| Repo | `aaronmark2222/tsp-band-app-live` (public). Working clone used by Claude: `/home/claude/aaronmark2222/tsp-band-app-live` |
| Live site | https://aaronmark2222.github.io/tsp-band-app-live/ |
| Deploy | `.github/workflows/deploy.yml`, on push to `main`. Copies **only** `index.html app.js styles.css sw.js apple-touch-icon.png assets/the-string-project-logo.png assets/ableton-sync-logo.*`. Any new public file must be added there. |
| Supabase project | `hzvfrvjuqvmkeqbrgmqu` · `https://hzvfrvjuqvmkeqbrgmqu.supabase.co` · publishable key is in `app.js` (public by design) |
| Edge Functions | `member-access-admin` (v6, service role in secrets) · `practice-audio` (v7, R2 secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, entered by Aaron himself) |
| Cloudflare R2 | bucket **`tsp-practice`**, keys `songs/<SONG ID>/<element-slug>.m4a` (or older `.mp3`). CORS allows GET/PUT/HEAD from `https://aaronmark2222.github.io`. Free tier 10 GB. |
| Ableton set | `/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als` (about 18 MB gzip XML). **Read only.** Optional override in `~/.tspwork.json` `{"als_path": ...}` |
| TSPWork remote script | `~/Music/Ableton/User Library/Remote Scripts/TSPWork/` (`__init__.py`, `tspwork.py`, `alsreader.py`, `exporter.py`, `tspwork-localhost.crt/.key`, `requests.log`). Repo copy: `tools/ableton-remote-script/TSPWork/` (cert and key are git-ignored and must never be committed) |
| TSPWork ports | HTTP `127.0.0.1:47710`, HTTPS `127.0.0.1:47711` (self-signed cert, trusted on Aaron's Mac with `security add-trusted-cert`). Allowed origins: the GitHub Pages origin and `localhost:8000` / `127.0.0.1:8000` |
| AbleSet OSC | `127.0.0.1:39051`; devices targeted by IP `127.0.0.1`, `::1`, `::ffff:127.0.0.1` |
| Export folder | `/Volumes/AARON SSD/TSP/TSP Exports` (default in the app; TSPWork's built-in fallback is `~/Music/TSP Exports`). One folder per song, e.g. `E5 Summer of 69/E5 - Mixdown.mp3` |
| Mac folders the device bridge has had | Remote Scripts, the project folder, TSP Band App, Music/TSP Exports, SSD `TSP Exports`, Ableton app bundle |
| Claude Project | claude.ai Project "TSP Band App"; project memory under `/projects/01a14ed8-…/` |

---

## 4. Standing rules (non-negotiable)

1. **Never write, save or modify the `.als`, and never save Aaron's Live set.** TSPWork restores every solo, mute, loop and selection it touches.
2. When Aaron asks to read his set or check anything about the project, **read the actual `.als`** at the path above (stage it into the workspace if the Mac VM runs out of memory parsing it).
3. **Warn Aaron about issues you notice** in the project (slivers, empty clips, missing markers, mismatches). Exception: `[Key:]` markers starting before a bar line are normal (singing starts early), so don't flag them.
4. **Only Aaron's MacBook triggers Ableton** (jumps, selections, transport, export). The bridge is localhost-only and admin-only.
5. **Secrets:** never put the `service_role` key, R2 keys or any token in public code, chat or Git. R2 keys live only in Edge Function secrets, entered by Aaron.
6. **Pushing to `main` deploys to the whole band.** Run the syntax check before pushing (section 12) and bump the `?v=` cache-buster in `index.html` on every frontend change (Safari caches hard).
7. **Spelling:** Ableton locators are ALL CAPS and app song names are Title Case; on word differences, Ableton wins.
8. **Keep RLS as the security boundary.** Members read; owners and admin write. New tables get RLS with "linked members read, admin write" unless there's a reason not to.
9. Keep the band's ownership model and readiness rule unless Aaron changes them.
10. Speak plainly to Aaron; he wants results, not effort reports. Ask before anything irreversible or expensive.

---

## 5. Database (Supabase)

### 5.1 Tables (public, all with RLS on)

| Table | Rows (2026-11-08) | Purpose |
|---|---|---|
| `members` | 7 | id, name, slug, instrument, is_admin, user_id (Auth link), must_change_password, sort_order |
| `member_emails` | 4 | admin-only email mapping for onboarding |
| `languages` / `song_languages` | 6 / 71 | language catalogue (E, H, K, T, Kn, Ml) and song links |
| `songs` | 62 | id (`E5`, `EM7`, …), name, type, is_medley, **keys text[]**, **key_segments jsonb**, tempo_start/end/change, **tempo_segments jsonb**, duration_seconds, backing_track_manual (`null`=Auto / `Sent to Mix` / `Mixed`), sort_order |
| `medley_parts` | 0 | medley constituents (no UI yet) |
| `task_types` | 23 | key, label, category (`ableset` `utility` `backing` `part`), owner_member_id, allowed_statuses, done_statuses, sort_order |
| `song_tasks` | 1426 | status per song × task (created by trigger for every song) |
| `task_status_log` | 513 | trigger-written history |
| `percussion_instruments` / `song_percussion` | 12 / 0 | Gautham's per-song instruments (no UI yet) |
| `setlists` / `setlist_items` | 2 / 44 | ordered songs (break/note item types exist but are unused) |
| `gigs` | 2 | name, event_date, start_time, location, notes, setlist_id, completed |
| `deadlines` | 0 | planned; no UI |
| `ableton_sync_runs` | 23 | log of each applied Ableton Sync (als path, mtime, size, applied items) |
| `ableton_sync_snoozes` | 22 | "Snooze" plus "Allow" (chord mismatches): song, task, clip fingerprint; admin only |
| `practice_tracks` | 10 | **legacy**: early manual-upload index. The bucket listing is now the truth; kept for history |
| `song_lyrics` | 62 | per song from the last Read set: `tracks` (+LYRICS lines `{t,e,text,c}`), `sections` (`{t,name,c}`), `tempo` (`[[sec,bpm]]`), `bars` (`[[sec,num,den]]`), `tone` (`{t,bar,n,v,d}`), duration_seconds, als_modified_at |
| `app_meta` | 1 | key/value; `practice_track_colors` (element → hex from the set) |
| `practice_audio_state` | 655 (all 62 songs) | per uploaded file (song × element): fingerprint of its Ableton tracks when exported; compared with app_meta `audio_fingerprints` (the set as last read) → yellow "changed since upload" in the export checklist |
| `practice_export_log` | 60 | one row per exported song: export_seconds, files, song_seconds, per-file seconds; feeds the export time-left estimate |

Song ID families now: E 15, EM 11, I 9, HM 9, H 7, EHM 5, K 3, KM 2, EHKM 1.

### 5.2 Views, functions, triggers
- **Views:** `song_readiness` (security invoker), `setlist_summary`, `setlist_member_progress`, `setlist_deadline_list`.
- **Functions:** `is_admin()`, `current_member_id()`, `owns_task()`, `complete_password_setup()`, `delete_song_and_shift_ids(p_song_id)` (admin; deletes a song and renumbers its family, cascading), `duplicate_setlist()`, `create_song_tasks`, `create_task_type_rows`, `flag_member_first_login`, `link_member_on_signup`, `song_tasks_before_update`, `touch_updated_at`.
- **Triggers:** `songs_create_tasks`, `task_types_create_rows`, `song_tasks_guard`, `songs_touch`, `setlists_touch`, `member_email_requires_password_change`.
- **Status enum `task_status`:** Incomplete, Completed, No, Corrections, Review, Draft, Recorded, Finished.

### 5.3 Task catalogue (23)

| Category | Key → label (owner) | Allowed statuses |
|---|---|---|
| ableset | `sections` Sections (Aaron), `lyrics` Lyrics (Aaron, can be No), `chords` Chords (Aaron), `guitar` Guitar Notes (Rowen), `keyboard` Keyboard Notes (Albert), `drums` Drum Notes (Nishanth) | Incomplete/Completed(/No) |
| utility | `guitar_tone_midi` Guitar Tone Midi (Rowen: Incomplete → **Finished** → Completed), `prompts` (Aaron), `song_cue` Song Cue (Dale: Incomplete → Recorded → Completed; Recorded hands it to Aaron), `backup_que` Backup Que (Aaron) | |
| backing | `backing_music`, `backing_percussion`, `backing_sfx` (Aaron), `backing_vocals_dale` (Dale), `backing_vocals_anston` (Anston) | full set |
| part | `bass_part` (Aaron), `keyboard_part` (Albert), `guitar_part` (Rowen), `violin_part` (Anston), `percussion_part` (Gautham), `drums_part` (Nishanth), `vox_dale` (Dale), `vox_anston` (Anston) | full set |

Done = `Completed`; `No` = not applicable; `Corrections` and `Recorded` are unfinished.

### 5.4 Readiness rule (live `song_readiness`)
`ready` = backing_track_manual is **Mixed** AND every backing task is Completed/No AND every AbleSet task is Completed/No. **Parts and utility tasks do not gate readiness.** Backing label: manual value, else Finished when all backing tasks are done, else Not Finished. The frontend shows a "Finished" badge only when the backing is Finished and all required work is done.

### 5.5 Migrations
`supabase/migrations/README.md` maps files to the live ledger. Since 2026-10-31 there is one file per ledger entry named `<live version>_<name>.sql`. To add a migration: `apply_migration`, then save the same SQL under the version `list_migrations` reports. Never replay `0001`–`0005` or `20261026130000_sync_song_metadata_from_ableton` against production.

### 5.6 JSON shapes
- `tempo_segments`: `[{bpm, transition_to_next: 'gradual'|'instant'|null, change_start_bar, change_end_bar, change_start_beat, change_end_beat}, …]` (bars and beats relative to the song start; bar 1 = first bar).
- `key_segments`: `[{key:'D', bar:1, beat:0, t:0.0}, {key:'F', bar:62, beat:244, t:106.09}, …]`. `keys` = the distinct keys in order.
- `song_lyrics.tracks[].lines[]`: `{t, e, text, c}` (seconds from song start; `c` = clip colour hex).

---

## 6. Frontend architecture

- **No build step.** `index.html` + `app.js` (~4.5k lines, ES module, imports supabase-js from esm.sh) + `styles.css`. All state lives in one big `state` object plus per-feature objects (`sync`, `exportJob`, `practice`, `tone`).
- **Cache-busting:** `index.html` loads `styles.css?v=…` and `app.js?v=…`. Bump both on every change.
- **Check before every push:** `cp app.js /tmp/a.mjs && node --check /tmp/a.mjs` (a stray `});` once took the whole app down at "Opening your workspace…").
- **Views (tabs):** Songs · Setlists · Gigs · Dashboard · Practice · Ableton Sync (admin only, a logo-only tab using `assets/ableton-sync-logo.png`, which Aaron uploaded himself). The avatar and name in the top bar are hidden. On phones the tabs scroll sideways.
- **Load on sign-in:** members (by `user_id`; selects `id,name,slug,instrument,is_admin,must_change_password`), songs (incl. `keys,key_segments,tempo_*`), song_tasks, task_types, languages, song_languages, setlists, setlist_items, gigs, readiness.
- **Browser storage keys:** `tsp-practice-lyrics-v2` (lyrics track and size), `tsp-practice-mix-v1` (session multitrack settings, sessionStorage), `tsp-practice-mode` (mix/multi, session), `tsp-practice-source`, `tsp-export-prefs-v1` (export folder, upload on/off), `tsp-tone-midi-v1` (MIDI port and channel), `tsp-offline-v1` (offline audio mode), `tsp-offline-manifest-v1` (saved audio versions), `tsp-data-cache-v1` (offline data). Cache Storage: `tsp-app-shell-v1`, `tsp-practice-audio-v1`, `tsp-offline-data-v1`; IndexedDB `tsp-offline` (folder handle).

### 6.1 Songs, Setlists, Gigs, Dashboard (core tracker)
- **Songs:** search and filters (language, single/medley, key), sorts, per-song progress (you vs band), expandable details (type, languages, duration, tempo with step/slope glyph and bar ranges, Scale(s), backing status, task dropdowns). Admin: Add song (M:SS duration, tempo chain editor, keys), Edit (one editor on Songs and Setlists), Delete song (renumbers the family via RPC).
- **Setlists:** read-only by default; admin "Edit setlist" stages adds, removes and drag-ordering until Save; delete setlist; running time.
- **Gigs:** list and editor; admin can mark past gigs complete; **Delete gig** (keeps its setlist).
- **Dashboard:** a tab per active gig plus Total Setlist; member picker; widgets for Playback / AbleSet / Backing / Other work; Parts shown as optional.
- **Member access (admin):** via the `member-access-admin` function: list members, create a login (temporary password), send a reset, set a temporary password. Public sign-ups are off.

### 6.2 Ableton Sync page (admin; works only on Aaron's Mac with Live open and TSPWork selected)
- **Status card:** TSPWork reachable? (tries `https://127.0.0.1:47711` then `http://127.0.0.1:47710`), version, `.als` path and mtime.
- **Read set** → `POST /snapshot`, which returns the alsreader snapshot (section 8). Then:
  - **Applied automatically:** duration, tempo (`tempo_segments` and summary columns) and keys (`keys` + `key_segments`, only when the set has `[Key:]` markers and they differ).
  - **Saved for Practice:** lyrics, sections, tempo map, bars and tone into `song_lyrics`; track colours into `app_meta`.
  - **Proposed task updates from clip evidence:** sections/chords/lyrics/guitar/keyboard/drums/prompts/song_cue/backup_que → Completed; guitar_tone_midi → Finished; Backing → Mixed when every non-"No" backing task has its stem in MIXED BACKING. Each card has **Complete**, **Snooze** ("ignore until that track's clips change": sha1 fingerprint per song+track; Guitar/Keyboard snoozes also wake when Chords changes) and a review click.
  - **Chord mismatches:** Chords track versus Guitar/Keyboard chord sequences (difflib), each stating the exact discrepancy. **Allow** = intended, permanent until the clips change; **Dismiss** = hide until the next read.
  - **Name changes:** proposed (Ableton spelling wins, kept in Title Case).
  - **Notices and warnings:** from alsreader (slivers, gaps, overlaps, orphan locators, key-marker mismatches between tracks, mid-bar time signatures, fractional BPM…).
  - **Practice audio length check:** audio length versus set length (lyrics are only timed when they agree within 1.5 s).
- **Review mode:** clicking a task calls `/select` with `review:true`:
  - Ableton zooms to the song and the playhead lands on the task's first clip.
  - Listening tasks solo their track (auto-undone when you move on).
  - Text tasks make AbleSet's floating window show that lyrics track (OSC).
  - A review bar appears with clip transport, loop, solo and Complete. Space plays/stops Ableton (not on the Practice page).
  - Backing tasks map to the BACKING TRACKS groups (Dale and Anston under BACKING VOCALS), "Mixed" to MIXED BACKING, parts to the PARTS tracks.
- **Practice audio export panel:**
  - Song checklist (columns, uploaded songs in green, **yellow = uploaded but its tracks changed in Ableton since** (tooltip lists which), "+ Changed" adds those, Select all, "+ Setlist…" adds a setlist's songs, Clear, "Uncheck uploaded" drops checked songs already in R2), export folder field, upload checkbox, Start/Cancel.
  - Progress bar weighted by song length and file count. Time left comes from past export timings in `practice_export_log` (seconds per file per second of song); until there is history it uses this run's own pace; "Uploaded N files (MB)" plus Cloudflare storage used out of 10 GB.
  - Start first reads the saved set (`/snapshot`) for the fingerprints to store with each uploaded song (so **save the set in Ableton before exporting**), then fetches 24 h presigned links via `practice-audio` `upload_batch`, then `POST /export {songs, export_root, uploads}`, then polls `/export/state`.

### 6.3 Practice page (all members)
- **Song source:** All songs (repertoire), upcoming gigs, setlists, grouped without duplicates. Song picker in database order (uploaded songs in green) with ‹ › buttons.
- **Mixdown** card (plain player).
- **Multitrack:**
  - Ableton-style rows (track number/on, S solo, fader with dB, meter, download link) in `PRACTICE_ORDER`.
  - Colours come from the set (`app_meta`); stems are off by default.
  - Settings persist for the session across songs.
  - **Solo overrides off.** Controls are **locked until every track has downloaded** ("Load multitrack (N MB)").
  - Web Audio: decodeAudioData, then per track BufferSource → Gain → Analyser.
- **Bottom transport (Ableton look, fixed):**
  - Mixdown/Multitrack switch (keeps the playhead; Multitrack shows a download icon and progress until loaded), prev song, back to start, play/pause, stop, next song, position, seek, length.
  - Song ID and title; chips for live **Key**, live **BPM** (from the tempo map) and **Ready / Not ready · N left**.
  - On phones: title and modes on row 1, buttons and times on row 2, the seek bar alone on row 3, chips on row 4. Safe-area padding keeps it off the iOS home bar.
- **Works offline:** `sw.js` service worker keeps the app shell (network-first for same-origin, cache-first for esm.sh) in `tsp-app-shell-v1`; the page also adds what it is running to that cache. Last loaded data (member, songs, tasks, setlists, readiness, practice colours, setlist song lists) is kept in localStorage `tsp-data-cache-v1`; lyrics per song in Cache Storage `tsp-offline-data-v1`. With no connection the app opens read-only from these, with an offline banner.
- **Offline audio** card (all members): **on by default** (browser storage); save practice audio on the device so it downloads once. Folder mode (Chrome/Edge desktop, File System Access; handle kept in IndexedDB, manifest `tsp-audio-manifest.json` in the folder) or browser mode (Cache Storage `tsp-practice-audio-v1`, works on iPhone; `navigator.storage.persist()`). Manifest (`tsp-offline-manifest-v1`) stores each file's version = bytes|upload time; newer uploads show an "Update" prompt for just those files. Songs are saved as they're played (a song whose multitrack is saved loads it automatically on open); "Save … Mixdowns / Everything" saves the current song list. With no connection the page plays saved audio.
- **Downloads:** every file, plus "Download all" (presigned links with `content-disposition`).
- **Lyrics (AbleSet look):**
  - Track chips: Chords, Guitar, Keyboard, Lyrics, Drums plus any other `+LYRICS` track. Text size S/M/L.
  - **Default track by member:** Rowen → Guitar, Albert → Keyboard, Nishanth → Drums, Dale and Anston → Lyrics, everyone else (Aaron, Gautham) → Chords. If that track is missing in a song, they see Chords. A chip someone taps sticks on their device.
  - **Rendering:**
    - A title box (song name in caps) and a plain "Key: X" line.
    - Section pills in the SECTIONS clip colour (slightly deepened), white text, always fully clear (never dimmed).
    - Every `[ ]` token is a chord-style dark rounded box above the words (dashes kept).
    - `\` is a line break; `(text)` without brackets stays plain in the clip colour.
    - Words are in the clip colour; the current line is bright and others are dimmed.
    - Count dots under a section heading while the track is silent for 3+ beats: one per beat up to 8 beats, otherwise up to 4 dots stepping through the bars. Empty space before the gap, visible during it, gone after.
    - A line is listed under the section holding most of its clip; `[>]` forces it under the later section, `[<]` under the earlier one (the tokens are hidden).
    - The current line grows (GPU transform scale 1.1×, no reflow; lines wrap at 90% width); lines ease back when they lose focus; sections never scale; autoscroll is an eased glide.
  - **Behaviour:**
    - Autoscroll keeps the current line about 35% down; it pauses for 4 s after a manual scroll.
    - Clicking a line or section seeks there.
    - A section is highlighted only when no line is live.
    - Lyrics are timed only when the audio and set lengths agree.
- **Guitar tones (MIDI)** card, at the very bottom, **only for Aaron and Rowen** (`TONE_MEMBERS`):
  - Web MIDI (Chrome/Edge only; Safari can't) sends the `song_lyrics.tone` notes (Note On/Off, channel 1 by default) at the right times, with a 20 ms lookahead and a 15 ms timer that keeps running in the background.
  - Chase: after any seek, jump or paused move, it sends the tone active at the new spot.
  - Only songs whose **Guitar Tone Midi task is Completed or Finished** send tones.
  - Includes a built-in setup guide: IAC Driver online → Live MIDI prefs Track on → a MIDI track from IAC to the processor → choose the port, Send current tone. A processor plugged in by USB can be picked directly.

---

## 7. TSPWork (Ableton remote script) — `tools/ableton-remote-script/TSPWork/`

- A `_Framework.ControlSurface` for **Live 12**, chosen as a Control Surface named "TSPWork" in Live's MIDI settings. It runs HTTP/HTTPS servers on a thread; Live API work is marshalled to the main thread with `schedule_message` ticks (`_run_on_main`).
- **Version 1.17.** `alsreader` and `exporter` are `importlib.reload`ed on every use, so updating those two files needs **no Live restart**. Changing `tspwork.py` needs TSPWork reselected in Live's Control Surface menu (None → TSPWork).
- **Deploy to the Mac:** copy files into a fresh `/mnt/user-data/outputs/deploy_vXXX/`, `device_commit_files` to `~/Music/Ableton/User Library/Remote Scripts/TSPWork/…` (force), then verify the md5 with `device_bash` (`$HOME/mnt/Remote Scripts/TSPWork`). Don't swap the exporter mid-export: check `ls -t` of the export folder or `/export/state` first.
- **Endpoints** (POST JSON, CORS-restricted):

| Path | What it does |
|---|---|
| `/status` | version, als path, busy/export state (short answer while exporting) |
| `/jump {song_id}` | jump to the song's locator like a locator click |
| `/select {song_id, task_key, from_beat?, to_beat?, review?}` | zoom to the song (or a bar range) and, in review mode, playhead to first clip, solo listening tasks (`LISTEN_TASKS`, `EXTRA_SOLO` Drums Midi Part), AbleSet floating window to `LYRICS_SLUG` via OSC |
| `/transport {action}` | play/stop/state, review-bar actions (prev/next clip, loop, solo, unsolo) |
| `/snapshot` | read the saved `.als` with alsreader and return the snapshot |
| `/export {songs, export_root, uploads}` · `/export/state` · `/export/cancel` (`{after_song:true}` = stop after the current song, `{after_song:true, undo:true}` = keep going; empty body = cancel now) | the practice-audio export job (body limit 4 MB; `export_root`'s parent must exist) |

- `requests.log` is a small rolling request log for troubleshooting. `disconnect()` restores the export state if TSPWork is reloaded mid-export.

### 7.1 Exporter (overnight practice audio)
- Drives **Live's own File › Export Audio/Video** with AppleScript (System Events; the dialog is accessibility-readable):
  - Rendered Track must be **Main**; MP3 on, PCM off (Aaron set this once).
  - Render range = set the loop to the song, then Edit › Select Loop.
  - Export is clicked using `ignoring application responses`. In the Save panel: cmd-shift-G types the folder, then the file name, then Return.
  - A folder watcher accepts any new file and renames it, because typed names can lose characters.
- **Zooms to each song** (brings it to the front) before exporting.
- **Per song, each element is a separate MP3:**
  - **Stems:** STEMS › BASS/DRUMS/OTHER/VOCALS, whenever they have content.
  - **Parts:** LIVE CHANNELS › `<X> Live`, with the PARTS track on. Drums also solos **Drums Midi Part**.
  - **Backing:** one combined file. For MUSIC / BACKING VOCALS / PERCUSSION / SFX it uses the MIXED BACKING track if it has clips in the song, else that BACKING TRACKS group.
  - **CPC:** the CPC group with **Backup Que off**.
  - **Mixdown:** Parts + Backing + CPC, with stems filling only where a part is missing (DRUMS, OTHER if no guitar and no keyboard, BASS, VOCALS unless every vocal part is Completed). **Instrumental `I` songs get no vocals.**
- **Skipped:**
  - Tracks whose clips are all deactivated or slivers (< 0.25 beat).
  - Parts with **< 4 bars (16 beats)** of active audio, which count as stray: no part file, and the stem fills the mixdown instead.
- **Upload worker** (in parallel with the next render):
  - `afconvert` to **AAC 128 kbps `.m4a`**, then `curl` PUT to the presigned link, then DELETE of any old `.mp3`. Stale elements are deleted.
  - Temp files go in `/tmp/tspwork-upload`, and `caffeinate -d -i -s -w <pid>` keeps the Mac and its display awake (a locked screen can block UI scripting).
- Every solo, on/off state, the loop, the selection and the playhead are restored; the set is never saved.

---

## 8. alsreader (reads the saved `.als`)

- It stream-parses the gzip XML into tracks (name, group, colour, arrangement clips with name, start/end, disabled, notes and short-clip MIDI notes following loop and start marker), locators, tempo automation and time-signature automation.
- **Track map (`TRACKS`):**

| Key | Group / track prefix |
|---|---|
| `song_id` | SONG DETAILS / SONG ID |
| `sections` | ABLESET / SECTIONS |
| `chords` | ABLESET / Chords |
| `lyrics` | ABLESET / Lyrics |
| `guitar` | ABLESET / Guitar + |
| `keyboard` | ABLESET / Keyboard + |
| `drums` | ABLESET / Drums + |
| `tone` | ABLESET / GUITAR TONE |
| `prompts` | CPC / PROMPTS |
| `song_cue` | CPC / Vocal Prompts |
| `backup_que` | CPC / Backup Que |
| `mx_bgv`, `mx_music`, `mx_perc`, `mx_sfx` | MIXED BACKING / BACKING VOCALS, MUSIC, PERCUSSION, SFX |

  Every track whose name contains `+LYRICS` is a lyrics track (label = name before ` +`).
- **Song regions** come from the SONG ID clips (`^[A-Z][A-Za-z]*\d+$`), cross-checked with the locators. Warnings: disabled, stray, tiny, duplicate, overlap, gap (a gap is OK if a "prelude" locator sits in it), orphan locators, missing locator.
- **Per song, the snapshot contains:**
  - `locator`, `start_beat`, `end_beat`, `start_bar`, `duration_seconds` (integrated through the tempo map).
  - `tempo_segments` and summary, `start_key`, **`key_segments`** (`[Key:]` clips on the Chords track, consecutive repeats dropped, bar numbers from the song start).
  - `evidence` (booleans per task); `fingerprints` (sha1 of each track's clips in the song, used by Snooze); `chord_mismatches`.
  - `audio_fp`: per practice element (Stems, Parts, Backing, CPC, Mixdown) a 12-char hash of the source tracks' clips in the song (sound-relevant clip XML: loop, sample, warp, gain, fades, envelopes, notes; plus position) and mixer volume/pan. Lyrics/SECTIONS/SONG ID/GUITAR TONE clips are not sound-hashed (speed).
  - `lyrics` = `{tracks, sections, tempo}`; `bars` (`[sec, num, den]` per bar; a new bar starts at each time-signature change, as in Ableton); `tone` (GUITAR TONE notes with seconds, bar, note, velocity, duration).
- **Set-wide output:** `track_colors` (Live 70-colour palette index → hex for the practice elements), `warnings`, `als_modified_at`, `als_size`.
- **Key cross-check:** Guitar/Keyboard/Lyrics `[Key:]` markers must match the Chords track (warning `key_mismatch`); a first marker not at bar 1 is warned (`key_late`).
- Parsing the full set takes about 16 s in the cloud workspace; the Mac's Linux VM can run out of memory, so stage the file instead.

---

## 9. Practice audio pipeline and storage

1. Aaron runs **Export** from Ableton Sync (overnight is fine; he must not touch Ableton, but other apps and desktops are OK).
2. TSPWork renders the MP3s into the SSD folder and uploads AAC copies to R2 while the next song renders.
3. `practice-audio` Edge Function (requires sign-in; JWT verified):
   - `list` → songs × elements present (deduplicated, `.m4a` preferred), `total_bytes`, `objects`.
   - `urls {song_id}` → presigned GET (3 h) and a download link per element.
   - `upload {song_id, element, bytes}` (admin) → presigned PUT for a manual `.mp3` upload (deletes any `.m4a` copy).
   - `upload_batch {song_ids}` (admin) → 24 h PUT/DEL/DEL_OLD links per element for TSPWork.
   - Elements: Mixdown, Backing, CPC, Part - Bass/Keyboard/Guitar/Violin/Percussion/Drums/Dale Vox/Anston Vox, Stem - Bass/Drums/Other/Vocals; slug = lower-case dashed.
4. **No duplicates:** a fixed key per song × element, new uploads overwrite, `.mp3` is deleted when the `.m4a` lands, and stale elements are removed.
5. **Storage maths** (measured E4–E7: about 30 MB per minute of song at 320 kbps MP3, 9–14 files per song): the whole repertoire (about 275 min) is ~8.3 GB as MP3, which is too tight for the 10 GB free tier, versus **~3.3 GB as AAC 128**. The app shows current usage.

---

## 10. Ableton project conventions (Aaron's set)

- **Top-level groups and meaning:**
  - **SONG DETAILS** (SONG ID clip per song).
  - **ABLESET** (SECTIONS, Chords, Lyrics, Guitar +, Keyboard +, Drums +, Percussion (Gautham's rough marking, never synced), GUITAR TONE Midi).
  - **CPC** (clicks, PROMPTS, Vocal Prompts = song cue by Dale, Backup Que).
  - **STEMS** (TRACK source + BASS/DRUMS/OTHER/VOCALS reference stems, never in the backing).
  - **INPUTS**; **LIVE CHANNELS** (`<X> Live`, the live sound per instrument); **PARTS** (recorded reference parts feeding the Live channels; Drums Midi Part → Drums Part → DRUMS Live).
  - **BACKING TRACKS** (MUSIC, BACKING VOCALS › Dale/Anston, PERCUSSION, SFX: production); **MIXED BACKING** (returned mixes: MUSIC, BACKING VOCALS, PERCUSSION, SFX).
  - **Master.**
- **Locators** are ALL CAPS song names at each song start; "KESARIYA / ILLAHI Prelude" locators are walk-on build-ups and are ignored.
- **Lyrics clip syntax (AbleSet):** clip name = the line. `[Key:] [E]` sets the key; `[C#m]word` puts a chord over a word; `[E..-G#m-B]` is a chord run; `[(EP)]`, `[(stop)]`, `[Riff:]` are instructions shown like chords; `\` is a line break; plain `(9 FRET 5 -7)` is a note in the clip colour. Clip colour = text colour in AbleSet and in the app.
- **SECTIONS** clips carry the section names and colours (Start Prompt, Intro, Verse, Pre Chorus, Chorus, Bridge, Outro, Ending…).
- **GUITAR TONE Midi:** one MIDI note per clip at the start of a section that needs a new tone (notes 51–70, mostly 64–68, velocity 100, a quarter beat long). Live sends them to "Network (Aarons Guitar Midi)" Ch.1.
- **Track colours** use Live's 70-colour palette index (`<Color Value=…/>`).

---

## 11. Common runbooks

- **Change the frontend:** edit `app.js`/`styles.css`/`index.html` → `node --check` the module copy → bump `?v=` in `index.html` → commit (end with the Co-Authored-By/Claude-Session lines when given) → `git push origin HEAD:main` → wait for Pages (poll `index.html` for the new `?v`) → verify in the built-in browser (Aaron's session is signed in there).
- **Change the database:** inspect live first → `apply_migration` → save the file under the live version → update this plan.
- **Change an Edge Function:** edit `supabase/functions/<name>/index.ts` → `deploy_edge_function` → commit.
- **Update TSPWork:** edit the repo copy → `python3 -m py_compile` → test alsreader against a staged `.als` (`python3 -c "import alsreader; alsreader.build_snapshot(path)"`) → deploy to the Mac and check md5 → for `tspwork.py`, ask Aaron to reselect TSPWork in Live.
- **Read the `.als` yourself:** `device_stage_files` the set (check `mtimeMs` first) → parse with alsreader in the workspace (`python3 -I`, cwd outside the uploads folder).
- **Data refresh after changing alsreader:** Aaron clicks **Read set** once (this saves lyrics, tone, bars, colours and keys).
- **Add a member login:** Member access (admin) → Create login → share the temporary password; they must change it on first sign-in.

---

## 12. Quality bar and testing habits

- Syntax-check every JS change; `py_compile` every Python change.
- Render UI changes headless (Playwright in the workspace) at 360/390 px and 1280+ px, and check the live site after deploys.
- For lyrics work, render the real `song_lyrics` shape (`/tmp/lytest.html` harness: extract the lyrics section of `app.js`, stub `state/practice/$`).
- Never test exports or review mode while Aaron is mid-export or performing.

---

## 13. Roadmap and open items

**Built (Oct–Nov 2026):** core tracker; member logins; gigs/setlists/dashboard; Ableton Sync with auto-metadata, evidence, snooze, chord mismatches and review mode; overnight practice export to R2 (all 62 songs uploaded 2026-11-08, 3.14 GB; timing log, stop-after-song, auto-retry, freshness fingerprints); Practice page with multitrack, transport, AbleSet lyrics, live key/BPM, guitar-tone MIDI, offline audio and a fully offline (read-only) app.

**Next / ideas (not started unless Aaron asks):**
- App setlist → AbleSet setlist (planned third step of the Ableton integration).
- Medley constituents UI (`medley_parts`), deadlines UI (`deadlines`), percussion picks UI (`song_percussion`).
- Link Gautham's login.
- Gamification (points, streaks, badges, leaderboards), deliberately after the core.
- Google Drive delivery (deferred; R2 replaced it for practice audio).
- Clean up the legacy `practice_tracks` table once nothing reads it.

---

## 14. Decision log (newest first)

- **2026-11-08**
  - Lyrics: line goes under the section holding most of its clip; `[>]`/`[<]` force; dots only during 3+ beat gaps; current line grows smoothly; sections always clear.
  - Offline: audio saved on the device by default; the whole app works offline read-only (for the keyboardist on a cruise ship).
  - Exports: fingerprints mark changed songs yellow; stop-after-song; auto-retries; display kept awake overnight.
- **2026-11-07**
  - Lyrics follow AbleSet's look exactly (from Aaron's screen recording).
  - Guitar tones are only for songs whose Guitar Tone MIDI task is Completed/Finished, and the card is shown only to Aaron and Rowen, at the bottom of Practice.
  - Lyric defaults: Gautham → Chords (for now).
  - Bar counter and "your work" chip removed from the transport; Key/BPM/Ready shown on every screen size; prev/next song buttons kept in the transport.
  - The `.als` feeds keys (with bars) and tempo. Songs without `[Key:]` markers are left unchanged. Off-bar key markers are normal.
  - Uploads are AAC 128 to stay inside 10 GB; no duplicate files ever; new files replace old ones.
  - Practice: solo plays a muted track; multitrack controls locked until loaded; colours from the set; stems off by default; settings persist per session; Mixdown↔Multitrack keeps the playhead.
  - Export: SSD folder; upload during the next render; zoom to each song first; stray part < 4 bars; skip deactivated or sliver-only tracks; stems exported whenever they have content; Drums Midi Part soloed with drums; no vocals for instrumentals.
- **2026-11-06**
  - Snooze ("ignore until the track changes"); chord mismatches with Allow (permanent) and Dismiss (until the next read); duration and tempo auto-applied.
  - Review mode (playhead, solo with auto-undo, AbleSet floating window by IP; backing → BACKING TRACKS groups, parts → PARTS); Sync tab shows only the Ableton logo.
- **2026-11 (early)**
  - Ableton integration order: sync checker → one-click update → setlist to AbleSet.
  - Locators CAPS, app Title Case, Ableton wins.
  - AbleSet/prompts/cue/backup tasks completed from clip evidence; Mixed only when every non-"No" backing task has its MIXED BACKING stem.
  - Percussion lyrics track never synced; preludes ignored. Only Aaron's MacBook drives Ableton.
- **2026-10**
  - Parts don't gate readiness; Ready = backing Mixed + backing tasks + AbleSet tasks done.
  - 18 → 23 task types (AbleSet split, instrument notes, cues).
  - Separate Supabase project; Supabase + GitHub only.
  - Song ID scheme and language codes (E, H, K, T, Kn, Ml; `I` and `M` reserved).
  - Medleys are one row plus constituents.
  - Only Aaron edits setlists and gigs.

---

## 15. Known issues, caveats, warnings

- **Read set needed:** after any alsreader change, nothing new (colours, tone, bars, keys) reaches the app until Aaron clicks **Read set**.
- **Song-ID renumbering orphans R2 audio:** deleting a song shifts IDs in its family, but R2 files stay under the old IDs. Re-export the affected songs and delete the stale keys.
- **Web MIDI** works only in Chrome/Edge. Rowen must use one of them.
- **Safari caching:** if a deploy "doesn't show", bump `?v` or have Aaron reload twice.
- **Live dialogs:** the exporter depends on Live's Export dialog layout (Live 12). A Live update can break it; symptoms are `no_export_dialog` or a stuck file wait. Use Cancel, then check `requests.log`.
- **Ableton project issues seen on 2026-11-07:**
  - Slivers: Chords and Guitar at bar 7264, PROMPTS ×20, Vocal Prompts bar 2987, Backup Que ×11.
  - Six empty GUITAR TONE clips: E4 b1793, E6 b2136, H2 b5516/5528, H4 "BADTAMEEZ DIL" b5835, HM2 b6275.
  - EM5's Lyrics track is missing the Am marker at bar 48.
  - I2, E12–E15 and EM10 have no chord charts yet.
- **Not built:** medley parts, deadlines, percussion picks UI, gamification; Gautham has no login.

---

## 16. Other documents (status)

| File | Status |
|---|---|
| `APP_PLAN.md` (this) | **Current master** |
| `README.md` | Entry point; points here |
| `CLAUDE.md` | Short pointer for AI sessions |
| `supabase/migrations/README.md` | Migration ↔ ledger map (current) |
| `docs/SYSTEM_MAP.md`, `docs/CURRENT_STATE.md`, `docs/APP_GUIDE.md`, `TSP Band App Summary.md`, `PLAN.md`, `SETUP_SUPABASE.md`, `docs/ABLETON_METADATA_SYNC.md` | **Historical (Oct 2026).** Useful background on the sheet migration, early schema and screens; their "planned exporter / not implemented" notes are out of date |

---

## 17. Changelog of this plan
- **2026-11-08:** Update App Plan run; full app test pass started (report in the claude.ai Project).
- **2026-11-08:** The app works offline (service worker + saved data/lyrics), read-only.
- **2026-11-08:** Offline audio for practice (folder or in-browser), with update prompts for newer uploads.
- **2026-11-08:** Lyrics: section placement by majority/`[>]`/`[<]`, dots only during 3+ beat gaps, growing current line, eased scrolling.
- **2026-11-08:** Overnight hardening: caffeinate `-d -i -s` (display kept on so a locked screen can't block UI scripting); failed songs get one last try at the end of the run.
- **2026-11-08:** Practice audio freshness: each upload remembers its tracks' fingerprints; a later Read set that differs turns the song yellow in the export checklist until it's re-exported. Songs uploaded before this got the first read after the change as their baseline.
- **2026-11-08:** Exporter recovers when Live stops answering after a long render (EM6 failed this way): waits for Live, retries the Export dialog up to 3 times (150 s each, skipping the retry if the file appeared anyway), and retries a failed song once from scratch; a file must be stable for 4 s.
- **2026-11-07 (late):** TSPWork 1.17: **Stop after this song** (the remaining songs are marked `stopped`, not errors); the export checklist keeps its scroll position.
- **2026-11-07 (late):** Export timing: the exporter reports per-song and per-file seconds, the app logs them to `practice_export_log`, and the time-left estimate uses them.
- **2026-11-07:** Created. Consolidated everything since the start: the tracker, Ableton Sync, TSPWork 1.16, the overnight export, the Practice page, AbleSet lyrics and guitar tones. The repo was synced with the live Supabase ledger (10 migration files renamed to their live versions; 3 missing migrations added; migrations README). Edge Functions and Mac scripts were verified identical to the repo.
