# TSP Work — The String Project

TSP Work is the band's private web workspace for song tasks, gigs, setlists, practice audio, lyrics, and Ableton review. The GitHub repository is public; signing in to the app requires a linked Supabase Auth account.

## Current source of truth

- **[App Plan](APP_PLAN.md)** is the current architecture and operating reference. Its live-state header was reconciled against the repository, Supabase, the Edge Functions and the Mac's TSPWork on 13 November 2026.
- **[Ableton lyrics sync runbook](ABLETON_LYRICS_SYNC.md)** covers the guarded Practice-to-Ableton writeback workflow.
- **[Supabase migrations](supabase/migrations/README.md)** describe repository SQL history. The live migration ledger decides what has actually been applied; do not replay bootstrap or historical files against production.
- `docs/APP_GUIDE.md`, `docs/CURRENT_STATE.md`, `docs/SYSTEM_MAP.md`, and the older planning/setup documents are historical background. Follow `APP_PLAN.md` for current behavior and recheck live services before changes.

## Application

The app is a static site (`index.html`, `app.js`, `boot.js`, `styles.css`, `sw.js`, `vendor/`, and assets) with no build step. GitHub Actions deploys the root app files to GitHub Pages from `main`. Pushing frontend changes to `main` deploys them to the band; use a review branch for proposed changes.

The browser uses a public Supabase client key. Service-role credentials and R2 signing credentials belong only in Supabase function secrets. The `practice-audio` function mediates access to the private R2 bucket using signed links.

## Repository layout

- `app.js`, `boot.js`, `index.html`, `styles.css`, `sw.js`, `vendor/`, `assets/`: deployed frontend.
- `tests/`: Node tests for the frontend (run by GitHub Actions before every deploy).
- `supabase/functions/`: Edge Function source.
- `supabase/migrations/`: bootstrap and forward migration source files; some are historical and do not correspond one-to-one with the current ledger.
- `tools/ableton-remote-script/`: TSPWork control surface and its tests.
- `APP_PLAN.md`: current engineering reference.

For local preview, serve the repository root with a static web server. Never put service-role keys, passwords, R2 keys, or tokens in Git.