# TSP Work — Project Summary

*Official project summary for **TSP Work**, the band workspace for The String Project. Updated 19 Oct 2026 using the user’s clarifications, the live frontend repository (`aaronmark2222/tsp-band-app-live`), and the connected Supabase project (`hzvfrvjuqvmkeqbrgmqu`). Treat the live repository and database as the current implementation; user-confirmed decisions define intended behaviour. Keep this file synchronized with the repository copy after every meaningful work step.*

---

## 1. What the app is

A private web app named **TSP Work** for The String Project’s 7-member band, replacing the **Master Setlist** Google Sheet and its Apps Script. The app’s visible name is TSP Work; the GitHub repository and Supabase project retain their existing technical names unless separately requested.

- Every member **views** all progress on all work.
- Each member **edits only the work assigned to them**. Aaron (admin) views and edits everything.
- Gigs and setlists: create a gig (name, date, location, setlist), build setlists from songs, see total running time, and see work remaining/done per setlist.
- Deadlines at every level (gig/setlist, song, task type).
- Gamification (points, streaks, badges, leaderboards) comes **later**, once the core app is stable.
- Runs on **Supabase + GitHub only**, the same approach as Aaron's Marks Music app.

## 2. Status of the build

| # | Step | Status |
|---|---|---|
| 1 | Read sheet, map columns, ask questions | Done |
| 2 | Data model, roles, permissions, status rules | Done |
| 3 | Supabase schema + RLS + CSV import | Done, tested locally |
| 3b | Band's own Supabase project created and loaded | Done; live project healthy and populated |
| 4 | Frontend | Implemented and connected to the live database; ongoing improvements |
| 4b | Member logins and per-member workflows | Login page and first-login password setup work; verify the full per-member rollout separately |
| 5 | Medley constituents UI/workflow | Not implemented yet; database table exists |
| 6 | Gigs, setlists, running time, deadlines, per-setlist overview | Basic gigs/setlists are implemented; deadline workflows and additional views are not yet implemented in the frontend |
| 7 | Deploy, invite members, retire the sheet | Todo |
| 8 | Gamification | Later |

## 3. People and permissions

| Member | Role | Columns they edit |
|---|---|---|
| Aaron (admin) | Bassist, playback engineer | Ableset, Backing Music, Backing Percussion, Backing SFX, Bass Part, Backing Track, Ready; can edit everything |
| Dale | Female singer | Dale Backing Vocals, Dale VOX Part |
| Anston | Male singer, violinist | Anston Backing Vocals, Anston VOX Part, Violin Part |
| Rowen | Guitarist | Guitar Part |
| Albert (Milton) | Keyboardist | Keyboard Part |
| Gautham | Percussionist | Percussion Part + per-song percussion instruments |
| Nishanth | Drummer | Drums Part |

- Every member can set their own columns to any allowed status. Aaron can set anything anywhere. Only **Ready** is automatic.
- Gautham can pick several instruments per song from 12 (Chimes, Darbuka, Timbale, Bongo, Congo, Tak, Cowbell, Tambourine, Stack Cymbal, Floor Tom, Dholak, Shaker). Visible to all, editable by Gautham and Aaron only.
- Setlists, gigs and deadlines are edited by Aaron only for now. Members read them.
- **Build order:** stable version with Aaron as the only login first. Member logins come later (the permission rules are already in the database).

## 4. Songs

- Each song has a **Song ID typed manually by the admin**, plus name, key(s), tempo, duration, sort order.
- **ID prefixes:** `I` instrumental, `E` / `H` / `K` single-language (English / Hindi / Konkani), `EM` / `HM` / `KM` medleys, `EHM`, `EHKM`, followed by a number (E1, EM6…).
- **Languages** are a flexible multi-select managed in the app. Codes: E, H, K, **T** (Tamil), **Kn** (Kannada), **Ml** (Malayalam). Codes are one capital + lowercase. `I` and `M` are reserved so IDs always parse unambiguously. The app must reject a new code that conflicts with an existing one.
- The old "Oth" language was replaced: I1 = Hindi + Malayalam, I3 and I4 = Tamil, I5 = Tamil + Hindi (confirmed).
- **Medleys** are one row in the song list. A separate table holds each medley's **constituent songs** (name, language, original artist, key, tempo, order, duration).
- **Tempo** is stored as start tempo, end tempo and change type, and shown in the sheet's notation: `90 to 82` = ramp mid-song then stable; `148 & 116` = instant jump mid-song.
- Setlists show total running time.

## 5. Tasks, statuses, readiness

Each song has one `song_tasks` row per task type. `task_types` defines each type's label, category, owner member, allowed statuses and done statuses.

**Task types.** The live database intentionally has **18 task types**. In addition to the original backing and instrument-part tasks, the expanded set includes Sections, Lyrics, Chords, Guitar Tone MIDI, and Prompts. The expansion is intentional and should be preserved.

**Statuses:** Incomplete, Completed, No (not applicable), Corrections, Review, Draft, Recorded.
- **Done** = Completed (plus Corrections cleared for the two Backing Vocals columns). Corrections never counts as done. "Recorded" is shown separately as waiting for Aaron, and ownership of that task moves to the admin.
- **No** removes the task from the counts. A missing row counts as Incomplete.
- Ableset: Completed / Incomplete, set by Aaron (sections, lyrics, other Ableset work in the master Ableton project).
- Backing Vocals: recorded by Dale/Anston, then warped, tuned and placed by Aaron (hence the extra states).
- Part columns: "Completed" means the member has recorded their part and it exists in the Ableton project, so everyone can hear the full performance.

**Backing Track:** Not Finished → Finished → Sent to Mix → Mixed.
- Not Finished = not produced. Finished = produced. Sent to Mix = with the external mix engineer. Mixed = mixed tracks received and placed in the master Ableton project.
- **Automatic:** starts Not Finished, becomes Finished once every other Backing column is Completed or No.
- **Manual (Aaron only):** Sent to Mix and Mixed, stored in `songs.backing_track_manual`. A blank override shows "Auto".

**Ready** is automatic and nobody can set it by hand.
- Original step-3 rule: Backing Track = Mixed + Ableset = Completed + **all Parts** Completed or No.
- **Current rule (verified in the live database and confirmed working by the user):** Backing Track = Mixed + at least one Ableset-category task = Completed. Parts do not block readiness. The live `song_readiness` view implements this rule.

## 6. Gigs, setlists, deadlines

- **Gig:** name, date, start time, location, notes, and one setlist (each gig has its own). First gig: **30 Oct 2026**, setlist "Oct 30", no location yet. For now a gig keeps only name, date and setlist.
- **Setlist:** simple ordered list (songs, breaks, notes, per-song notes). Duplicate to reuse (`duplicate_setlist()`). Items are positioned; a song can appear once per setlist. Admin reorders by drag and drop.
- **Deadlines:** the gig date is the major deadline. Any other deadlines attach to a setlist, optionally narrowed to a song, task type or member. The frontend currently uses only the gig date.
- **Current live data (19 Oct 2026):** 50 songs. The Oct 30th setlist was intentionally updated to reflect real-life changes and currently contains 21 songs, with a calculated running time of 1:53:56 and no breaks recorded. Do not restore the old 26-song version.

## 7. Database (Supabase)

A new, **separate Supabase project in Aaron's own account** (keeps guitar-student data apart). Public sign-ups are off, and each member's email is added by Aaron. The browser only ever uses the **publishable (anon) key**. The `service_role` key must never be pasted anywhere. Data is fetched only after sign-in.

**Live migration history reported by Supabase:**
- `0006_split_ableset_tasks`
- `0007_optional_parts_dashboard_readiness`
- `0008_dashboard_all_songs_readiness`
- `0009_readiness_null_safe`
- `0010_corrections_remain_incomplete`
- `0011_oct_30_setlist_and_guitar_tone_owner`
- `first_login_password_setup`

Supabase's recorded migration history currently lists seven entries: `0006` through `0011`, plus `first_login_password_setup`. It does not list repository migrations `0001` through `0005`; preserve these files as project history, and do not rerun them against production without reconciling the live schema and migration history. The live public schema has 15 tables, and row-level security is enabled on the inspected public tables. Reference data currently includes 7 members, 6 languages, 18 task types, and 12 percussion instruments. Database structures for medley constituents, deadlines, and percussion assignments exist, but their corresponding frontend workflows have not been implemented yet.

**What the frontend reads and writes:**

| Table / view | Used by the app | App writes |
|---|---|---|
| `members` | id, name, slug, is_admin, must_change_password, user_id, sort_order | none |
| `songs` | id, name, type, is_medley, keys, tempo_start/end/change, duration_seconds, backing_track_manual, sort_order | `backing_track_manual` (admin) |
| `song_tasks` | song_id, task_key, status, updated_at | `status` (owner or admin) |
| `task_types` | key, label, category, owner_member_id, allowed_statuses, done_statuses, sort_order | none |
| `languages`, `song_languages` | code, short_label; song_id, language_code, position | none |
| `setlists` | id, name, description, created_at, created_by | insert / delete (admin) |
| `setlist_items` | id, setlist_id, position, item_type, song_id, label, note, break_seconds | insert / reorder / delete (admin) |
| `gigs` | id, name, event_date, start_time, location, setlist_id, notes | insert / update (admin) |
| `song_readiness` (view) | song_id, backing_track, ready | read only |
| `setlist_summary` (view) | setlist_id, song_count, total_seconds | read only |
| RPC `complete_password_setup` | | clears `must_change_password` |

Tables the plan describes but the frontend does not use yet: medley constituents, deadlines, percussion instrument picks, and the views `setlist_member_progress` and `setlist_deadline_list`.

## 8. Sign-in flow

1. Email + password via Supabase Auth.
2. The app finds the `members` row linked to that user. If none, sign-in fails with "not linked to a band member".
3. If `must_change_password` is true, the user sets a new password first (`auth.updateUser`, then RPC `complete_password_setup`).
4. The app loads all tables in parallel plus readiness, then shows the workspace.

## 9. The screens

Four tabs: **Songs** (searchable table, language filter, per-task status dropdowns, "You" vs "Band" progress bars), **Setlists** (ordered songs with readiness and total time; admin edit mode with add, remove, drag to reorder), **Gigs** (list and add/edit form), **Dashboard** (member picker, upcoming-gig vs all-songs scope, work widgets for Playback / Backing / Other, per-song cards grouped by task owner).

## 10. Hosting and repos

- **Public repo** `aaronmark2222/tsp-band-app-live`: static site on GitHub Pages (`index.html`, `app.js`, `styles.css`, `assets/the-string-project-logo.png`, `apple-touch-icon.png`). `app.js` loads supabase-js from `esm.sh` at runtime. No build step.
- **Deploy:** `.github/workflows/deploy.yml` runs on every push to `main` and publishes **only the files it explicitly copies**. Any new file must be added to that copy step.
- **Consolidated source repository:** the former private `aaronmark2222/tsp-band-app` was copied into this public repository, including `PLAN.md`, `SETUP_SUPABASE.md`, `docs/APP_GUIDE.md`, and all 12 numbered SQL migrations, then deleted after the transfer. The live app and database were already connected; the Supabase project was not duplicated or changed.
- Repository edits can be made through the connected GitHub tools. Prefer a dedicated branch for review; avoid committing directly to `main` when a change can trigger a production GitHub Pages deployment.
- Hosting model borrowed from Marks Music (static page on GitHub Pages + Supabase), but the band app needs **per-member Supabase Auth logins and row-level security** instead of Marks Music's shared password.
- Used mainly on iPhone as a Home Screen web app.

## 11. Known issues and open items

- **Resolved: iPhone Home Screen icon.** The deploy workflow copies `apple-touch-icon.png`; the user confirms the icon problem is fixed.
- **Resolved: login page.** The user confirms the login page works, including the first-login password setup flow.
- **Confirmed: task types.** The 18-task expansion is intentional.
- **Confirmed: readiness.** The readiness calculation works as intended; Parts do not block Ready.
- **Confirmed: Oct 30th setlist.** The 21-song live setlist is intentional and reflects real-life changes.
- Not implemented in the frontend yet: medley constituent management, deadline workflows, and percussion instrument assignment UI. Gamification remains later work.
- Do not treat the resolved icon/login issues or the old setlist count as open issues.

## 12. Decisions at a glance

- Core app first, gamification later; admin-only stable version first.
- Separate Supabase project in Aaron's account.
- Medleys stay one row, with a separate constituents table.
- Setlists stay simple: one per gig, Aaron edits.
- Parts do not block readiness. Ready = Backing Track Mixed + Ableset Completed.
- The official app name is **TSP Work**.
- Preserve the live 18-task configuration and the current Oct 30th setlist data.
- Keep this summary as a living Markdown document. Update the local copy and repository copy together at every meaningful work step.


## 13. Change log

### 19 Oct 2026 — baseline clarification and TSP Work rename

- User confirmed the iPhone icon issue is fixed and the login page works.
- User confirmed database structures for several future features exist, but their frontend workflows are not implemented yet.
- User confirmed the expanded 18 task types are intentional.
- User confirmed the Oct 30th setlist was deliberately changed to match real life; live database reports 21 songs and 1:53:56.
- User confirmed readiness works as intended.
- Connected live Supabase project `hzvfrvjuqvmkeqbrgmqu` reports `ACTIVE_HEALTHY`; 50 songs, 7 members, 18 task types, 6 languages, 1 setlist, and 1 gig.
- Current live setlist summary view calculates 21 songs, 6,836 seconds (1:53:56), and zero seconds of breaks.
- App display name requested: **TSP Work**. Repository name and Supabase project name are intentionally unchanged.
- Updated on branch `chore/tsp-work-name-and-summary`: browser title, mobile Home Screen app title, login eyebrow, workspace header, README heading/description, and GitHub Pages workflow display name now use **TSP Work**.
- Added this summary to the public frontend repository. The local Markdown copy and repository copy are intended to stay synchronized.
- The PR was merged to `main`; GitHub Pages deployment run 13 completed successfully. The GitHub repository name and Supabase project name remain unchanged.

### 19 Oct 2026 — repository consolidation

- Consolidated the formerly private `aaronmark2222/tsp-band-app` into the public `aaronmark2222/tsp-band-app-live` repository: copied the plan, Supabase setup guide, app guide, and all 12 numbered migrations. The frontend, logo, and styles were already identical between the repositories.
- Updated the public README to document the consolidated source files and project summary.
- Left the existing Supabase project and its production data unchanged; the live application already uses that same project. At inspection, it had 50 songs, 18 task types, one 21-song setlist, and seven tracked migration entries.
- The public repo now contains the band seed data and SQL migrations by request. The migration history for `0001`–`0005` does not appear in Supabase's current migration list; do not reapply those scripts to production without reconciling them first.
- The previous TSP Work branding and summary PR was merged to `main`, and its GitHub Pages deployment completed successfully.


### 19 Oct 2026 — private repository consolidation and deletion

- Copied the private repository's project plan, setup guide, app guide, and all 12 numbered migrations into the public `aaronmark2222/tsp-band-app-live` repository.
- After transfer verification and account-owner verification, permanently deleted `aaronmark2222/tsp-band-app` as requested.
- The existing Supabase project and its production data remained unchanged.

### 19 Oct 2026 — compact song work rings

- Replaced the long per-song “You” and “Band” progress bars on the Songs and Setlists views with a compact concentric ring indicator. The inner orange ring represents the signed-in member's completed work; the outer gray ring represents completed band work. The unfilled arc shows work remaining.
- Added an accessible label and tooltip with completed and remaining task counts for both scopes. Songs-table ring placement is narrow-screen friendly, and the table can fit small phone widths without its previous fixed minimum width.
- This is a presentation-only change; task ownership, completion rules, readiness, and Supabase data are unchanged.

### 19 Oct 2026 — Ableton-style song disclosure icons

- Added a circled triangle before every expandable song entry in the Songs and Setlists views. It points right while collapsed and down while expanded, matching the supplied Ableton track reference.
- The icon follows the existing expanded/collapsed state and screen-reader state; no song data or task behavior changed.

### 19 Oct 2026 — song list icon sizing and alignment

- Reduced the Ableton-style circled disclosure icon so it sits smaller than the song title, and positioned it directly before the title after the song ID in both Songs and Setlists.
- Centered the Songs table’s Work Remaining header above the centered progress ring.

### 19 Oct 2026 — readiness colors in the Status column

- Replaced the separate Ready column in the Songs table with a single **Status** column showing the ring indicator.
- Songs that meet the existing readiness rule now use green and dark-green rings. When all required non-optional work is complete and the only remaining readiness blocker is the backing track's **Sent to Mix** state, the rings use blue and dark blue.
- All other songs keep the existing personal/band progress colors. Readiness calculations and database values are unchanged.

### 19 Oct 2026 — status labels and original progress-ring colors

- Restored the standard orange/gray personal and band progress rings for songs that are still in progress.
- When all readiness conditions are met, the Status cell now says **Ready** in green. When the only blocker is the backing track being **Sent to Mix**, it says **Sent to Mix** in the matching blue status style. Neither state recolors the rings.
- Moved the collapsed/open triangle indicator before the song ID in both Songs and Setlists.

### 19 Oct 2026 — responsive song-title initials

- Song titles remain on one line beside their IDs. When a full title no longer fits, the view switches to initials, preserving slash-separated medley groups (for example, “You Belong With Me / Love Story” becomes “YBWM / LS”).
- The full name remains available through the row's accessible label. The behavior updates when the screen is resized and applies in both Songs and Setlists.


## 2026-10-19 UI update
- Expanded song rows in Songs and Setlists display the full song title, wrapping as needed; collapsed narrow rows continue to use initials when the full title would overflow.
- Opening a song scrolls its expanded details into view.



## 2026-10-19 UI update
- In expanded song details, each viewer's own unfinished task is highlighted with the same muted orange accent used for personal progress. Task ownership follows the assigned member, including the existing Recorded-status admin ownership rule.



## 2026-10-19 UI refinement
- Updated the personal unfinished-task highlight to use a solid #f39a26 card, matching the personal progress ring, with black task-label text. Status controls retain their existing appearance and colors.



## 2026-10-19 UI correction
- Strengthened the solid orange fill for personal unfinished task cards across focus and hover states, preserving the status controls' existing appearance.
- Changed song expansion scrolling to align the overview row below the sticky header so the title and metadata remain visible.



## 2026-10-19 UI adjustment
- Optional Band Parts tasks are excluded from the personal orange unfinished-task highlight.



## 2026-10-19 UI adjustment
- Setlists song IDs now use the same accent color as Songs. Both lists use matching disclosure, fixed-width ID, and title columns for consistent ID and title alignment.



## 2026-10-19 UI adjustment
- Centered song IDs in both Songs and Setlists.
- Moved each Setlists song order number to the top-right of its row and reduced left padding around its disclosure icon, ID, and title.



## 2026-10-19 UI adjustment
- Aligned Setlists progress rings and Ready/Sent to Mix indicators in a shared fixed-width column.



## 2026-10-19 Dashboard fix
- Connected the Playback, Backing, and Other Work widget status controls to the shared save flow. Completing an item now saves it, refreshes readiness, and removes it from remaining work; Completed keeps its green status styling.


## 2026-10-20 Dashboard adjustment
- Dashboard work groups now exclude optional Parts tasks when determining a member's required-work categories.
- Members assigned only backing work see only Backing Work; members whose only required category is a non-playback, non-backing task such as Guitar MIDI see a single Work Remaining group. Members with multiple categories retain Playback Work, Backing Work, and Other Work as applicable.
