# Ableton lyric sync — main project

The lyrics sync has been confirmed with the test copy. TSPWork 1.22 now targets the main project:

`/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als`

The Ableton Sync page writes saved shared Practice lyric edits into the open main project, asks Live to save with Command+S, then reads the saved set back into Practice.

## Safeguards

- Before writeback, TSPWork compares the set open in Live with the exact main-project path above. Other sets are refused.
- It preflights every requested song and lyrics track before changing any clip.
- Existing lyric clips are matched in arrangement order and their original text is checked for stale edits.
- If clip counts differ from the saved Ableton baseline, the entire write is refused. Adding or removing arrangement clips is not automated.
- After Live saves, the app reads the set back and compares the lyrics with pending edits. It clears each shared Practice override only after the saved text matches.
- If a check fails, the shared Practice edit remains available.

## Use the main project

1. Install the updated TSPWork 1.22 files and reselect TSPWork in Live's Control Surface settings.
2. Open the main project at the path above in Ableton Live.
3. In TSP Work, use **Sync Ableton Set**. Existing edited lyric clips are written, saved, and read back.
4. If the app reports a mismatch, the Practice edit remains. Resolve the named song/track before retrying.

Adding or removing lyric clip rows is still outside the automated writeback. Edit those arrangement rows directly in Live.

## If TSPWork does not appear in Live

The installed `tspwork.py` must be plain text, not Rich Text. If TextEdit saved it as RTF, choose **Format → Make Plain Text**, confirm conversion, and save while keeping the `.py` extension. Its first line should begin with `"""TSPWork`; if it begins with `{\\rtf1`, it is still Rich Text. Restart Live or reselect TSPWork after saving.

## Lyrics editor save fix — 11 Nov 2026

The editor markup includes the `lyrics-edit-lines` element ID used by the Save handler. Reload the app to receive the current frontend code.
