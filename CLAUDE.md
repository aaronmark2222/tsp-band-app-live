# For AI assistants working on this repo

Read **[APP_PLAN.md](APP_PLAN.md)** first: sections 0–4 (how to resume, systems, locations, standing rules).
It is the master document for TSP Work; the other docs are historical.

Hard rules (details in APP_PLAN.md §4):
- Never modify or save Aaron's Ableton `.als`; read it read-only when asked.
- Never put service_role / R2 keys or any secret in this public repo or the browser code.
- Pushing to `main` deploys to the whole band: `node --check` a module copy of app.js and bump `?v=` in index.html first.
- New Supabase migrations: apply, then save as `supabase/migrations/<live version>_<name>.sql`.
- When Aaron says **"Update App Plan"**, follow APP_PLAN.md §0.
