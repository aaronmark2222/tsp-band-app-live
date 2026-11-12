const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appPath = path.resolve(__dirname, '../../../app.js');
const appSource = fs.readFileSync(appPath, 'utf8');

function functionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = appSource.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < appSource.length; i += 1) {
    if (appSource[i] === '{') depth += 1;
    if (appSource[i] === '}') {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

// The earlier case for refreshPracticeLyricsFromSnapshot was retired with that
// function: Practice now reloads the saved baseline from Supabase after a sync
// (refreshPracticeLyricsAfterSync); the queue rules are covered in tests/lyrics-sync.test.js.

test('a sync notification reloads the matching song in another open Practice page', () => {
  const calls = [];
  const context = {
    state: { view: 'practice' },
    practice: { songId: 'I3' },
    practiceLyricsSyncSeen: new Set(),
    practiceLoadLyrics(songId) { calls.push(songId); return Promise.resolve(); },
  };
  vm.createContext(context);
  vm.runInContext(functionSource('refreshPracticeLyricsForSync'), context);

  assert.equal(context.refreshPracticeLyricsForSync({
    type: 'ableton-lyrics-synced', song_ids: ['I3', 'H3'], id: 'sync-1',
  }), true);
  assert.deepEqual(calls, ['I3']);
  assert.equal(context.refreshPracticeLyricsForSync({
    type: 'ableton-lyrics-synced', song_ids: ['H3'], id: 'sync-2',
  }), false);
  assert.deepEqual(calls, ['I3']);
});
