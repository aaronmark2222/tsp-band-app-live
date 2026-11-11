# Database tests (run by hand, never in CI)

These scripts run against the live Supabase project inside a transaction that
always rolls back (each ends with `raise exception 'ROLLBACK_TEST …'`), so no
row is left changed. The result is the text of that final message.

- `guest_rls.sql` — row counts each role can read, and write attempts, for the
  guest, an ordinary member and the admin.
- `delete_song_guard.sql` — song deletion: non-admin refused, audio on the
  deleted song refused, audio on a shifting song refused, no audio allowed and
  history renumbered with its song.

Run with the Supabase SQL editor or the MCP `execute_sql` tool.
