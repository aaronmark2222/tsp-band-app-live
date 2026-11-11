# TSP Band App local handover

Start with [APP_PLAN.md](APP_PLAN.md) for the current engineering and service map, reconciled against live Supabase and Cloudflare state. Then read [APP_GUIDE.md](APP_GUIDE.md) for the human-friendly product, workflow, local-file, and troubleshooting guide.

For active history and point-in-time fixes, read [WORK LOG.md](WORK%20LOG.md). For Ableton lyrics writeback steps and safeguards, read [ABLETON_LYRICS_SYNC.md](ABLETON_LYRICS_SYNC.md). This folder is a working collection rather than a Git checkout. Production frontend source is in GitHub repository `aaronmark2222/tsp-band-app-live` (`main`). The local frontend snapshot contains newer guarded lyrics-sync changes than current `main`; those changes are being prepared on a review branch and have not been deployed.

The live Ableton lyrics target is `/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als`. The TSPWork bridge is local to Aaron’s Mac and hardcodes that allowlisted path.
