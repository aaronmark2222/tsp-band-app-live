# TSP Work — The String Project

A band workspace for tracking song work and performance setlists. **The GitHub repository is public; the deployed app requires a linked Supabase Auth account.** The repository contains the static frontend, project summary, product plan, Supabase setup notes, app guide, and SQL migrations.

## Start here

- [Current implementation context](docs/CURRENT_STATE.md) — app architecture, deployment, data-model references, and a checklist for future changes.
- [Project summary](TSP%20Band%20App%20Summary.md) — product behavior, confirmed decisions, and change log.
- [App guide](docs/APP_GUIDE.md) — screens, data flow, permissions, and maintenance notes.
- [Product plan](PLAN.md) — goals, roadmap, data-model decisions, and original requirements.
- [Supabase setup guide](SETUP_SUPABASE.md) — historical initial project bootstrap guidance; reconcile with live migration history before production database work.
- [Database migrations](supabase/migrations/) — schema, security policies, reference data, and imports. These files do not all correspond one-for-one with the live project's migration ledger.

## Run locally

Serve the repository root with a static web server. For example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The frontend reads the Supabase project URL and public publishable/anon key from `app.js`. These are client-side public values; **never put a `service_role` key in this repository**.

## Deploy

GitHub Actions deploys the static app to GitHub Pages when code is pushed to `main` or by manual workflow dispatch. The workflow publishes only the app files and required images. The app expects the Supabase schema and data to exist already; it does not run migrations or change database security settings.

## Current app behavior

- Band members sign in with email and password. The signed-in Supabase Auth user is matched to a row in `members`.
- New members use their email as the username and must replace their temporary password at first sign-in before app data loads.
- The Songs screen shows progress first. Click a song name to reveal its type, languages, duration, and task statuses.
- The Dashboard shows a selected member's Playback, Backing, and Other work for the next gig (Oct 30th) or the full repertoire, with a picker to view any band member. Parts remain optional, songs waiting on a mix stay at the end, and Corrections is unfinished work.
- Combine text search with language, single/medley, and key filters; sort by name, performance type, key, duration, remaining band work, or readiness.
- Song progress shows unfinished work for the current member and for the band. `No` means not applicable; completion rules come from each task type's `done_statuses` in Supabase.
- Task owners are stored on `task_types.owner_member_id`; the Dashboard uses these assignments to show each member's remaining tasks.
- The Setlists screen shows the running order, song duration, gig details, and running-time summary. Songs can be expanded to see their task details.
- Setlist search and the language, single/medley, and key filters narrow the visible songs without changing their saved order.
- Setlists are read-only by default. Aaron's admin account can choose **Edit setlist** to create a setlist, add or remove songs, and drag songs into order.
- Supabase row-level security is the authority for which records a user can read or change. The UI also disables task controls the current member cannot edit.

See [the current implementation context](docs/CURRENT_STATE.md) and [the app guide](docs/APP_GUIDE.md) for the full picture.
