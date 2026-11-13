# TSP Work — App Plan (master document)

_Last reconciled: **2026-11-13** · Frontend cache markers: `app.js?v=20261113-head3`, `styles.css?v=20261113-head3` · TSPWork Remote Script **1.32** (repository and installed, SHA-256 `8270f1b4…`; Live loads it only after a reselect) · Supabase live ledger: **42 migrations**, latest `20261112173013_guest_ashwin_spelling` · Edge Functions `practice-audio` v7 and `member-access-admin` v8 (unchanged, deployed source still matches the repo) · Tests: **136** Node, **44** Python · Operations and backups: [docs/OPERATIONS.md](docs/OPERATIONS.md)._

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

**Guests** (`members.role = 'guest'`, since 2026-11-09): non-band people who only get the **Practice** page. Currently **Kenneth Shalom** (`kenneth`, linked) and **Ashwin** (`ashwin`, added 2026-11-12; its login is created by Aaron from Member access, which is also where the sign-in email is entered — a guest's email is never put in this public repository). Guests own no tasks, are left out of band member lists (dashboard picker, owners), and the app hides every tab except Practice (`body.guest-mode`, `isGuest()`; `setView` forces `practice`). Database reads are the same as members' (RLS is `current_member_id() is not null`), so the restriction is in the app; they cannot write anything (no tasks, not admin). Their activity is logged like members'.

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
| Edge Functions | `member-access-admin` (v8, `list_members` returns `role`; service role in secrets; a temporary password also confirms the email) · `practice-audio` (v7, R2 secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, entered by Aaron himself) |
| Cloudflare R2 | bucket **`tsp-practice`**, keys `songs/<SONG ID>/<element-slug>.m4a` (or older `.mp3`). CORS allows GET/PUT/HEAD from `https://aaronmark2222.github.io`. Free tier 10 GB. |
| Ableton set | `/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als` (about 18 MB gzip XML). TSPWork edits lyric MIDI clip names in Live's open memory only; Aaron saves manually. The reader parses the saved `.als`.  Optional override in `~/.tspwork.json` `{"als_path": ...}` is ignored by the write guard. |
| TSPWork remote script | `~/Music/Ableton/User Library/Remote Scripts/TSPWork/` (`__init__.py`, `tspwork.py`, `alsreader.py`, `exporter.py`, `tspwork-localhost.crt/.key`, `requests.log`). Repo copy: `tools/ableton-remote-script/TSPWork/` (cert and key are git-ignored and must never be committed) |
| TSPWork ports | HTTP `127.0.0.1:47710`, HTTPS `127.0.0.1:47711` (self-signed cert, trusted on Aaron's Mac with `security add-trusted-cert`). Allowed origins: the GitHub Pages origin and `localhost:8000` / `127.0.0.1:8000` |
| AbleSet OSC | `127.0.0.1:39051`; devices targeted by IP `127.0.0.1`, `::1`, `::ffff:127.0.0.1` |
| Export folder | `/Volumes/AARON SSD/TSP/TSP Exports` (default in the app; TSPWork's built-in fallback is `~/Music/TSP Exports`). One folder per song, e.g. `E5 Summer of 69/E5 - Mixdown.mp3` |
| Mac folders the device bridge has had | Remote Scripts, the project folder, TSP Band App, Music/TSP Exports, SSD `TSP Exports`, Ableton app bundle |
| Claude Project | claude.ai Project "TSP Band App"; project memory under `/projects/01a14ed8-…/` |

---

## 4. Standing rules (non-negotiable)

1. **Only the guarded lyric workflow may modify the `.als`.** TSPWork must verify the exact master project is open and preflight lyric clips before changing Live's in-memory session. Never trigger Live's Save command. Aaron saves manually; read the saved set back and preserve the shared edit if readback fails. Do not modify any other set content.
2. When Aaron asks to read his set or check anything about the project, **read the actual `.als`** at the path above (stage it into the workspace if the Mac VM runs out of memory parsing it).
3. **Warn Aaron about issues you notice** in the project (slivers, empty clips, missing markers, mismatches). Exception: `[Key:]` markers starting before a bar line are normal (singing starts early), so don't flag them.
4. **Only Aaron's MacBook controls Ableton** (jumps, selections, transport, export and lyric writeback). The bridge is localhost-only and admin-only. Other signed-in devices share lyric edits through Supabase; the Mac app relays them to the open master set. An admin-written, short-lived `app_meta` heartbeat drives shared Ableton availability. The **Save** label appears only on the Mac app when its local bridge confirms that the allowlisted project is open; remote devices never show that local manual-save state. No device connects to the bridge over Wi-Fi.
5. **Secrets:** never put the `service_role` key, R2 keys or any token in public code, chat or Git. R2 keys live only in Edge Function secrets, entered by Aaron.
6. **Pushing to `main` deploys to the whole band.** Run the syntax check before pushing (section 12) and bump the `?v=` cache-buster in `index.html` on every frontend change (Safari caches hard).
7. **Spelling:** Ableton locators are ALL CAPS and app song names are Title Case; on word differences, Ableton wins.
8. **Keep RLS as the security boundary.** Members read; owners and admin write. New tables get RLS with "linked members read, admin write" unless there's a reason not to.
9. Keep the band's ownership model and readiness rule unless Aaron changes them.
10. Speak plainly to Aaron; he wants results, not effort reports. Ask before anything irreversible or expensive.

---

## 5. Database (Supabase)

### 5.1 Tables (public, all with RLS on)

| Table | Rows (verified 2026-11-11) | Purpose |
|---|---|---|
| `members` | 9 (7 band + 2 guests) | id, name, slug, instrument, is_admin, user_id (Auth link), must_change_password, sort_order, **role** (`member` / `guest`) |
| `member_emails` | 5 | admin-only email mapping for onboarding |
| `languages` / `song_languages` | 6 / 71 | language catalogue (E, H, K, T, Kn, Ml) and song links |
| `songs` | 62 | id (`E5`, `EM7`, …), name, type, is_medley, **keys text[]**, **key_segments jsonb**, tempo_start/end/change, **tempo_segments jsonb**, duration_seconds, backing_track_manual (`null`=Auto / `Sent to Mix` / `Mixed`), sort_order |
| `medley_parts` | 0 | medley constituents (no UI yet) |
| `task_types` | 23 | key, label, category (`ableset` `utility` `backing` `part`), owner_member_id, allowed_statuses, done_statuses, sort_order |
| `song_tasks` | 1426 | status per song × task (created by trigger for every song) |
| `task_status_log` | 518 | trigger-written history |
| `percussion_instruments` / `song_percussion` | 12 / 0 | Gautham's per-song instruments (no UI yet) |
| `setlists` / `setlist_items` | 3 / 70 | ordered songs (break/note item types exist but are unused) |
| `gigs` | 3 | name, event_date, start_time, location, notes, setlist_id, completed |
| `deadlines` | 0 | planned; no UI |
| `ableton_sync_runs` | 24 | log of each applied Ableton Sync (als path, mtime, size, applied items) |
| `ableton_sync_snoozes` | 22 | "Snooze" plus "Allow" (chord mismatches): song, task, clip fingerprint; admin only |
| `practice_tracks` | 10 | **legacy**: early manual-upload index. The bucket listing is now the truth; kept for history |
| `song_lyrics` | 62 | per song from the last Read set: `tracks` (+LYRICS lines `{t,e,text,c}`), `sections` (`{t,name,c}`), `tempo` (`[[sec,bpm]]`), `bars` (`[[sec,num,den]]`), `tone` (`{t,bar,n,v,d}`), duration_seconds, als_modified_at |
| `app_meta` | 4 | key/value; `practice_track_colors` (element → hex from the set), `audio_fingerprints`, and short-lived Ableton presence |
| `practice_audio_state` | 655 | per uploaded file fingerprint; compared with the latest Ableton read → yellow "changed since upload" |
| `practice_audio_state_backup_20261109` | 655 | dated backup; not the canonical state table |
| `song_lyrics_edits` | 0 | shared musician/admin lyric overrides by song and track |
| `practice_export_log` | 71 | one row per exported song: export_seconds, files, song_seconds, per-file seconds; feeds the export time-left estimate |
| `app_sessions` | 308 | one row per app session per member: started_at, last_seen_at (heartbeat every 30 s while visible; >5 min away = new session), device phone/computer, standalone, app_version |
| `page_visits` | 832 | session_id, member, view (songs/setlists/gigs/dashboard/practice/sync), started_at, ended_at |
| `practice_plays` | 84 | one row per song played on Practice (kept across pauses <5 min; ends on song/mode change or leaving Practice): song_id (text), mode mix/multi, seconds_played (real playing time), start/end position, song_seconds, reached_end, fullscreen, solo (multitrack on/solo/off snapshot) |

Song ID families now: E 15, EM 11, I 9, HM 9, H 7, EHM 5, K 3, KM 2, EHKM 1.

### 5.2 Views, functions, triggers
- **Views:** `member_activity_daily` (minutes online per member per day, IST), `member_practice_by_song` (plays ≥30 s, minutes, played-to-end, last played), `song_readiness` (security invoker), `setlist_summary`, `setlist_member_progress`, `setlist_deadline_list`.
- **Functions:** `save_setlist(p_setlist_id, p_name, p_items)` (admin; saves a setlist's name and whole running order in one transaction), `is_admin()`, `current_member_id()`, `owns_task()`, `complete_password_setup()`, `delete_song_and_shift_ids(p_song_id)` (admin; deletes a song and renumbers its family, cascading), `duplicate_setlist()`, `create_song_tasks`, `create_task_type_rows`, `flag_member_first_login`, `link_member_on_signup`, `song_tasks_before_update`, `touch_updated_at`.
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
The live ledger currently has **32 applied entries** through `20261110191303_admin_edit_all_lyrics_tracks`. `supabase/migrations/` contains the repository history (38 SQL files, including bootstrap/legacy files); those files do not all map one-to-one to live ledger entries. `supabase/migrations/README.md` explains the mapping. Before schema work, compare the live ledger, repository files, and live schema. Apply only a new forward migration and save its exact SQL under the version reported by Supabase. Never replay bootstrap or historical import files against production.

### 5.6 JSON shapes
- `tempo_segments`: `[{bpm, transition_to_next: 'gradual'|'instant'|null, change_start_bar, change_end_bar, change_start_beat, change_end_beat}, …]` (bars and beats relative to the song start; bar 1 = first bar).
- `key_segments`: `[{key:'D', bar:1, beat:0, t:0.0}, {key:'F', bar:62, beat:244, t:106.09}, …]`. `keys` = the distinct keys in order.
- `song_lyrics.tracks[].lines[]`: `{t, e, text, c}` (seconds from song start; `c` = clip colour hex).

---

## 6. Frontend architecture

- **No build step.** `index.html` + `app.js` (~7k lines, ES module, imports supabase-js from esm.sh) + `styles.css`. All state lives in one big `state` object plus per-feature objects (`sync`, `exportJob`, `practice`, `tone`).
- **Cache-busting:** `index.html` loads `styles.css?v=…` and `app.js?v=…`. Bump both on every change.
- **Look: Liquid Glass theme** (end of `styles.css`): softly lit dark backdrop (`body::after` colour glows), translucent panels with light edges, pill buttons (orange-tinted when selected), real blur only on the floating bars (top bar, pinned on computers; transport; review bar; dialogs). Avoid nesting `backdrop-filter` (iOS draws it black).
- **Check before every push:** `cp app.js /tmp/a.mjs && node --check /tmp/a.mjs` (a stray `});` once took the whole app down at "Opening your workspace…").
- **Views (tabs):** Songs · Setlists · Gigs · Dashboard · Practice · Ableton Sync (admin only, a logo-only tab using `assets/ableton-sync-logo.png`, which Aaron uploaded himself). The avatar and name in the top bar are hidden. On phones the tabs scroll sideways.
- **Load on sign-in:** members (by `user_id`; selects `id,name,slug,instrument,is_admin,must_change_password`), songs (incl. `keys,key_segments,tempo_*`), song_tasks, task_types, languages, song_languages, setlists, setlist_items, gigs, readiness.
- **Browser storage keys:** `tsp-practice-lyrics-v2` (lyrics track and size), `tsp-practice-mix-v1` (session multitrack settings, sessionStorage), `tsp-practice-mode` (mix/multi, session), `tsp-practice-source`, `tsp-practice-song` (last song opened), `tsp-export-prefs-v1` (export folder, upload on/off), `tsp-tone-midi-v1` (MIDI port and channel), `tsp-offline-v1` (offline audio mode), `tsp-offline-manifest-v1` (saved audio versions), `tsp-data-cache-v1` (offline data). Cache Storage: `tsp-app-shell-v1`, `tsp-practice-audio-v1`, `tsp-offline-data-v1`; IndexedDB `tsp-offline` (folder handle).

### 6.1 Songs, Setlists, Gigs, Dashboard (core tracker)
- **Songs:** search and filters (language, single/medley, key), sorts, per-song progress (you vs band), expandable details (type, languages, duration, tempo with step/slope glyph and bar ranges, Scale(s), backing status, task dropdowns). Admin: Add song (M:SS duration, tempo chain editor, keys), Edit (one editor on Songs and Setlists), Delete song (renumbers the family via RPC).
- **Setlists:** opens on the next gig's setlist; read-only by default; admin "Edit setlist" stages adds, removes and drag-ordering until Save (kept across tab switches; saved in one call via `save_setlist`); new setlists can start as a copy of another; delete setlist; running time.
- **Gigs:** list and editor; admin can mark past gigs complete; **Delete gig** (keeps its setlist).
- **Dashboard:** a tab per active gig plus Total Setlist; member picker; widgets for Playback / AbleSet / Backing / Other work; Parts shown as optional.
- **Member access (admin):** via the `member-access-admin` function (guests are labelled "Guest: Practice only"): list members, create a login (temporary password), send a reset, set a temporary password. Public sign-ups are off.

### 6.2 Ableton Sync page (admin; works only on Aaron's Mac with Live open and TSPWork selected)
- **Status card:** TSPWork reachable? (tries `https://127.0.0.1:47711` then `http://127.0.0.1:47710`), version, `.als` path and mtime.
- **Read set** → `POST /snapshot`, which returns the alsreader snapshot (section 8; ~20 s). While it runs, the button and a panel show the stage and percentage (TSPWork 1.27 `/status` `reading_progress`; timed fallback from `localStorage tsp-read-seconds`) and a checklist of the saving steps; reads started in another window show too. The status line says whether the last read is up to date with the saved set. Mixdown length checks run afterwards in the background. Then:
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
  - Start does **not** read the set: the fingerprints stored with each uploaded song come from the latest read (this window, or `app_meta.audio_fingerprints`), so **read the set once after editing, then export**. It fetches 24 h presigned links via `practice-audio` `upload_batch`, then `POST /export {songs, export_root, uploads}` (waiting up to 15 min if TSPWork is busy), then polls `/export/state`. When the run ends, songs that exported fine are unchecked.

### 6.3 Practice page (all members)
- **Layout:** the page holds the title, the song-list picker, the lyrics and (below) Offline audio and Download; everything to do with playing is in the bar at the bottom. On computers the lyrics column runs from the top of the page beside the title (`.practice-layout` grid areas hero/pick/main + side); on phones: title, picker, lyrics, the rest.
- **Song source:** one picker: All songs (repertoire), upcoming gigs, setlists, grouped without duplicates. The song itself is chosen in the transport (its title opens the list; prev/next step through it). `#practice-song-note` beside the picker carries the song's status ("No practice audio … yet", mixdown loading or errors).
- **Mixdown:** no card; the `<audio>` element lives hidden in `#practice-audio-host` and is driven by the transport.
- **Multitrack:**
  - Ableton-style rows (track number/on, S solo, fader with dB, meter, download link) in `PRACTICE_ORDER`.
  - Colours come from the set (`app_meta`); stems are off by default.
  - Settings persist for the session across songs.
  - **No card on the page:** the rows are the **mixer drop-up** from the Multitrack button in the transport (`ptMixer*`), on every screen size and in full-screen lyrics alike. `ptMixerOpen` must not require full screen (it did until 2026-11-12, which left the button dead on the page); `ptMixerPlace` measures against the lyrics header in full screen and the window on the page; a click outside closes it. Where a click landed is read in the **capture** phase (`ptClickAt`): a click on a row redraws the mixer and detaches the button, so afterwards `closest()` would call it an outside click and shut the mixer. The mixer half of the Multitrack button turns yellow with it when the multitrack is playing; open adds a ring. It also holds "Load multitrack (N MB)", Reset mix and "Use the Multitrack".
  - **Solo overrides off.** Controls are locked until the tracks in the decode plan are in (a track that failed does not lock them).
  - **A track switched on is never left silent.** Its file jumps the download queue (`bgFetchUrgent`, and it may run alongside the usual two); a track that is already decoded but has no player gets one; and every audible track is reconciled on each mixer change and twice a second while playing (`practiceSyncAudible`).
  - Web Audio: decodeAudioData, then per track BufferSource → Gain → Analyser. Playback is **stereo**. Computers decode every track at the device rate. **Phones and iPads** (`PHONE`) have a 320 MiB decode budget (`PRACTICE_MEM_BUDGET`; long medleys crash iOS Safari past ~520 MB): `practiceDecodePlan` keeps stereo and drops the sample rate (44.1/32/24/22.05 kHz) only as far as needed, decodes the tracks being listened to **first** and fills the rest of the budget, and falls back to mono only when stereo cannot fit. A track left out (stems are off by default) is decoded when it is switched on or soloed (`practiceEnsureTrack`) and joins a playing mix at the right spot (`practiceAttachTrack`); `practiceMakeRoom` drops silent tracks when the budget is tight. A track whose two channels are identical is stored as one (`practiceIsDualMono`), which sounds the same and leaves room for the tracks that really are stereo. Every file is still downloaded for offline use.
  - **Song changes:** the Mixdown/Multitrack choice carries over (sessionStorage `tsp-practice-mode`); a multitrack loads by itself only if it's already saved on the device or in memory (downloading is always the member's choice: Load multitrack, or the transport's Multitrack button); once it's ready in Multitrack mode, playback hands over from the Mixdown at the same spot. While the next song loads, the previous song's cards stay on the page dimmed (`practice-switching`) and `practiceKeepPlace` holds card heights and the scroll position, so nothing blanks or jumps (iPhone used to scroll to the top). Every file opened in a visit is also kept in memory, compressed (`memBlobs`, 220 MB phone / 700 MB computer), so going back to a song never downloads again even if the device can't save it. Save errors show in the Offline audio card. Multitrack downloads run in a background queue (`bgFetch`, two files at a time) that keeps going when the member changes song; the Offline audio card lists songs still downloading, and returning to the song attaches to its download. The card counts saved mixdowns and complete multitracks separately.
- **Bottom transport (Ableton look, fixed; stays on screen while the next song loads, buttons greyed until it's playable):**
  - Mixdown/Multitrack switch (keeps the playhead; Multitrack shows a download icon and progress until loaded), prev song, back to start, play/pause, stop, next song, position, seek, length.
  - **At the end of a song the playhead stays at the end**, paused; pressing play there starts the song again.
  - **While following Ableton** (`body.ableton-following`) the bar keeps only what can be read — Key, tempo and work remaining. The modes, song button, transport buttons, seek and both time readouts are hidden, since Live drives the playhead.
  - **While editing lyrics** (`body.lyrics-editing`) the work-remaining chip and the song button are hidden; everything else stays.
  - **iPhone keyboard:** the bar leaves the layout entirely while the on-screen keyboard is up (`body.keyboard-open`) and is put back once the visual viewport has stopped changing and is back to full height, which forces Safari to place it against the viewport that is actually there. Nothing watches the viewport unless the keyboard is up. Earlier attempts (nudging, measuring and moving the bar) made scrolling worse and are gone.
  - Song ID and title; chips for live **Key**, live **BPM** (from the tempo map) and **Ready / Not ready · N left**.
  - On phones: title and modes on row 1, buttons and times on row 2, the seek bar alone on row 3, chips on row 4. Safe-area padding keeps it off the iOS home bar.
- **The lyrics header carries the practice controls (13 Nov 2026):** Follow Ableton, Group practice, text size and full screen, in that order, at the right of the lyrics card's header — on the page and in full screen alike. The song-list row holds only the list and its note. One **text-size button** (a small A beside a large one) opens the three sizes in a popover; the two round buttons are in the glass theme's own selector lists, so they are the same control as the size and full-screen buttons (same box, fill, edge, radius, hover and lit state) with one 6 px gap. The buttons are rendered with the lyrics card, so every state of it (loading, error, no lyrics, lyrics) uses `lyricsHeaderHtml()` and calls `lyricsHeaderRendered()` after.
- **Group practice (rooms, 2026-11-13):** the group button in the lyrics header offers **Make a room** (4 characters, e.g. `K7QD`) or **Join a room**. One Supabase Realtime broadcast channel per room (`tsp-room-<code>`), presence for who is in it; no tables, the code is kept in sessionStorage so a reload rejoins.
  - **The host** plays as usual and broadcasts a clock *anchor* every second and on every transport action: `{songId, position, at (its own Date.now()), playing, duration}`. The anchor only moves when playback really drifts from it (`roomHostAnchor`, 0.25 s), so followers get a straight line instead of the coarse steps Safari reports for `<audio>.currentTime`.
  - **A follower** measures the difference between the two clocks from round trips (`ping`/`pong`), keeps the sample with the **shortest** round trip (least lopsided), eases towards it, and re-measures every 20 s; it then runs the anchor forward with its own clock, so the lyrics never wait for a message. The chip shows `synced ±N ms` (half the round trip).
  - **The seams:** `ptEngine`/`ptPosition`/`ptIsPlaying`/`ptDuration` return room values while following (everything on the page reads the position through `practiceNow()` → `ptPosition()`), and `ptPlay`/`ptPause`/`ptSeek`/`ptStop`/prev/next/song send a command instead (`roomCmd`). The host applies commands through its own buttons, so a follower can do nothing the host could not. Mixdown/Multitrack and the mixer are hidden on a follower (`body.room-following`), which also never downloads or decodes audio.
  - Lyrics track, text size, full screen, the work popover and the song list stay local to each device; only choosing a song is sent. Guests may join, not host. The room ends when the host leaves (`bye`, or presence noticing it go).
  - **iPhone/iPad hosts:** Safari only allows audio after a real tap, so the host must press play once itself before remote presses work; the dialog says so.
  - **QR codes:** the create dialog shows the code with a QR of `TSP:<code>`; the join dialog has a camera square that joins as soon as it reads one. The encoder is in `app.js` (version 1, level M, byte mode, `qrEncode`/`qrSvg`), checked module for module against a reference encoder and read back with the same decoder the scanner uses (`tests/qr.test.js`). Decoding camera frames uses `vendor/jsqr.js` (jsQR 1.4.0, Apache-2.0, minified, loaded only when the scanner opens and staged into `_site/vendor/` by the deploy workflow). A scan is accepted as that token, a bare code, or a link carrying `room=<code>`.
  - **Staying in step:** the host corrects its anchor by a quarter of its error on every send (which filters the coarse times an `<audio>` element reports) and snaps only for a real jump; state goes out every 500 ms; followers re-measure the clock every 10 s and at once on waking, focus or reconnect, and take an offset that moved more than 120 ms in one step.
- **Lock screen / Dynamic Island / Control Centre** (Media Session API, `ptMedia*` at the end of `app.js`): song title, `ID · The String Project`, Mixdown/Multitrack, app icon artwork; the system scrubber (`seekto`), play/pause, ±10 s and previous/next song (handlers registered at load). **Tested 2026-11-09:** in a Safari tab iOS delivers the actions (scrubbing works) but shows ±10 s buttons, not previous/next song; in the Home Screen app iOS delivers none of them (only play/pause, which iOS does itself) drive the app transport (`ptSeek`/`ptPlay`/`ptPause`/`practiceStepSong`), so they work for both engines. Position is pushed every second (every 2 s while the screen is off). The multitrack plays through Web Audio, so a silent looping WAV `<audio>` plays alongside it to keep iOS's now-playing session alive. The Mixdown uses **one persistent `<audio>` element** (`ptMixElement`) whose source changes per song, because iOS only lets an already-played element start from the lock screen. Diagnostics (off; `ptMedia.debug = true` logs lock-screen actions to `app_meta.media_debug`, admin only).
- **Works offline:** `sw.js` service worker keeps the app shell (network-first for same-origin, cache-first for esm.sh) in `tsp-app-shell-v1`; the page also adds what it is running to that cache. Last loaded data (member, songs, tasks, setlists, readiness, practice colours, setlist song lists) is kept in localStorage `tsp-data-cache-v1`; lyrics per song in Cache Storage `tsp-offline-data-v1`. With no connection the app opens read-only from these, with an offline banner.
- **Offline audio** card (all members): **always on** (no off switch; an old "off" choice is ignored; "Delete saved audio" frees the space but keeps saving) (browser storage); save practice audio on the device so it downloads once. Folder mode (Chrome/Edge desktop, File System Access; handle kept in IndexedDB, manifest `tsp-audio-manifest.json` in the folder) or browser mode (Cache Storage `tsp-practice-audio-v1`, works on iPhone; `navigator.storage.persist()`). Manifest (`tsp-offline-manifest-v1`) stores each file's version = bytes|upload time; newer uploads show an "Update" prompt for just those files. Songs are saved as they're played (a song whose multitrack is saved loads it automatically on open); "Save … Mixdowns / Everything" saves the current song list. With no connection the page plays saved audio.
- **Downloads:** every file, plus "Download all" (presigned links with `content-disposition`).
- **Lyrics (AbleSet look):**
  - Track chips: Chords, Guitar, Keyboard, Lyrics, Drums plus any other `+LYRICS` track; on a narrow screen the row scrolls sideways and the chips keep their shape. Text size S/M/L behind one button (see the header above).
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
  - **Full screen** (button beside the size letters, or F; Esc exits): only the lyrics, bigger text scaled to the screen, with the size/track controls on top and the transport at the bottom; tapping/clicking empty space shows or hides them; while playing they fade out 2.5 s after the last touch/click/mouse move (5 s after using a control or swiping the chips), while paused they stay until you tap empty space; tapping the words of a line jumps there (lines are only as wide as their words, so the black space beside them toggles the controls instead). Full screen fades in and out. One glass layer sits behind the top bar (iOS draws nested backdrop blurs black, so the buttons themselves have no blur). Track chips scroll sideways with an edge fade and a › hint when more are off-screen. On phones autoscroll uses Safari's native smooth scrolling (the custom eased glide jumped on iPhone). Uses the browser's real full screen where allowed (not on iPhone). Controls are Liquid-Glass style (translucent blurred bars and pill buttons over the lyrics); no "Lyrics" title in full screen; leaving full screen scrolls the page so the lyrics card is at the top. `lyricsFs`, body classes `lyrics-fs` / `lyrics-fs-controls`.
  - **Behaviour:**
    - Autoscroll keeps the current line about 35% down; it pauses for 4 s after a manual scroll.
    - On computers (lyrics column beside the players, sticky) `lyricsFit` sizes the box on every scroll/resize so it always ends just above the transport and is fully visible; `lyricsPad` sizes the space above/below the lines to the box.
    - Clicking a line or section seeks there.
    - A section is highlighted only when no line is live.
    - Lyrics are timed only when the audio and set lengths agree.
- **Guitar tones (MIDI)** card, at the very bottom (below the admin's Upload card), **only for Aaron and Rowen** (`TONE_MEMBERS`):
  - Web MIDI (Chrome/Edge only; Safari can't) sends the `song_lyrics.tone` notes (Note On/Off, channel 1 by default) at the right times, with a 20 ms lookahead and a 15 ms timer that keeps running in the background.
  - Chase: after any seek, jump or paused move, it sends the tone active at the new spot.
  - Only songs whose **Guitar Tone Midi task is Completed or Finished** send tones.
  - Includes a built-in setup guide: IAC Driver online → Live MIDI prefs Track on → a MIDI track from IAC to the processor → choose the port, Send current tone. A processor plugged in by USB can be picked directly.

---

## 7. TSPWork (Ableton remote script) — `tools/ableton-remote-script/TSPWork/`

- A `_Framework.ControlSurface` for **Live 12**, chosen as a Control Surface named "TSPWork" in Live's MIDI settings. It runs HTTP/HTTPS servers on a thread; Live API work is marshalled to the main thread with `schedule_message` ticks (`_run_on_main`).
- **Version 1.27** keeps guarded lyrics writeback in Live's open memory and never saves the set; Aaron manually saves, then uses Sync Ableton Set for saved-file confirmation. Version 1.26 added Drum/Percussion clip creation/removal. `alsreader` and `exporter` are `importlib.reload`ed on every use, so updating those two files needs **no Live restart**. Changing `tspwork.py` needs TSPWork reselected in Live's Control Surface menu (None → TSPWork).
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

- **How it reads (since 2026-11-08):** unzips the set once, cuts it into the top-level tracks by Ableton's tab indentation and parses each with the C XML parser in 1 MB pieces (falls back to the old streaming parser if the layout differs). Clip sound hashes use `_xml_bytes`, which gives the same bytes as `ET.tostring` (own copies of ElementTree's escaping, identical in Python 3.9–3.13 incl. Live's 3.11). Verified: snapshot identical to the old reader.
- **Where it runs:** inside Live, reads took 160–420 s (Live slows Python threads). `build_snapshot` therefore runs itself in a separate `python3` when one exists (Homebrew, /usr/local, Command Line Tools or Xcode; never the `/usr/bin` stub, which can pop up an install dialog): ~19 s on Aaron's Mac with the Command Line Tools Python. Each snapshot records `reader` (path, or `in Live (reason)`). Progress (`PROGRESS`: stage open/tracks/songs/done, done, total) is reported by the child on stderr and served by TSPWork 1.27's `/status` during a read.
- It parses the gzip XML into tracks (name, group, colour, arrangement clips with name, start/end, disabled, notes and short-clip MIDI notes following loop and start marker), locators, tempo automation and time-signature automation.
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
  - `audio_fp`: per practice element (Stems, Parts, Backing, CPC, Mixdown) a 12-char hash of the source tracks' clips in the song (sound-relevant clip XML: loop, warp, gain, fades, envelopes, notes, plus position; the sample is identified by file name, size, CRC, length and rate only, so moving/collecting the project doesn't change it; Live's object IDs (`Id`/`NoteId` attributes, `PointeeId`/`LomId` tags), which are renumbered on every save, are ignored too (since 2026-11-09)) and mixer volume/pan. Lyrics/SECTIONS/SONG ID/GUITAR TONE clips are not sound-hashed (speed).
  - `lyrics` = `{tracks, sections, tempo}`; `bars` (`[sec, num, den]` per bar; a new bar starts at each time-signature change, as in Ableton); `tone` (GUITAR TONE notes with seconds, bar, note, velocity, duration).
- **Set-wide output:** `track_colors` (Live 70-colour palette index → hex for the practice elements), `warnings`, `als_modified_at`, `als_size`.
- **Key cross-check:** Guitar/Keyboard/Lyrics `[Key:]` markers must match the Chords track (warning `key_mismatch`); a first marker not at bar 1 is warned (`key_late`).
- A full read takes ~20 s in the cloud workspace and ~19 s on the Mac (separate python). The Mac's Linux VM can run out of memory, so stage the file to the cloud workspace for testing instead.

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

- **Automatic gate:** `.github/workflows/deploy.yml` runs `node --check` on `app.js`/`boot.js`/`sw.js`, `node --test tests/*.test.js tools/ableton-remote-script/tests/*.test.js`, `py_compile` and the Python unit tests before the Pages deploy. Run the same commands locally before pushing.
- **Database tests** (`tests/sql/`) run by hand inside a transaction that always rolls back; never in CI.
- Counts as of 13 Nov 2026: **136** Node tests across `tests/*.test.js` (plus `tools/ableton-remote-script/tests/practice-sync-state.test.js`) and **44** Python tests.

- Syntax-check every JS change; `py_compile` every Python change.
- Render UI changes headless (Playwright in the workspace) at 360/390 px and 1280+ px, and check the live site after deploys.
- **Measure a layout rather than reason about it.** The built-in browser can load the deployed page, have the real markup injected into the real card (so the real selectors apply) and report rectangles; several CSS bugs this week were specificity, not maths, and only measuring found them.
- For lyrics work, render the real `song_lyrics` shape (`/tmp/lytest.html` harness: extract the lyrics section of `app.js`, stub `state/practice/$`).
- Never test exports or review mode while Aaron is mid-export or performing.

---

## 13. Roadmap and open items

**Verified 2026-11-11:** live Supabase is healthy; all 27 listed public tables have RLS enabled; Edge Functions are active at `practice-audio` v7 and `member-access-admin` v8 and match repository source. The private R2 bucket `tsp-practice` contains 655 objects totaling 3,137,519,522 bytes, matching the 655 rows in `practice_audio_state`; browser access is mediated by signed URLs. No live app records or R2 objects were changed in this audit.


**Built (Oct–Nov 2026):** core tracker; member logins; gigs/setlists/dashboard; Ableton Sync with auto-metadata, evidence, snooze, chord mismatches and review mode; overnight practice export to R2 (all 62 songs uploaded 2026-11-08, 3.14 GB; timing log, stop-after-song, auto-retry, freshness fingerprints); Practice page with multitrack, transport, AbleSet lyrics, live key/BPM, guitar-tone MIDI, offline audio and a fully offline (read-only) app.

**Next / ideas (not started unless Aaron asks):**
- Stats page for the activity logs (time online, pages, practice plays per member and song; views `member_activity_daily`, `member_practice_by_song`).
- App setlist → AbleSet setlist (planned third step of the Ableton integration).
- Medley constituents UI (`medley_parts`), deadlines UI (`deadlines`), percussion picks UI (`song_percussion`).
- Link Gautham's login.
- Gamification (points, streaks, badges, leaderboards), deliberately after the core.
- Google Drive delivery (deferred; R2 replaced it for practice audio).
- Clean up the legacy `practice_tracks` table once nothing reads it.

---

### 13.1 Ongoing testing phase (since 2026-11-09): practice-audio freshness ("yellow")

Aaron is testing whether the export checklist's yellow "changed since upload" flag fires only for real changes.
- **What happened:** moving the project to the SSD + Collect All and Save turned all 62 songs yellow (fingerprints included sample paths and dates). After that was fixed, one small edit (EHKM1 Bass Part clips disabled) turned 10 untouched songs yellow too: Live renumbers internal IDs (`Id` on warp markers and other elements) on every save.
- **Fixes:** fingerprints now ignore sample paths/dates (the sample is identified by name, size, CRC, length, rate) and Live's object IDs (`Id`, `NoteId`, `PointeeId`, `LomId`). Verified on Aaron's two saves: only EHKM1 Part - Bass and its Mixdown differed.
- **State reset (2026-11-09 ~02:05 IST):** at Aaron's request every song was forced green: `app_meta.audio_fingerprints` and all `practice_audio_state` rows were set to the new-format fingerprints of the set saved 2026-11-08 20:22 UTC (654 rows; EHKM1 Part - Bass row removed because that track is now empty, its old file is still in R2). Backup of the earlier rows: `practice_audio_state_backup_20261109`.
- **Still to confirm with Aaron:** small edits turn only the edited song yellow; plain re-saves change nothing; moving/collecting changes nothing; re-exporting a yellow song turns it green. Watch for other save-to-save noise (e.g. envelope or note data) and tell Aaron if a song goes yellow without a real edit. Until Aaron says the testing is done, treat yellow flags as provisional.

---

### 13.2 Lyrics editing and guarded Ableton writeback (built 2026-11-11)

- Practice edits are shared per song and instrument in `song_lyrics_edits`; `song_lyrics` remains the Ableton baseline. Members edit their own instrument track; admins can edit any supported track.
- **Follow Ableton (13 Nov 2026).** The button with the Ableton mark in the lyrics header, shown whenever the Ableton chip is up. It puts the device on Live's transport: it opens the song the arrangement playhead is inside and runs the lyrics against that timecode, with no audio anywhere and the transport read-only. Following and a practice room are mutually exclusive (each greys the other out).
  - **It is not a local-network feature.** The bridge stays on 127.0.0.1; the Mac relays. So it works on Wi-Fi and on mobile data alike, and the honest condition is the chip: the Mac app and the Master Project are open and reachable.
  - **The Mac's side:** polls `/transport {action:'state'}` four times a second **only while somebody is following** (its own claim, or a remote claim no older than 30 s), and broadcasts `{songId, beat, start, playing, at}` on the `tsp-ableton` channel. TSPWork **1.32** adds `live_beat`, `live_song`, `live_start`, `live_end` and `tempo` to that reply (`_song_at`).
  - **Each device** turns beats into seconds with the same tempo map its lyrics were timed with (`lyricsSecondsForBeats`), so the conversion matches the words on screen, and extrapolates between relays against a clock offset measured by `fping`/`fpong` on the same channel.
  - **Letting go cleanly:** a follower freezes where it is after 6 s of silence (rather than running on a clock nobody is feeding), says so, rebuilds its channel and re-announces itself; it releases the transport after 15 s, or after 90 s if the chip still says the Mac is there and is merely slow. Stopping leaves the playhead where Ableton left it, paused. The status line is the header's own `#follow-note`, cleared whenever the device is not following.
  - **The channel mends itself** (`abletonRemoteHeal`): on a failed or timed-out subscription, on coming back online, on returning to the tab, and before any relay or jump is sent. A device that lost its network recovers without the app being reopened.
- **Room QR codes (13 Nov 2026).** The create-room dialog shows a QR of `TSP:<code>` (encoder in `app.js`: version 1, level M, byte mode, checked against a reference encoder in `tests/qr.test.js`); the join dialog has a camera square that decodes with `vendor/jsqr.js` (Apache-2.0, vendored minified, loaded only when the scanner opens, staged into `_site/vendor/` by the deploy workflow).
- **The Ableton chip's timing (13 Nov 2026).** The Mac writes a heartbeat into `app_meta.ableton_bridge_presence` every 6 s (its bridge probe), and publishes immediately when its own visibility changes. Each device expires that heartbeat **itself** every 2 s with no database read (`abletonPresenceExpiryCheck`), so the chip — and with it the Song ID jumps and Follow Ableton — goes about 20 s after the Mac does. The life is published in the row as `ttl_ms`: **18 s** while the Mac is on screen, **150 s** while it is hidden, because a window on another macOS desktop has its timers throttled (readers clamp whatever arrives between those bounds). The bridge page also holds a Web Lock, which exempts it from the harshest throttling. A device that is offline, or that fails two presence reads, drops the chip at once and releases any following.
- **Song ID = Ableton jump (13 Nov 2026).** A Song ID anywhere in the app (songs, setlist repertoire and song rows, the transport work popover) moves the playhead; song titles never do, and the review player belongs to the Ableton Sync page's review rows alone. It is active for an admin on any device, and for anyone in a practice room with an admin, while the heartbeat says the Master Project is open (`body.ableton-jumpable`). A device without the bridge relays over the `tsp-ableton` broadcast channel; the Mac checks the asking member against the member list and its own room code before acting. **TSPWork 1.31 refuses any jump while Live is playing** (`skipped: 'playing'`), and the app refuses to ask an older bridge at all.
- **The editor is the lyrics view itself (13 Nov 2026).** Its clips become cells in the same scroller, each still carrying `data-line`/`data-t`/`data-e`, so the playback highlight, the autoscroll and the transport keep running while editing. It opens on the clip that is playing; opening a clip or scrolling away holds the autoscroll, and scrolling the playing clip back into view resumes it. The playback bar stays, without the work-remaining chip and the song picker (`body.lyrics-editing`). Entering the editor leaves full screen. Switching tracks mid-edit closes the editor when nothing changed, and otherwise asks to save or cancel.
- The editor preserves clip timing/order for ordinary tracks. Drums and Percussion may add or remove clips only in the app’s supported empty-section workflow.
- Sync writes only to the allowlisted main Ableton set and preflights source text/timing. It changes Live's open in-memory set and never invokes Save. After Aaron manually saves in Live, Sync Ableton Set reads the saved `.als`, verifies pending lyric rows, then updates the Practice baseline and clears only matching overrides. Failed or mismatched readback keeps the shared edit.
- Practice refreshes lyrics after sync in the active page and other open tabs. The loaded Live session must reload TSPWork 1.27 before using the newest bridge behavior.
- Saved lyric edits now sync automatically while Aaron’s Mac app is open and the exact master project is open in Live, but only into Live memory. Practice shows a manual-save state; lyric edits remain queued and further edits/restores are blocked until Aaron manually saves the set and confirms with Sync Ableton Set. If the host is offline, the edit remains queued in Practice until it reconnects.
- Signed-in clients display a shared Ableton chip from the admin-written `app_meta.ableton_bridge_presence` heartbeat. The 45-second expiry prevents a stopped Mac app from appearing available indefinitely; the heartbeat shares no LAN address or local project path. The **Save** suffix is local-only: it appears in the Mac app connected to the open master set, never on phones or other remote devices.

---

## 14. Decision log (newest first)

- **2026-11-13 (Follow Ableton, and what "connected" means)**
  - Every device can ride Live's transport for its lyrics, relayed by the Mac over Supabase rather than the local network: the bridge stays on 127.0.0.1, and a phone on mobile data is as good a follower as one on the Wi-Fi. Aaron asked for a same-Wi-Fi condition and we did not build it, because it would switch off a path that works.
  - The honest condition is the Ableton chip, so the chip had to become truthful quickly: a heartbeat that each device expires by itself, a life the Mac publishes according to its own visibility, and a Web Lock so a window on another desktop keeps beating.
  - Nothing may hang on something that is not there: a follower freezes, mends its channel, and lets go; a device that is offline drops the chip and releases itself. No feature waits on a reload of the app.
  - Followers play no audio. As with rooms, several devices playing the same audio in step is a different and much harder problem.

- **2026-11-13 (the lyrics header is the practice control strip)**
  - Three size buttons became one that opens the three, and the space freed took Follow Ableton and Group practice out of the song-list row. The controls that belong to practising are together, on the page and in full screen.
  - They are styled by joining the glass theme's own selector lists rather than by copying values: one place decides what a button of that family looks like.

- **2026-11-13 (the iPhone keyboard and the playback bar)**
  - Two attempts at moving the bar (a scroll nudge, then measuring the viewport and feeding back an offset) made scrolling worse and were reverted. The bar now leaves the layout while the keyboard is up and returns only when the visual viewport has settled: the browser places it, we do not.

- **2026-11-13 (group practice)**
  - Built rooms for practising together: one device plays, the others follow its lyrics and drive its playback bar (section 6.3). Supabase Realtime broadcast, clock-anchor + round-trip offset so accuracy does not depend on message latency; the measured figure is shown on the chip.
  - Followers hold no audio: playing the same song on several devices in step is a different and much harder problem, deliberately out of scope.

- **2026-11-12 (Practice page simplified; multitrack plays in stereo)**
  - The song selector and its ‹ › buttons are gone: the transport's song button and prev/next are the only song picker.
  - The Mixdown and Multitrack cards are gone from the page. The mixer opens from the Multitrack button in the transport everywhere, as it already did in full-screen lyrics.
  - The multitrack plays in **stereo**. Phones and iPads keep a memory budget, but now by decoding the tracks being listened to first (stems load when switched on) and by storing dual-mono tracks once, instead of making everything mono.

- **2026-11-12 (lyric update mismatches)**
  - A Practice edit and a hand edit in Live on the **same clip** is a decision for Aaron, not an error: it is listed on **Ableton Sync → Lyric update mismatches** with the Practice text, the text now in Ableton and the saved text. **Use Practice edit** overwrites that clip in Live once; **Keep Ableton** makes the queue adopt Live's text. The choice is applied to the open set straight away. The Ableton chip does not turn red for a mismatch; other devices show "Waiting for a decision".
  - TSPWork **1.30**: each clip arrives with the texts Practice itself put there (`accept`: saved and previously applied) and `untouched`; a clip holding anything else was typed by hand: kept when Practice left it alone, otherwise reported in `conflicts` with all three texts. `force` on a line overwrites once. A hand change made *after* an edit was applied is now detected too. Older app versions without these fields behave as before.
  - Mismatch details are stored in `song_lyrics_edits.relay_conflicts`.

- **2026-11-12 (lyrics relay made dependable)**
  - **Queue model:** one row per song and lyrics track in `song_lyrics_edits`: `lines` (what the track should say), `applied_lines` (what the Mac relay last put into Live's memory), `relay_error` (why Live refused it, if it did). The saved `.als` baseline stays in `song_lyrics` until a manual save and Sync confirm the edit.
  - **Relay sends only new work**, in one request for all tracks, and does a **full re-check** of every queued edit when TSPWork reports a new `session` (Live or the set was reopened), when the Mac app opens, after Sync Ableton Set, and every two minutes. Re-checking is harmless: the bridge changes nothing when Live already matches.
  - **Live reopened without saving:** the relay retries a refused track against the saved baseline, so queued edits go back into Live's memory by themselves.
  - **A conflict holds back only its own track** for a minute (or until it is saved again); other tracks keep flowing. A busy bridge is retried after 3 s, connection trouble after 15 s.
  - **Two devices editing one track** are merged line by line on save: lines this editor changed win, untouched lines take the other device's text. Only a clip added or removed elsewhere (Drums/Percussion) still asks the editor to reopen.
  - **Every device sees where its edit is** under the track chips: saved and waiting for the Mac, sending, in Ableton (pending manual save), or not applied with the reason.
  - TSPWork **1.29** adds `session` to `/status`; nothing else changed from 1.28.
  - **After Aaron's device test (same day):** a re-check of an edit believed to be in Live is described to the bridge against the **saved set first** (against the applied state nothing differs, so a Live reopened without saving was left unchanged); new work goes against the applied state first; the other description is the fallback. The editor is **never blocked** while edits wait for a manual save. Practice also checks the open song's edits every 6 s with a small query (`applied_at`, `updated_at`, `relay_error`) in case Realtime dropped. **Clicking a song title no longer moves Ableton** (Aaron's decision); review clicks on work titles and the Sync page are unchanged.

- **2026-11-12 (audit follow-up, verified against live services)**
  - **Guests are restricted in the database, not only in the UI.** `is_band_member()` gates every read policy except songs, `song_lyrics`, `song_lyrics_edits`, the guest's own `members` row and the `practice_track_colors` row of `app_meta`. Checked with the guest's, a member's and the admin's identity: the guest reads nothing else and cannot write.
  - **Accounts are linked only by the admin's Member access function.** The sign-up trigger no longer links by email. Public sign-ups are disabled (checked).
  - **Sync Ableton Set never stops for one lyric edit.** An edit that is not in the saved set stays queued and is listed; its track keeps the baseline it was made against so a real conflict is still detected; everything else saves. Edits are cleared only after the saved file confirms them and only if the row has not changed since.
  - **Deleting a song is refused while it, or any song that would be renumbered, has practice audio.** History tables follow a renumbered song; a deleted song's history is kept under a retired key.
  - **Sign-out clears band data from the device** (asks whether to keep saved practice audio). Signing in as someone else clears the previous member's data.
  - **TSPWork 1.28**: every command needs the signed-in admin's short-lived Supabase token, which TSPWork confirms with Supabase (`rpc/is_admin`); export uploads must point at the `tsp-practice` bucket. The bridge stays on `127.0.0.1`. The app already sends the token and works with 1.27.
  - **Content-Security-Policy is live** (meta tag in `index.html`; inline script moved to `boot.js`). Checked in the published page: Supabase, Realtime, R2 audio, saved (blob) audio and the bridge are allowed; other hosts, inline scripts and inline handlers are blocked.
  - **Every push is checked before it deploys**: syntax, tests and required files run in GitHub Actions; a failure stops the deploy.
  - Guests no longer see the Ready chip on Practice (they cannot read task data, so it was misleading).

- **2026-11-11**
  - Main-project lyrics writeback is the active target; the test copy is historical. Preserve the allowlisted path, preflight, save/readback verification, and retain-on-error behavior.
  - Only saved Practice lyric edits can automatically modify lyric MIDI clip names in the exact master project. The Mac app is the relay; keep the TSPWork listener loopback-only and never expose the control port to Wi-Fi.
  - Drum/Percussion clip creation/removal is supported only in the Practice lyrics editor workflow.
  - Keep the live Supabase migration ledger and deployed function metadata as the authority when the documentation snapshot differs.
- **2026-11-09**
  - New user type **Guest** (Practice page only); Kenneth Shalom added as the first guest.
  - Fingerprints ignore file locations, dates and Live's internal IDs; everything was forced green to start a testing phase (section 13.1).
  - Export Stop/Cancel retry until TSPWork confirms.
- **2026-11-08**
  - Activity logging for later statistics: sessions, page visits, practice plays (a play counts as practised at 30 s+); members see only their own rows, the admin sees all.
  - Full-screen lyrics get a compact mixer drop-up from the Multitrack button (only in full screen).
  - The sign-in form stays hidden while a saved sign-in opens the app (no password-manager pop-up).
  - Exports never read the set first; they use the latest read (this window or `app_meta.audio_fingerprints`). Read once after editing, then export.
  - Set reads run in a separate python (≈20 s); the Read button shows real stages and progress; waits for a busy TSPWork up to 15 min instead of failing.
  - Open apps offer a one-tap update when a newer version is live (never auto-reload: practice may be playing).
  - After an export, songs that exported fine are unchecked; failed ones stay checked.
  - Test pass fixes: keys keep the song's own order (first = starting key); durations are M:SS everywhere; password resets need a confirm; setlist saves are one transaction (`save_setlist`); Setlists opens on the next gig; status label is always "Completed".
  - Data left as Aaron decides (Ableton spelling wins): I1/I2/I5 marked single despite "/" names; "Voulez-Vouz", "Uff teri Ada" spellings.
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

- **Installed bridge:** always compare the SHA-256 of `~/Music/Ableton/User Library/Remote Scripts/TSPWork/tspwork.py` with the repository file; Live only loads a new `tspwork.py` when TSPWork is reselected (Control Surface → None → TSPWork) or Live restarts. The app works with 1.27, 1.28 and 1.29.
- **Follow Ableton needs TSPWork 1.32 loaded in Live** (not just installed): the app refuses a Song ID jump below 1.31 and following below 1.32 rather than risk moving a playing transport. A reselect in Live's Link/Tempo/MIDI preferences is what loads it.
- **A hidden Mac window throttles everything the relay does.** The Web Lock and the published 150 s heartbeat life cover the chip; if following ever goes choppy with Live on another desktop, that is the cause, and the remaining fix (a silent audio stream to keep the page unthrottled) was deliberately not built, since it would put an unexpected audio stream on Aaron's Mac.
- **While following, the bar shows no time readout.** Aaron's list was Key, tempo and work remaining; the elapsed/total times are hidden with the rest. One line to change if he wants them back.
- **The Mac relay runs inside the TSP Work page on Aaron's Mac.** Keep that page in its own visible window or tab group: Safari slows and can suspend background tabs, which delays queued edits until the page is looked at again.
- **Not yet checked by a person:** real playback on iPhone/Safari under the Content-Security-Policy, the sign-out dialog on a phone, and the guest account in the app after the database change. R2 public-access, CORS and lifecycle settings need the Cloudflare dashboard (docs/OPERATIONS.md).
- **No automatic database backups** (Free plan). Follow docs/OPERATIONS.md before database changes.

- **Read set needed:** after any alsreader change, nothing new (colours, tone, bars, keys) reaches the app until Aaron clicks **Read set**.
- **Deleting a song with practice audio is refused** (it, or any song that would be renumbered). To delete such a song: remove the affected songs' R2 files and `practice_audio_state` rows (exact keys from the Storage check), delete, then export the renumbered songs again.
- **Web MIDI** works only in Chrome/Edge. Rowen must use one of them.
- **Safari caching:** GitHub Pages caches `index.html` ~10 min. Open apps now show a "new version is ready — Update" bar; otherwise bump `?v` and reload.
- **Deploying to the Mac with `device_commit_files`:** it can write an *older* upload with the same file name (happened 2026-11-08: TSPWork 1.20 landed as 1.19). Stage each upload under a unique name (e.g. `alsreader-<md5>.py`) and always check the Mac's md5 afterwards.
- **TSPWork's server is starved while Live renders:** connections drop in bursts (`tls handshake failed: SSLEOFError` in `requests.log`). Stop/Cancel therefore retry (25 s waits, up to 4 min) until TSPWork confirms; export polling is every 4 s.
- **TSPWork changes need a reselect** in Live (Control Surface None → TSPWork); `alsreader.py` and `exporter.py` are reloaded on every use and don't.
- **macOS App Nap** slows Live in the background; optional fix given to Aaron: `defaults write com.ableton.live NSAppSleepDisabled -bool YES` (reads no longer depend on it).
- **Live dialogs:** the exporter depends on Live's Export dialog layout (Live 12). A Live update can break it; symptoms are `no_export_dialog` or a stuck file wait. Use Cancel, then check `requests.log`.
- **E4–E7 practice audio is still the first 320 kbps MP3 export** (43 files); re-export them to get the smaller AAC copies.
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
- **2026-11-13:** Follow Ableton, room QR codes and scanner, full-screen lyric editing, and fixes (`?v=20261113-follow1`, TSPWork 1.32): the end of a song stays at the end, a multitrack stem switched on jumps the download queue instead of sitting silent, room transport drift corrected continuously, and the iPhone playback-bar fix narrowed to a one-shot re-anchor after the keyboard closes.
- **2026-11-13:** Follow Ableton made dependable (`?v=20261113-link3`): a follower freezes and then lets go rather than running on alone, its channel mends itself without the app being reopened, stopping leaves the playhead where Ableton left it, and the Ableton chip now goes about twenty seconds after the Mac — with a longer published life while the Mac is on another desktop, so it no longer flickers. The iPhone playback bar leaves the layout while the keyboard is up and returns once the viewport has settled.
- **2026-11-13:** The lyrics header became the practice control strip (`?v=20261113-head3`): one text-size button opening three, Follow Ableton and Group practice moved in and styled by the glass theme itself, and the playback bar reduced to Key, tempo and work remaining while following.
- **2026-11-13:** Song ID jumps (`?v=20261113-jump2`, TSPWork 1.31): any Song ID moves the playhead, from Aaron's phone and from his practice room too, never while Live is playing and never raising the review player. Lyrics editing also works in full screen, and the iPhone playback bar is corrected by measuring where it landed (the keyboard was the trigger).
- **2026-11-13:** Lyrics editing moved into the lyrics view (`?v=20261113-edit1`): clips edit in place, following playback, with the transport still available. The playback bar is pinned to the visible bottom on iPhone (`--pt-bottom` from `visualViewport`). On the Songs page the Song ID is the Ableton jump; the title only opens the song.
- **2026-11-12:** Audit follow-up verified end to end: guest policies, sign-up settings, deletion guard, Sync resilience, sign-out clean-up, CSP and bridge 1.28 tests; added the Storage check (R2 files vs upload records) on the Sync page, the CI gate in `deploy.yml`, `tests/audio-inventory.test.js`, and docs/OPERATIONS.md. Header, decision log and known issues refreshed.
- **2026-11-11:** Saved Practice lyrics now relay automatically from the open Mac app to the guarded Ableton master project; shared, expiring Ableton chip on signed-in devices (`?v=20261111-auto-ableton-lyrics1`).
- **2026-11-11:** Reconciled frontend cache markers, TSPWork 1.27 source, all 38 migration files and the 32-entry live ledger, deployed Edge Functions, the 26-table Supabase schema, and the 655-object R2 inventory. Confirmed the local Mac-only **Save** label and preserved manual Live edits on clips Practice did not change. No Supabase rows or R2 objects were rewritten.
- **2026-11-08:** Activity logging for statistics (`?v=20261108-act1`): `app_sessions`, `page_visits`, `practice_plays` (+ summary views). Members write/read their own rows; admin reads all. Code: `activity*` functions at the end of `app.js`.
- **2026-11-08:** Liquid Glass theme across the whole app (`?v=20261108-glass4`).
- **2026-11-08:** App always opens at the top (`history.scrollRestoration = 'manual'`); glass full-screen controls; the iPhone status-bar experiment was reverted (the top fade is Safari's own Home Screen app effect; Aaron parked it) (`?v=20261108-fs4`).
- **2026-11-08:** Full-screen lyrics with auto-hiding controls (`?v=20261108-fs2`); Songs/Setlists always show full song names.
- **2026-11-08:** Practice layout (`?v=20261108-pt13`): lyrics column starts at the top of the page on computers.
- **2026-11-08:** Lyrics box on computers always fully visible above the transport (`?v=20261108-pt10`).
- **2026-11-08:** Offline audio saving is always on (`?v=20261108-pt7`): "Save on this device" and "Stop saving" removed.
- **2026-11-08:** Practice (`?v=20261108-pt6`): multitrack downloads continue in the background across song changes; offline card counts mixdowns and multitracks.
- **2026-11-08:** Practice (`?v=20261108-pt4`): no automatic multitrack downloads; song changes keep the page in place.
- **2026-11-08:** Practice song switching (`?v=20261108-pt3`): transport no longer disappears; Multitrack mode carries over; in-visit memory cache stops re-downloads (Aaron's iPhone re-downloaded I1); lighter decoding on phones.
- **2026-11-08:** Update App Plan run: repo, Supabase ledger (28, head `save_setlist_rpc`), Edge Functions (v7/v6) and the Mac's TSPWork 1.18 files all in sync; decision log and counts refreshed.
- **2026-11-08:** Test-pass fixes (`?v=20261108-pt3`, TSPWork 1.18): song editor keeps key order and uses M:SS; password reset/temporary password asks to confirm; setlist edits survive tab switches and save in one call (`save_setlist`); Setlists opens on the next gig; new setlist can copy an existing one; layout fixes (multitrack rows, lyrics box above the transport, dashboard widgets, dialog buttons, export checklist, disabled buttons); "Completed" label everywhere; progress-line legend; gig countdowns; Practice remembers the last song. Report: claude.ai Project `claude/TEST_REPORT_2026-11-08.md`.
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
- **2026-11-08:** Full-screen lyrics mixer drop-up; sign-in form hidden while a saved sign-in opens the app; exiting full screen puts the Lyrics title at the top; Read Ableton set waits while TSPWork is busy, shows a reading panel, and shows reads started elsewhere (TSPWork 1.19).
- **2026-11-08:** Set reads faster: `alsreader` unzips once, cuts the file into tracks by indentation and parses each with the C parser in 1 MB pieces; clip sound hash uses a lighter serializer giving the same bytes as `ET.tostring` (snapshot verified identical). Exports no longer read the set first: they use the latest read (in this window or `app_meta.audio_fingerprints`). Waits for TSPWork up to 15 min.
- **2026-11-08:** `alsreader` hands the read to a separate python3 on the Mac when one exists (Homebrew, /usr/local, Command Line Tools or Xcode; never the /usr/bin stub), since inside Live reads ran ~10x slower (210 s vs ~20 s). Same result (own copies of ElementTree's escaping); falls back to reading inside Live. Each snapshot records `reader`.
- **2026-11-08:** Read Ableton set shows a progress bar (timed from recent reads on that device, `localStorage tsp-read-seconds`; saving steps fill the last 15 %), also for reads started in another window (`reading_since`). Mixdown length checks no longer hold up the results: they load afterwards, 6 at a time, cached per file version in localStorage.
- **2026-11-08:** Open apps check for a newer version (on open after 8 s, every 3 min, on return to the app) and show a "new version is ready — Update" bar; Update refreshes the cached files and reloads once.
- **2026-11-08:** Read button and panel show the real read stage (opening, tracks n of 375, songs n of 62) from TSPWork 1.20, then the app's saving steps as a checklist; the button fills with progress. Status line says whether the last read is up to date with the saved set. Export unchecks songs that exported fine (failed ones stay checked).
- **2026-11-08 (night):** Update App Plan run: repo pushed; ledger 29 migrations, head `member_activity_logs`, matches the repo; Edge Functions `practice-audio` v7, `member-access-admin` v7 unchanged; Mac TSPWork files were out of sync (1.19 alsreader/tspwork) and were redeployed (now 1.20, md5s in the header). Sections 8, 13, 14, 15 refreshed.
- **2026-11-09:** Export Stop after this song / Cancel now keep retrying until TSPWork confirms (it was dropping requests while Live rendered); export polling every 4 s (`?v=20261109-media5`).
- **2026-11-09:** Audio fingerprints ignore sample paths and dates (moving the project to the SSD and Collect All and Save had turned every song yellow). Backup of the old upload fingerprints: table `practice_audio_state_backup_20261109`.
- **2026-11-09:** Audio fingerprints also ignore Live's internal IDs (renumbered on every save; one save had turned 10 untouched songs yellow). Verified: between two saves only the edited song (EHKM1 bass) differs.
- **2026-11-09:** All songs forced green with the new-format fingerprints; section 13.1 records the ongoing freshness testing phase.
- **2026-11-09:** Guest users: `members.role` (`member`/`guest`), Kenneth Shalom added as a guest (Practice only), `member-access-admin` v8 returns `role` (`?v=20261109-media5`).
- **2026-11-09:** iPhone lock screen / Dynamic Island controls (Media Session): scrubbing, play/pause and next/previous drive the app transport for Mixdown and Multitrack (`?v=20261109-media5`).
- **2026-11-09:** Lock-screen fixes: handlers registered at load, no ±10 s actions, one persistent Mixdown element; `app_meta.media_debug` logs lock-screen actions (`?v=20261109-media5`).
- **2026-11-09:** Lock screen: works in Safari (not in the Home Screen app, an iOS limitation); ±10 s buttons now go through the transport so the Multitrack follows too (`?v=20261109-media5`).
