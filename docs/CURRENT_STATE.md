# Current implementation context

This note summarizes information already documented in the public repository. It does not record private account details, live database contents, credentials, or security scan results. Check the connected Supabase project directly before relying on assumptions about its current state.

## Architecture

- This repository is a **public** GitHub Pages static-site repo. The deployed app requires an account linked through Supabase Auth.
- The app is a static single page: `index.html`, `app.js`, and `styles.css`. It has no build step or server runtime. The frontend imports a pinned `@supabase/supabase-js` version from esm.sh.
- GitHub Actions workflow `.github/workflows/deploy.yml` deploys on pushes to `main` and manual dispatch. It stages the app files and required images for GitHub Pages.
- The browser uses the Supabase project URL and public publishable/anon key. A public key is expected to be visible in browser code. Never place a secret/service-role key in frontend code or Git.
- Supabase Edge Function `member-access-admin` supports administrator member-account operations. Its privileged key is read from server environment secrets, not browser code.
- Serve the repository root with a static web server for local use.

## App behavior

- Members sign in with email and password. The Supabase Auth user is matched to a `members` row.
- First-login password setup is supported for newly linked accounts.
- The main views are Songs, Setlists, Gigs, and Dashboard. Song-task ownership in `task_types.owner_member_id` controls member editing; the administrator can manage broader work and setlists. Supabase row-level security is the authorization boundary.
- The Dashboard groups remaining work by member/category and can show the next gig or full repertoire.
- Setlist editing is available to the administrator; additions, removals, and ordering are staged until Save, shown on the same edit control. The control reads **Done editing** when clean and **Save** when there are changes. Members can view setlists.
- The Songs page has an administrator-only **Add song** action and no setlist count card.

## Data model and references

The migration files describe the intended schema and history. Core entities cover members and linked emails; songs, languages and medley parts; task types, per-song tasks and task status history; percussion instruments; setlists and setlist items; gigs; and deadlines. Views documented in the app guide summarize readiness, setlist duration, member progress, and deadlines.

Start with:

- [App guide](APP_GUIDE.md) for screens, data flow, roles, and maintenance.
- [Product plan](../PLAN.md) for requirements and earlier decisions.
- [Project summary](../TSP%20Band%20App%20Summary.md) for confirmed behavior and the change log.
- [Supabase setup guide](../SETUP_SUPABASE.md) for initial setup history.
- [Supabase migrations](../supabase/migrations/) for schema and SQL changes.

Some documentation describes earlier stages of the product. When sources differ, inspect current frontend code and the live Supabase schema/migration history, then preserve user-confirmed behavior. Do not blindly replay the initial setup SQL against the live project.

## Future change loop

1. Read this note, the app guide, the relevant frontend files, and the relevant migration/policy files.
2. For Supabase changes, inspect the connected live schema and migration history and consult current official Supabase documentation.
3. Keep changes narrow. Preserve the member ownership model and RLS. Never put privileged credentials in public code.
4. Update the relevant documentation and this note when behavior, schema, or deployment changes.
5. Verify changes with an appropriate targeted check. Do not apply database changes or deploy to production unless that change is part of the user's request.
