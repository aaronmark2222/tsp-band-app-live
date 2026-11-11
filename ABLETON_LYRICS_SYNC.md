# Ableton lyrics sync — main project

This runbook documents the current Practice → Ableton lyric workflow. For the full application/data map, see [APP_GUIDE.md](APP_GUIDE.md). The dated change history is in [WORK LOG.md](WORK%20LOG.md).

## Active project and bridge

The active project is:

`/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als`

The local TSPWork source is in `TSPWork control surface/TSPWork/`; it declares version **1.26** to support Drum/Percussion clip removal. The updated file is installed in Ableton’s Remote Scripts folder. Reselect TSPWork (or restart Live) before syncing so the running process loads it. The test-copy project is historical and must not be treated as the active write target.

The bridge binds only to loopback (`127.0.0.1`), restricts browser origins to the published TSP Work site/local testing, and has a hardcoded main-project path guard. It is intended to work only on Aaron’s Mac with Ableton Live open. It is not reachable from band members’ devices.

## Normal workflow

1. Open the main project in Ableton Live and save it (⌘S). Confirm the set is the main path above.
2. Confirm TSPWork is selected in Live’s **Settings → Link, Tempo & MIDI → Control Surface** and its status/version is current. If the script was updated, reselect it or restart Live.
3. In the app, open **Practice**, choose a song and selected lyric track, then edit clip text. The editor saves a shared Practice override when **Save Lyrics** is pressed; this alone does not change Live.
4. Open **Ableton Sync** and choose **Sync Ableton Set**. The app sends pending overrides to TSPWork, asks Live to save, reads the saved `.als` snapshot back, then refreshes Practice lyrics.
5. Confirm the lyric is correct in both Practice and Live. If the app shows a failure, retain the edit, address the named song/track/precondition, then retry.

Beside **Sync Ableton Set**, the page shows how many saved Practice lyric-track edits are waiting to sync. The count refreshes when the page opens and when an edit is saved or cleared in another open app session.

## What each sync does

1. The app submits pending `song_lyrics_edits` rows to TSPWork `/sync-lyrics`.
2. TSPWork verifies that the open Live set and file are exactly the allowlisted main project. It preflights all requested songs/tracks before changing anything: track presence, expected clip count, stale original clip text, text validity, and any requested Drum/Percussion section additions.
3. Existing clips are updated through Live’s API. For the special Drum/Percussion operation, the bridge creates the allowed MIDI clip in an empty section and applies the track’s color. Retry detection avoids creating a duplicate if a prior attempt completed the clip but later reporting failed. The bridge attempts rollback of created clips on an apply failure.
4. Live is asked to save. When clips changed, TSPWork checks that the main `.als` modification time advanced.
5. The app runs `/snapshot`, which parses the saved set and writes the current lyrics/sections/tempo/bars/tone into Supabase `song_lyrics`.
6. Only after the persisted snapshot matches the requested lyrics does the app clear the corresponding shared override. Failed or mismatched edits remain available in Practice.
7. The app refreshes its active Practice state and signals other same-origin Practice tabs via `BroadcastChannel`, falling back to a storage event. Realtime also distributes edit changes.

## Safeguards and editing rules

- **Wrong set:** any set other than the exact main-project path is refused.
- **Preflight:** all requested edits are checked before applying them, so one bad row should stop the batch before partial text writeback.
- **Stale baseline:** if a clip’s current text differs from the original text the edit expected, sync refuses rather than overwriting the newer Live change.
- **Clip count:** ordinary lyric edits cannot add/remove/reorder clips. A count mismatch is refused. Drums/Percussion can add one MIDI clip to an empty section or remove a section’s clip using the subtle × control. Leaving a Drum/Percussion clip empty and clicking away has the same remove behavior. The matching arrangement clip is removed only after the bridge verifies it against the saved baseline.
- **Persistence:** pending Practice edits are not discarded on error. The override is cleared only after readback matches.
- **Save-before-read:** the reader parses the saved `.als`, not unsaved edits held only in Live memory. Sync asks Live to save as part of writeback; manual Ableton-only changes need to be saved before a read.
- **No secrets in logs:** keep signed URLs, credentials, local private keys and member data out of diagnostics/screenshots.

## Text representation

Ableton MIDI clip names hold the lyric text. A backslash (`\\`) means a logical line break. The editor shows the lines separately, blocks consecutive Enter presses that would create an empty line, and joins lines back with the Ableton separator on save. Chords/instructions are rendered above lyric words in Practice; the editor preview uses the same formatter. Timing, clip order, and colors stay tied to the Ableton baseline. Drum/Percussion additions and removals are the special clip-count exceptions described above.

## Troubleshooting

| Message/symptom | Check |
|---|---|
| Could not read clip names | Is TSPWork running/current and Live’s correct set open? Check actual clip names, request log and bridge response. Keep the Practice edit. |
| No saved Ableton baseline | Read/sync the main Ableton set first so the song and lyric tracks have a baseline. Empty Drums/Percussion tracks are valid; the current editor supports adding the first section clip. |
| Different number of clips from Ableton | Compare source track/clip count with the saved baseline and determine whether Live changed since the edit. Do not change the database row count manually. Read the set for the actual baseline or restore the Ableton version if discarding the override is intended. |
| Lyrics update only after page reload | Check that snapshot save completed, the `song_lyrics` baseline timestamp advanced, matching edits cleared, and the active/cross-tab refresh signal ran. Check Realtime only after verifying persisted rows. |
| Sync appears successful, but text returns | Compare exact clip text read back from the saved `.als`; the override clears only on match. Check whether the running Remote Script is older than the local file. |
| Bridge unavailable or wrong version | Check loopback `/status`, Live’s selected control surface, site origin/certificate and installed script. Reselect TSPWork after updating `tspwork.py`. |

## Source files and historical notes

- `TSPWork control surface/TSPWork/tspwork.py`: in-Live HTTP(S) bridge, path guard, writeback, clip creation, save verification and export/review actions.
- `TSPWork control surface/TSPWork/alsreader.py`: saved `.als` parser and snapshot builder.
- `tsp-band-app-live/app.js`: Practice edit, sync request, snapshot persistence/readback and refresh logic in this local snapshot. Compare with GitHub `main` before publishing.
- Supabase `song_lyrics` is the Ableton baseline; `song_lyrics_edits` is the shared musician/admin override. The two are intentionally separate.
- `ableton-sync/README.md` describes an older direct `.als` audit tool. It says it never changes the `.als` and is not the current app-to-Live writeback path.

The Drum clip `nothing` added to I1 / first Intro was confirmed to appear in Ableton. See the latest Practice/Drum entries in [WORK LOG.md](WORK%20LOG.md) for the more recent empty-baseline and playback-render fixes.
