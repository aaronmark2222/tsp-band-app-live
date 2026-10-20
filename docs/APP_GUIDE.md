# TSP Band App: how it works

This is the working guide to the current app. Keep it in sync with changes to the app and database. The repository is intended to contain the code and the information needed to understand and maintain it.

## What the app is for

The app replaces the band's master setlist spreadsheet with a shared view of song details, member-owned work, and gig setlists. Every signed-in band member can see overall song progress. Members update tasks assigned to them; the Aaron account is the administrator and can update every task and manage setlists.

The current app is a static, single-page frontend. Supabase provides password authentication, Postgres data, and row-level security (RLS). The browser talks directly to Supabase using the public project URL and publishable/anon key in `app.js`. The app does not contain a server and never needs a `service_role` key.

## Repository map

| Path | Purpose |
|---|---|
| `index.html` | Page structure, login form, navigation, song and setlist views. |
| `app.js` | Supabase client, authentication, data loading, rendering, task updates, and admin setlist actions. |
| `styles.css` | Layout, colors, responsive behavior, progress bars, and interaction states. |
| `PLAN.md` | Product goals, roadmap, decisions, roles, and the original data model. |
| `SETUP_SUPABASE.md` | Beginner instructions for creating the Supabase project, running SQL, and linking the admin login. |
| `supabase/migrations/0001_schema.sql` | Database types, tables, triggers, helper functions, and views. |
| `supabase/migrations/0002_security.sql` | RLS policies and database-side access rules. |
| `supabase/migrations/0003_reference_data.sql` | Initial members, languages, task types, and percussion instruments. |
| `supabase/migrations/0004_import_master_setlist.sql` | Initial songs, song tasks, Oct 30 setlist, and gig. |
| `supabase/migrations/0005_guitar_tone_midi.sql` | Adds the AbleSet Guitar Tone Midi task and its initial ALS-derived song statuses. |
| `supabase/migrations/0006_split_ableset_tasks.sql` | Replaces AbleSet with Sections, Lyrics, and Chords, creates Utility with Guitar Tone Midi and Prompts, and updates readiness. |
| `supabase/migrations/0007_optional_parts_dashboard_readiness.sql` | Makes Parts optional for readiness and defines the required-work completion rules used by the Dashboard. |
| `supabase/migrations/0008_dashboard_all_songs_readiness.sql` | Keeps songs without task rows in the readiness view so repertoire totals include every song. |
| `supabase/migrations/0009_readiness_null_safe.sql` | Ensures readiness returns a definite true or false value when a song has no backing override. |
| `supabase/migrations/0010_corrections_remain_incomplete.sql` | Removes Corrections from task completion rules so it continues to count as unfinished work. |
| `supabase/migrations/0011_oct_30_setlist_and_guitar_tone_owner.sql` | Assigns Guitar Tone Midi to Rowen and replaces the Oct 30th setlist with the supplied 21-song order. |
| `supabase/migrations/0012_first_login_password_setup.sql` | Adds a first-login password change requirement for newly linked member email addresses. |

The migration files are the detailed source for database structure and seed data. Apply them only as described in `SETUP_SUPABASE.md`; the frontend does not apply them.

## Sign-in and access

1. A member signs in with the email and temporary password created in Supabase Authentication. Their email address is their username.
2. `app.js` looks up the matching `members` row by `user_id`.
3. If no member row is linked, the app cannot identify the user's band membership and does not load the app data.
4. New email links set `members.must_change_password`. The app requires the member to choose a new password before loading band data. `complete_password_setup()` clears this one-time flag for the signed-in account.
5. Once identified and through first-login setup, the app loads songs, tasks, task types, languages, setlists, gigs, and member names. The database RLS policies decide which requests are allowed.

To onboard a member, an admin adds that person's email to `member_emails` first, then creates the Auth account with the same email and a temporary password. The email-link trigger marks the member for a required password change at first sign-in. Give each member their temporary password privately; do not store passwords in the repository.

Task ownership is stored in `task_types.owner_member_id`, a reference to `members.id`. The same task type and owner assignment applies to each song; the Dashboard groups each song's remaining work under that member. The signed-in member's tasks are marked **You**.

Public sign-ups should remain disabled. New accounts are created by the administrator and linked to the appropriate member record as described in the setup guide. The browser key is public by design; database safety comes from RLS and Supabase Auth, not from hiding that key.

## Songs screen

The Songs screen prioritizes the two compact progress indicators for “You” and “Band.” The collapsed overview shows the song ID and name, remaining work, and readiness. Click the song name to expand its type, languages, duration, backing-track state, and task list. The status controls are enabled only for tasks owned by the signed-in member or for the administrator. The status menu stays dark while each choice previews its own status accent.

The interface uses Ableton Live 12's charcoal surfaces, compact controls, and task accents sampled from the user's Live screenshots. The mapping is in `app.js` (`ABLETON_TASK_COLORS`): Sections charcoal `#3C3C3C`, Lyrics and Dale backing vocals pink `#EB4CCE`, Chords yellow `#F7F48D`, Guitar Tone Midi and Guitar orange `#E5742E`, Prompts and backing percussion coral `#D36E60`, backing Music and Keyboard green `#77FB58`, Anston backing vocals and VOX purple `#5E4CA7`, SFX gray `#D0D0D0`, Bass blue `#4BA1E8`, Violin purple `#836DDD`, Percussion red-brown `#A13D38`, Drums red `#EB4A41`, and Dale VOX pink-purple `#CA72DE`.

Task status controls keep their dark Ableton-style surfaces. The supplied status screenshot colors appear as text and border accents: Completed green, Incomplete red, Corrections and Recorded peach, Draft and Review yellow, and No gray. Corrections always remains unfinished, even for task types whose older completion settings included it. Review uses the Draft yellow because it was not shown in the screenshot.

Language chips and language filter choices use accents derived from the `LANGUAGE` track's clip colors in `TSP LIVE MASTER PROJECT.als`. English, Hindi, Konkani, and Kannada have explicit named clips. Tamil and Malayalam are not distinguished on that track; the app uses close gray variants for those two languages, based on the track's `Other` clip color. The palette index/color mapping is kept in `app.js` (`LANGUAGE_COLORS`).

Admins can use **Add song** on the Songs page to open the repertoire editor. The setlist count card is intentionally omitted from this page.

The expanded song details label the control **Backing Track**. Admins can choose `Auto`, `Sent to Mix`, or `Mixed`; the Auto menu option is gray, while the closed control displays only its derived `Finished` or `Not Finished` status. Selecting Auto clears the manual override and lets the `song_readiness` view derive its status from backing tasks. Not Finished is red, Finished is peach, Sent to Mix is blue, and Mixed is green. Non-admin members can view but not change this value.

## Dashboard

The Dashboard has two scopes. The first tab follows the next upcoming gig that has a setlist (currently **Oct 30th**) and lists each song on that setlist. The Oct 30th setlist currently contains 21 songs in the new running order saved in Supabase. **Total Setlist** includes every song in the repertoire. A member selector switches the personal work widgets between any band's member; each member's outstanding work is grouped into Playback (AbleSet and Prompts), Backing, and Other (including Guitar Tone Midi). Within each widget, a song appears once with its open tasks listed underneath. Playback and Backing widgets appear only for members assigned work in those categories; Other appears only when there is outstanding miscellaneous work. The summary shows Personal tasks left, Band Required Tasks Left, and Songs Ready above the work widgets and per-song list. Task controls remain governed by the signed-in user's ownership/admin permissions, so choosing another member's dashboard does not grant access to edit their tasks. The song list below the widgets still shows each song's team-wide work and readiness, with the viewed member highlighted. Selecting a song name opens that song in Songs.

When any task is set to `Recorded`, it is assigned to the administrator (Anston) for the remaining quantizing, pitch correction, and project placement work. It remains unfinished and appears in Anston's Other Work until completed. Anston can update a Recorded task from the Dashboard or song task controls.

Parts remain tracked and editable on the Songs screen, but are optional: they do not count toward personal or band remaining-work totals and do not prevent readiness. The Dashboard keeps unfinished Parts available in a collapsed **Optional Parts** section. All other task types, including AbleSet, Utility, backing tracks and vocals, are required. A required task is complete when its status is in that task type's `done_statuses` or is `No`. A song is ready when all required tasks are complete and its Backing Track is `Mixed`, or is automatically `Finished` with no manual override. `Sent to Mix` blocks readiness while waiting for the mix to return, but is not counted as remaining work; those songs are placed at the end of either Dashboard list.

AbleSet work is tracked as three tasks: Sections, Lyrics, and Chords. Instrumental songs have Lyrics set to `No`. Utility contains Guitar Tone Midi and Prompts. These binary tasks display `Complete`/`Incomplete`, stored as `Completed`/`Incomplete` in the database. If the old AbleSet task was `Completed`, Sections, Chords, and Prompts carry over as completed; vocal Lyrics also carry over as completed. If the old task was `Incomplete`, the new applicable tasks start incomplete. Guitar Tone Midi is assigned to Rowen, the guitarist; Prompts inherits the old AbleSet owner.

Guitar Tone Midi's initial statuses were derived from the `GUITAR TONE Midi` MIDI track (Ableton track ID 2239) in the supplied `TSP LIVE MASTER PROJECT.als`: a song is Complete when at least one MIDI clip on that track falls inside its named song locator range. Migration `0005_guitar_tone_midi.sql` records that initial Ableton audit.

The band identity mark is `assets/the-string-project-logo.png`, a cropped transparent version of the supplied logo with white lettering. It appears on the sign-in screen and in the workspace header.

Search stays visible; the **Filters** button expands or collapses the other controls, which start collapsed. Search and filters work together: search by song name/ID, language, performance type (single or medley), and stored key/scale. The sort menu offers master-list order, name A–Z/Z–A, singles then medleys, key, shortest/longest duration, most/least band work left, and ready first. **Clear filters** resets search and filter choices to the master-list order. Songs with more than one language or key match when any value matches the selected filter.

When a member changes a task status, the app updates the corresponding `song_tasks` row. When an admin changes the backing-track status, the app updates `songs.backing_track_manual`. If Supabase rejects an update, the UI restores the previous selection and displays an error. The database policy remains the final check even if someone bypasses the UI.

## Progress calculation

Each song has task rows described by `task_types`:

- **You** counts applicable tasks assigned to the signed-in member.
- **Band** counts applicable tasks across all members.
- A task with status `No` is excluded as not applicable.
- A task counts as done when its current status appears in that task type's `done_statuses` list, except `Corrections`, which always remains unfinished. Other statuses—including in-progress, review, draft, and recorded states unless explicitly marked done—remain in the unfinished count.
- The displayed “remaining” value is a count of task items, not an estimate of hours or effort.

Song readiness is shown from the database's `song_readiness` view. All applicable non-Part tasks (including AbleSet and Utility) must be completed or marked `No`; `Corrections` is always unfinished. Parts are optional and do not affect readiness. A Backing Track set to `Sent to Mix` still prevents readiness but is not counted as an actionable remaining task. Songs waiting for a mix are sorted to the end of either Dashboard list. Do not replace the database readiness rule with a frontend-only calculation.

## Setlists screen

Members can choose a setlist and view its gig information, ordered songs, total song count, and running time. Search stays visible and the **Filters** button expands or collapses the language, single/medley, and key/scale filters. These filters narrow the visible items without changing the saved order. Clear filters before dragging to reorder the full setlist. Click a song name in the setlist to expand the same type, languages, duration, task details, and progress shown on the Songs screen. Task and Backing Track statuses changed here update the same database rows as on the Songs screen.

Setlist structure starts in read-only mode. Only an admin sees **Edit setlist**. In edit mode the admin can add or remove songs and drag songs to reorder the running order. These edits are staged in the page: the edit control says **Done editing** when nothing changed and changes to **Save** after an edit. Clicking **Save** writes additions, removals, and the final order to `setlist_items`, then exits edit mode. **Discard changes** abandons staged edits. The Songs page no longer shows the setlist count card. The app currently does not expose controls for adding breaks or notes, even though the schema retains the legacy item types for compatibility.

## Gigs screen

The Gigs screen lists performances with their date, optional start time, location, notes, and attached setlist. Admins can create and edit gig records. Creating a gig also creates a new, initially empty setlist named after the gig and attaches it to that gig. When editing an existing gig, the admin can select which existing setlist is attached. The attached setlist name opens that setlist in the Setlists screen. Creating or editing gigs changes the `gigs` and `setlists` rows; permissions are enforced by the database's admin-only write policies. The current Oct 30th gig is linked to the Oct 30th setlist.

## Data map

The migrations define the complete schema. The main relationships used by the current frontend are:

- `members` identifies band members, admin status, and their linked Auth user.
- `songs` stores song identity and overview details; `song_languages` links songs to `languages`.
- `task_types` defines task labels, owners, editable statuses, and completion statuses; `song_tasks` stores each song's current status per task type.
- `task_types.owner_member_id` stores which member is responsible for each task type.
- `song_readiness` derives backing-track and ready state; Parts are excluded from its readiness calculation.
- `setlists` stores setlist names; `setlist_items` stores ordered songs; `gigs` links a performance to its setlist and date/location.
- `setlist_summary` derives a setlist's song count and running time.
- `member_emails` stores the admin-managed email association separately from public member data. Other tables, constraints, triggers, policies, and helper views/functions are documented in the SQL migrations and `PLAN.md`.

## Local use and deployment

1. Complete Supabase setup using `SETUP_SUPABASE.md`.
2. Set `SUPABASE_URL` and the public `SUPABASE_KEY` constants in `app.js` to the values for the intended project. Never use the database password or `service_role` key here.
3. Serve the repository root with a static server, for example `python3 -m http.server 8000`, and open `http://localhost:8000`.
4. For deployment, enable GitHub Pages for the repository root on `main`. The app and Supabase project are separate: publishing the frontend does not install or update database migrations.

## Change and maintenance rules

- Keep product decisions and roadmap changes in `PLAN.md`, user-facing database setup in `SETUP_SUPABASE.md`, and implementation behavior in this guide.
- Keep schema/security/data changes as ordered SQL migrations under `supabase/migrations/`. Review destructive SQL and its impact before applying it to a live project.
- Preserve RLS as the access-control boundary. Do not add privileged service-role credentials to frontend code, repository files, issues, or chat.
- When adding a task type, check its owner, allowed statuses, `done_statuses`, and the progress display. When changing a permission rule, update both the policy migration and this guide.
- The app is a static frontend with no build step or package manifest currently required. Its Supabase JavaScript client is imported from `esm.sh` in `app.js`.

## Current scope and next roadmap items

The current code provides password sign-in, member lookup, song search/filtering, expandable task details, task-status updates, progress summaries, gig/setlist viewing, and admin setlist editing. The product plan records later work such as medley constituents, more complete gig/deadline workflows, deployment/inviting members, and gamification. Treat `PLAN.md` as the roadmap authority and update it when a roadmap item changes.
