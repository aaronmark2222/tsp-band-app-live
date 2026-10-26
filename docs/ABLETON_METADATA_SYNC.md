# Ableton song metadata sync

**Source:** `TSP LIVE MASTER PROJECT.als`, inspected 2026-10-26. **Destination:** `public.songs` in Supabase project `hzvfrvjuqvmkeqbrgmqu`.

## What was synchronized

All 50 current song rows were updated from the master Ableton arrangement:

- `tempo_start`: playback BPM at each song region's start.
- `tempo_end`, `tempo_change`, and `tempo_segments`: all internal immediate and gradual tempo changes. Tempo segment bar positions are relative to the first bar of that song. Beat offsets are also stored relative to the song's start.
- `duration_seconds`: locator-bounded arrangement-region time, integrated against the playback tempo automation and rounded to the nearest second.
- `keys`: only the key active at each song's start. For medleys this is the general starting key; song-by-song key details remain for later clarification.

All 50 song-ID clip boundaries were cross-checked against their arrangement locators. The language table and all 58 song-language links were retained as-is (6 language definitions). Ableton's `Other` labels do not replace the exact language names maintained by the app.

## Tempo changes recorded

| Song | Change | Relative bar position |
| --- | --- | --- |
| I5 | 90 → 82 BPM, gradual decrease | bars 21–34 |
| EM1 | 130 → 124 BPM, gradual decrease | bars 45–60 |
| EM3 | 148 → 116 BPM, immediate decrease | at bar 125 |
| EM4 | 136 → 125 BPM, gradual decrease | bars 81–89 |
| HM2 | 130 → 140 BPM, immediate increase | at bar 113 |
| EHM4 | 102 → 109 BPM, gradual increase | bars 28–44 |
| EHKM1 | 136 → 133 BPM, gradual decrease | bars 137–148 |

The gradual-change bar range runs from the first automation point to the target BPM point. Immediate changes occur at one bar position. The website uses a step-shaped symbol for immediate changes and a sloped symbol for gradual changes; decreases display the symbol vertically flipped. Tempo expands to show these bar positions.

## Repeatable record

The migration [`20261026130000_sync_song_metadata_from_ableton.sql`](../supabase/migrations/20261026130000_sync_song_metadata_from_ableton.sql) contains the explicit 50-song update. It only updates the song metadata columns above and is safe to re-run against this same schema/data set. The live database update has already been applied and queried back successfully.

When the Ableton master changes, re-parse the song-ID regions, locator boundaries, tempo automation, and starting AbleSet key annotations; compare with the live song rows before updating this migration or creating a new one. Do not overwrite app language data from Ableton.
