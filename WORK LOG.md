# TSP Work — public project status

_Last reconciled: 11 November 2026._ This public status page summarizes the project. Machine-specific paths, member activity details, and operational history remain in the private local handover log.

## Current state

- GitHub Pages serves the static frontend from `main`; the app requires a linked Supabase Auth account.
- Supabase is healthy. The live ledger has 32 migrations through `20261110191303_admin_edit_all_lyrics_tracks`; the public schema inspection returned 26 tables with RLS enabled.
- The active Edge Functions are `practice-audio` v7 and `member-access-admin` v8. Their deployed source matches the repository.
- The private Cloudflare R2 bucket `tsp-practice` contains 655 practice-audio objects. The app accesses them through signed links; public bucket access is disabled.
- The Ableton bridge is local to the band administrator's Mac. The current source is TSPWork 1.26 and targets the main set through a guarded workflow.

## Reconciliation note — 11 November 2026

The local frontend copies now match GitHub `main` commit `9ab342c5e4a8760f30619626325d21098e7f6d35`, including the service worker and deployed assets. TSPWork 1.27 is in the repository, including guarded handling that preserves independent Live edits on clips Practice did not change. Supabase has 32 applied migrations, 26 public tables with RLS, and the deployed `practice-audio` v7 / `member-access-admin` v8 functions match repository source. The private R2 bucket has 655 objects (3,137,519,522 bytes), matching `practice_audio_state`. The Save suffix is local to the Mac app connected to the master project. No Supabase data or R2 objects were rewritten.

Use `APP_PLAN.md` and live service state for future work. Review historical documents before relying on dates, counts, roadmap items, or implementation status recorded there.