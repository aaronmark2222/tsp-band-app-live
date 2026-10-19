# TSP Band App — Agenda & Plan

_Living document. Updated at every step._

## Goal
A web app (Supabase + GitHub only, same approach as the "Marks Music" app) replacing the Master Setlist sheet:
- Every member can **view** all progress on all work.
- Each member can **edit only the work assigned to them**; Aaron (admin) can view and edit everything.
- Gigs and setlists: create a gig (name, date, location, setlist), build setlists from songs, see total running time, and a personalised "work remaining / done" overview per setlist.
- Deadlines at every level (per gig/setlist, per song, per task type).
- **Gamification comes later**, once the core app is stable.

## Roadmap
| # | Step | Status |
|---|------|--------|
| 1 | Read sheet, map columns, ask questions | **Done (round 2 answers received)** |
| 2 | Lock data model + roles/permissions + status rules | **Done** |
| 3 | Supabase schema + RLS + CSV seed import | **Done, tested locally** (`tsp-band-app/supabase/migrations`) |
| 3b | Create the band's own Supabase project and load the schema/data | **In progress** (`tsp-band-app/SETUP_SUPABASE.md`) |
| 4 | Frontend: single static page, Aaron-only login first, song table, edit statuses, setlist builder | Next |
| 4b | Member logins and per-member "my work" | Later (after the stable admin version) |
| 5 | Medley constituents tab | Todo |
| 6 | Gigs, setlists, running time, deadlines, per-setlist overview | Todo |
| 7 | Deploy (GitHub + Supabase), invite members, retire the sheet | Todo |
| 8 | Gamification (points, streaks, badges, leaderboards) | Later |

## Decisions so far

### Song IDs (typed manually by the admin when a song is added)
- `I` Instrumental · `E` English single · `EM` English medley (2+ songs) · `H` Hindi single · `HM` Hindi medley · `K` Konkani single · `KM` Konkani medley · `EHM` English+Hindi medley · `EHKM` English+Hindi+Konkani medley. Followed by a number (E1, EM6, ...).
- **Languages are a flexible, multi-select list** managed in the app: existing Eng, Hin, Kon, Kan(nada), plus **Tamil (T), Malayalam (M), Kannada (Kn)**. The admin can add more and picks a new ID code; the app must reject codes that conflict with existing ones.
- The old "Oth" value goes away and is migrated to real languages.

### Medleys
- A medley is one row in the main song list (as today).
- A separate table holds the **constituent songs** of each medley (one row per song, linked to the medley) as ground-level data.

### Tempo
- `90 to 82`: starts at the first value, ramps down mid-song, then stabilises at the second value.
- `148 & 116`: starts at the first value and switches immediately at one point to the second.
- Stored as structured data (start tempo, end tempo, change type: ramp or jump) and shown in the sheet's familiar notation.

### Durations
- Setlists show total running time (at the end of the setlist and in the setlist selector description).

### Status columns
- Statuses: Incomplete, Completed, No (not applicable), Corrections, Review, Draft, Recorded.
- Backing Track: Not Finished -> Finished -> Sent to Mix -> Mixed.
  - Not Finished = not produced. Finished = produced. Sent to Mix = sent to external mix engineer. Mixed = mixed tracks received and placed in the master Ableton project.
  - Auto: starts Not Finished; becomes Finished once all other Backing columns are Completed or No; Sent to Mix and Mixed are set manually by Aaron.
- Ready: auto-Yes when Backing Track = Mixed, Ableset = Completed, and all Part columns are Completed or No (rules unchanged).
- Ableset: Completed / Incomplete, set by Aaron (section tracks, lyrics tracks, other Ableset work in the master Ableton project).
- Backing Music, Backing Percussion, Backing SFX: produced by Aaron in the master Ableton project.
- Dale / Anston Backing Vocals: first recorded by them, then warped, tuned and placed in the project by Aaron (hence the extra states).
- Part columns: "Completed" = the member has recorded their part and it exists in the Ableton project. It is a reference for what they play and lets everyone listen to the full performance with the other Parts and Backing Tracks.

### Who owns what (from the sheet's per-member tabs)
| Member | Role | Columns they edit |
|---|---|---|
| Aaron (admin) | Bassist, playback engineer | Ableset, Backing Music, Backing Percussion, Backing SFX, Bass Part, Backing Track, Ready; can edit everything |
| Dale | Female singer | Dale Backing Vocals, Dale VOX Part |
| Anston | Male singer, violinist | Anston Backing Vocals, Anston VOX Part, Violin Part |
| Rowen | Guitarist | Guitar Part |
| Albert (Milton) | Keyboardist | Keyboard Part |
| Gautham | Percussionist | Percussion Part + per-song percussion instrument pick (Chimes, Darbuka, Timbale, Bongo, Congo, Tak, Cowbell, Tambourine, Stack Cymbal, Floor Tom, Dholak, Shaker) |
| Nishanth | Drummer | Drums Part |

### Gigs, setlists, deadlines
- A **Gig** table stores: name, date, location, setlist. First gig: **Oct 30th** (setlist "Oct 30").
- The Oct 30th Yes/No column becomes membership in that setlist.
- Deadlines: keep all options open: per gig/setlist, per song within a setlist, per task type.

### Access
- Each band member logs in separately, views all progress, edits only their own work. Aaron views and edits everything.

### Tech
- Supabase + GitHub only (no other services), like Marks Music.
- Marks Music (read from its repo): one static page in `site/`, published from the `gh-pages` branch; a Supabase Edge Function checks one shared app password and talks to a private `mm` schema; no per-user logins.
- The band app needs per-member logins and per-member edit rights, so the shared-password model is not enough. Planned: same hosting (single static page on GitHub Pages) + Supabase Auth and the row-level security already written in step 3.
- **Decided:** a new, separate Supabase project in Aaron's own account (keeps guitar-student data apart).
- **Build order:** stable version first with Aaron as the only login; member logins come later (the permission rules are already in the database).

## Decisions (round 3)
- Malayalam code is **Ml**; Tamil **T**; Kannada **Kn**. Codes = one capital + lowercase; `I` and `M` reserved so IDs always parse unambiguously.
- "Oth" replaced (my reading, please confirm): I1 Kesariya/Pavizha = Hindi + Malayalam; I3 and I4 = Tamil; I5 Pachai Nirame/Zara Zara = Tamil + Hindi.
- Every member can set their own columns to any allowed status; Aaron can set anything anywhere. Only Ready is automatic.
- Gautham's instruments: several per song, visible to all, editable by Gautham and Aaron only.
- Medley constituents table: name, language, original artist, key, tempo, order, duration.
- Setlists are simple ordered lists (songs, breaks, notes, per-song notes). Duplicate a setlist to reuse it; each gig has its own setlist.
- Deadlines: the gig date is the major deadline; any other deadlines attach to a setlist (optionally narrowed to a song, task type or member).

## Built in step 3
- `0001_schema.sql`: tables, triggers, views (`song_readiness`, `setlist_summary`, `setlist_member_progress`, `setlist_deadline_list`), `duplicate_setlist()`.
- `0002_security.sql`: row-level security (read = linked members; write = task owner or admin).
- `0003_reference_data.sql`: 7 members, 6 languages, 14 task types, 12 percussion instruments.
- `0004_import_master_setlist.sql`: 50 songs, their statuses, and the Oct 30 setlist (26 songs) + Oct 30th gig.
- Tested: import matches the sheet (Backing Track derives correctly for all 50 songs, Ready false everywhere, Oct 30 total 2:12:34); members can edit only their own tasks; non-members see nothing.

## Step 4 prerequisites
- Decide project: separate Supabase project vs. shared with Marks Music.
- Create a GitHub repo for the band app (gh-pages hosting, like Marks Music).
- Supabase: turn off public sign-ups; add each member's email.
- Never paste the Supabase `service_role` key anywhere; the page only ever uses the public anon key.

## Confirmed by Aaron
- "Oth" replacements are right (I1 Hindi+Malayalam; I3, I4 Tamil; I5 Tamil+Hindi).
- Oct 30th gig keeps only name, date and setlist for now.
- "Done" = Completed (+ Corrections for Backing Vocals), Recorded shown separately.
- Only Aaron edits setlists.

## Assumptions (still open)
- Oct 30th gig dated **2026-10-30**, no location yet; its setlist uses sheet order.
- "Done" = Completed (plus Corrections for the two Backing Vocals columns); "Recorded" is shown separately as waiting for Aaron.
- Setlists, gigs and deadlines are admin-only to edit for now (members read them).
- Backing Track "Finished" = every backing column Completed or No (matches all 50 rows in the sheet).

## Next
Aaron creates the Supabase project following SETUP_SUPABASE.md and sends the Project URL + anon/publishable key.

## Changelog
- Step 1: CSV read, columns mapped, round 1 questions asked.
- Step 3: Schema, security rules, reference data and CSV import written and tested; README added.
- Step 2: Round 1 answers + validation sheet received. Roles, ID scheme, tempo notation, status workflow, gigs and deadlines recorded above.
