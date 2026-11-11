# Ableton lyrics sync — main project

This runbook documents the current Practice → Ableton lyric workflow. For the full application/data map, see [APP_GUIDE.md](APP_GUIDE.md). The dated change history is in [WORK LOG.md](WORK%20LOG.md).

## Active project and bridge

The active project is:

`/Users/aaron/Desktop/TSP LIVE MASTER PROJECT Project/TSP LIVE MASTER PROJECT.als`

The local TSPWork source is in `TSPWork control surface/TSPWork/`; it declares version **1.27** to support Drum/Percussion clip removal and guarded lyric writeback. The installed Live control surface stays bound to `127.0.0.1`; it is never opened to the Wi-Fi network. The test-copy project is historical and must not be treated as the active write target.

The bridge binds only to loopback (`127.0.0.1`), restricts browser origins to the published TSP Work site/local testing, and has a hardcoded main-project path guard. It is intended to work only on Aaron’s Mac with Ableton Live open. Other signed-in devices never connect to the Mac’s bridge: lyric edits go to Supabase, then the open TSP Work session on Aaron’s Mac relays them to Live. A short-lived admin-written `app_meta` heartbeat lets signed-in devices show the Ableton chip while the exact master project is open. The signal expires if the Mac app stops reporting; it does not expose the bridge address or file path.

## Normal workflow

1. Open the main project in Ableton Live and save it (⌘S). Confirm the set is the main path above.
2. Confirm TSPWork is selected in Live’s **Settings → Link, Tempo & MIDI → Control Surface** and its status/version is current. If the script was updated, reselect it or restart Live.
3. In the app, open **Practice**, choose a song and a lyric track you can edit, then edit clip text. **Save Lyrics** saves the shared edit to Supabase.
4. When the Ableton chip is lit, Aaron’s signed-in Mac app detects the saved edit, verifies that the exact master project is open, and applies the clip changes to Live's open memory. It never invokes Save. This also works when the edit was made from another signed-in device.
5. Save the Live set manually when ready, then choose **Sync Ableton Set** in the app. The app reads the saved `.als`, confirms that its lyrics match the queued edit, updates the Practice baseline, and clears only that matching edit. Until then, the edit stays queued and the Mac chip shows **Sync**.
6. If the Mac app or master project is unavailable, the edit stays in Practice and is picked up when the Mac app reconnects to the open master set. If writeback or readback fails, the edit is retained for retry. Edits to other tracks may be queued while an in-memory change awaits saving. To avoid overwriting a pending state, a track with a queued edit cannot be edited again until save and sync confirm it; restores remain blocked while any in-memory change is pending.
5. If the Mac app or master project is unavailable, the edit stays in Practice and is picked up when the Mac app reconnects to the open master set. If writeback or readback fails, the edit is retained for retry.

Beside **Sync Ableton Set**, the page shows how many saved Practice lyric-track edits are waiting to sync. The count refreshes when the page opens and when an edit is saved or cleared. The Ableton chip is shared across signed-in devices and is based on the Mac app’s recent heartbeat; it can take a few seconds to appear or disappear. The **Sync** label appears only in the Mac app whose local bridge confirms that the allowlisted project is open. Other devices show shared Ableton availability without the local pending-sync label.

## What each sync does

1. The app submits pending `song_lyrics_edits` rows to TSPWork `/sync-lyrics`.
2. TSPWork verifies that the open Live set and file are exactly the allowlisted main project. It preflights all requested songs/tracks before changing anything: track presence, expected clip count, stale original clip text, text validity, and any requested Drum/Percussion section additions.
3. Existing clips are updated through Live’s API. For the special Drum/Percussion operation, the bridge creates the allowed MIDI clip in an empty section and applies the track’s color. Retry detection avoids creating a duplicate if a prior attempt completed the clip but later reporting failed. The bridge attempts rollback of created clips on an apply failure.
4. TSPWork changes the open Live session only and reports that manual save is still required. It does not send a keystroke or modify the `.als` file directly.
5. When Aaron chooses **Sync Ableton Set** after saving manually, the app runs `/snapshot`, which parses the saved `.als`. It first verifies every queued lyric row against that snapshot; if any row does not match, it keeps the queue and does not update the Practice lyric baseline.
6. After verification, the app writes current lyrics/sections/tempo/bars/tone into Supabase `song_lyrics` and clears only the corresponding unchanged shared overrides. The app then updates the shared Ableton presence state and refreshes Practice.
7. The app signals other same-origin Practice tabs via `BroadcastChannel`, falling back to a storage event. Realtime distributes edit changes to the Mac relay; clients also read the shared availability heartbeat and manual-save state.

## Safeguards and editing rules

- **Wrong set:** any set other than the exact main-project path is refused.
- **Preflight:** all requested edits are checked before applying them, so one bad row should stop the batch before partial text writeback.
- **Stale baseline:** if a clip’s current text differs from the original text the edit expected, sync refuses rather than overwriting the newer Live change.
- **Clip count:** ordinary lyric edits cannot add/remove/reorder clips. A count mismatch is refused. Drums/Percussion can add one MIDI clip to an empty section or remove a section’s clip using the subtle × control. Leaving a Drum/Percussion clip empty and clicking away has the same remove behavior. The matching arrangement clip is removed only after the bridge verifies it against the saved baseline.
- **Persistence:** pending Practice edits are not discarded on error. The override is cleared only after a manual save and matching saved-set readback.
- **Save-before-read:** the reader parses the saved `.als`, not unsaved edits held only in Live memory. The musician saves manually before choosing Sync Ableton Set; that button never saves the Live set.
- **No secrets in logs:** keep signed URLs, credentials, local private keys and member data out of diagnostics/screenshots.

## Text representation

Ableton MIDI clip names hold the lyric text. A backslash (`\\`) means a logical line break. The editor shows the lines separately, blocks consecutive Enter presses that would create an empty line, and joins lines back with the Ableton separator on save. Chords/instructions are rendered above lyric words in Practice; the editor preview uses the same formatter. Timing, clip order, and colors stay tied to the Ableton baseline. Drum/Percussion additions and removals are the special clip-count exceptions described above.

## Troubleshooting

| Message/symptom | Check |
|---|---|
| Could not read clip names | Is TSPWork running/current and Live’s correct set open? Check actual clip names, request log and bridge response. Keep the Practice edit. |
| No saved Ableton baseline | Read/sync the main Ableton set first so the song and lyric tracks have a baseline. Empty Drums/Percussion tracks are valid; the current editor supports adding the first section clip. |
| Different number of clips from Ableton | Compare source track/clip count with the saved baseline and determine whether Live changed since the edit. Do not change the database row count manually. Read the set for the actual baseline or restore the Ableton version if discarding the override is intended. |
| Lyrics remain queued after syncing | Save the set in Live manually, then choose Sync Ableton Set again. It only clears queued lyrics after the saved `.als` matches them. |
| Sync says lyrics are not in the saved set | The in-memory edit has not been manually saved yet, or Live saved another version. Keep the queued Practice edit, resolve the clip text in Live, save manually and sync again. |
| Lyrics update only after page reload | Check that snapshot read completed, the `song_lyrics` baseline timestamp advanced, matching edits cleared, and the active/cross-tab refresh signal ran. Check Realtime only after verifying persisted rows. |
| Sync appears successful, but text returns | Compare exact clip text read back from the saved `.als`; the override clears only on match. Check whether the running Remote Script is older than the local file. |
| Bridge unavailable or wrong version | Check loopback `/status`, Live’s selected control surface, site origin/certificate and installed script. Reselect TSPWork after updating `tspwork.py`. |

## Source files and historical notes

- `TSPWork control surface/TSPWork/tspwork.py`: in-Live HTTP(S) bridge, path guard, writeback, clip creation, save verification and export/review actions.
- `TSPWork control surface/TSPWork/alsreader.py`: saved `.als` parser and snapshot builder.
- `tsp-band-app-live/app.js`: Practice edit, sync request, snapshot persistence/readback and refresh logic in this local snapshot. Compare with GitHub `main` before publishing.
- Supabase `song_lyrics` is the Ableton baseline; `song_lyrics_edits` is the shared musician/admin override. The two are intentionally separate.
- `ableton-sync/README.md` describes an older direct `.als` audit tool. It says it never changes the `.als` and is not the current app-to-Live writeback path.

The Drum clip `nothing` added to I1 / first Intro was confirmed to appear in Ableton. See the latest Practice/Drum entries in [WORK LOG.md](WORK%20LOG.md) for the more recent empty-baseline and playback-render fixes.
