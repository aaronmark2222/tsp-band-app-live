// A track that is switched on must never sit silent: on a long song the
// stem it needs used to wait behind every other download.
const test = require('node:test');
const assert = require('node:assert/strict');
const { appSource } = require('./helpers');

test('a track just switched on jumps the download queue', () => {
  assert.match(appSource, /function bgFetchUrgent\(songId, element\) \{/);
  assert.match(appSource, /while \(bgFetch\.active >= \(bgFetch\.urgent\.has\(key\) \? 3 : 2\)\)/);
  assert.match(appSource, /const urgentAt = bgFetch\.waiting\.findIndex\(\(w\) => bgFetch\.urgent\.has\(w\.key\)\);/);
});

test('urgency is dropped when the download finishes', () => {
  assert.match(appSource, /bgFetch\.urgent\.delete\(key\);/);
});

test('a decoded track switched on mid-playback gets a player', () => {
  assert.match(appSource, /if \(practice\.buffers\.has\(element\)\) \{ practiceAttachTrack\(element\); return; \}/);
});

test('audible tracks are reconciled on every mixer change and twice a second', () => {
  assert.match(appSource, /function practiceSyncAudible\(\) \{/);
  assert.match(appSource, /function practiceMixRefresh\(\) \{ practiceSyncAudible\(\);/);
  assert.match(appSource, /practice\.syncedAt = Date\.now\(\); practiceSyncAudible\(\);/);
});

test('the playhead stays at the end of a song instead of jumping back', () => {
  assert.match(appSource, /practice\.position = practice\.duration; \/\/ what a paused transport reads/);
  assert.match(appSource, /audio\.addEventListener\('ended', \(\) => \{ practice\.position = Number\.isFinite\(audio\.duration\)/);
  assert.match(appSource, /const t = total && at >= total - 0\.05 \? 0 : at; \/\/ parked at the end: start again/);
});
