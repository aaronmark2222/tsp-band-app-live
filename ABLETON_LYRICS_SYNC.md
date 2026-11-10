# Ableton lyric writeback test mode

The Ableton Sync page now offers **Sync Ableton Set**. It writes saved shared Practice lyric edits to the Ableton test copy, asks Live to save with Command+S, then reads the saved set back into Practice.

## Safety behavior

- TSPWork 1.21 uses the fixed test-copy path during this test phase.
- Before writing, it compares the Live Set open in Ableton against that exact path. Any other set, including the master set, is refused.
- It preflights every requested song and lyrics track before changing any clip.
- Existing lyric clips are matched in arrangement order and their original text is checked to detect stale edits.
- If the clip row count differs from the saved Ableton baseline, the entire write is refused. Adding or removing arrangement clips is not automated in this phase.
- After save, the app reads the saved .als and compares the lyrics with the pending edits. It only removes the shared Practice override after the saved readback matches.
- If a check fails, the shared Practice edit remains available.

## Testing steps

1. Install the updated TSPWork remote script from `tools/ableton-remote-script/TSPWork` and reload TSPWork in Ableton.
2. Open the test copy in Ableton.
3. In the app, use **Sync Ableton Set**. Existing clip text edits should be written, saved, and read back.
4. If the app reports a mismatch, keep the Practice edit and resolve the named song/track before retrying.

The test-copy restriction must be deliberately changed before production use.