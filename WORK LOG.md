# TSP Work — public project status

_Last reconciled: 11 November 2026._ This public status page summarizes the project. Machine-specific paths, member activity details, and operational history remain in the private local handover log.

## Current state

- GitHub Pages serves the static frontend from `main`; the app requires a linked Supabase Auth account.
- Supabase is healthy. The live ledger has 32 migrations through `20261110191303_admin_edit_all_lyrics_tracks`; the public schema inspection returned 26 tables with RLS enabled.
- The active Edge Functions are `practice-audio` v7 and `member-access-admin` v8. Their deployed source matches the repository.
- The private Cloudflare R2 bucket `tsp-practice` contains 655 practice-audio objects. The app accesses them through signed links; public bucket access is disabled.
- The Ableton bridge is local to the band administrator's Mac. The current source is TSPWork 1.26 and targets the main set through a guarded workflow.

## Reconciliation note — 11 November 2026

The local handover folder now includes the repository's SQL migration source set and copies of the deployed Edge Function source. The local app snapshot contains newer lyrics-sync behavior than `main`; the proposed source reconciliation is on a review branch and has not been deployed. No Supabase rows, R2 objects, or Ableton set contents were changed during this review.

Use `APP_PLAN.md` and live service state for future work. Review historical documents before relying on dates, counts, roadmap items, or implementation status recorded there.