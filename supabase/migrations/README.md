# Migrations

The **live database is the source of truth** (Supabase project `hzvfrvjuqvmkeqbrgmqu`).
Check it with `list_migrations` before any change, and never replay the early files
against production.

## How the files map to the live ledger

| File(s) | Live ledger | Notes |
|---|---|---|
| `0001`–`0005` | not in the ledger | Original bootstrap (schema, RLS, reference data, sheet import, guitar tone task). Ran before the ledger was used. History only. |
| `0006`–`0011` | `20261018173255` … `20261018185709` (same names) | Same SQL, older numbering. |
| `0012_first_login_password_setup` | `20261018202410_first_login_password_setup` | |
| `0012_song_tempo_segments` | `20261020072926_song_tempo_segments` | |
| `20261026011851_readiness_…` | same | Current readiness rule. |
| `20261026130000_sync_song_metadata_from_ableton` | not in the ledger | One-off data update (tempo/duration/keys from the .als, 2026-10-26). Now done automatically by Ableton Sync. |
| everything from `20261031160820` on | same version and name | One file per ledger entry. |

New migrations: apply with Supabase `apply_migration`, then save the same SQL here as
`<live version>_<name>.sql` (read the version back from `list_migrations`).
