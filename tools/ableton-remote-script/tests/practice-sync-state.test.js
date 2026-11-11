const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appPath = path.resolve(__dirname, '../../tsp-band-app-live/app.js');
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

test('clearing a synced override keeps the newly read Ableton baseline visible', () => {
  const practice = {
    songId: 'I3',
    lyrics: {
      tracks: [{ slug: 'guitar', lines: [{ t: 4, text: 'Old saved line' }] }],
      sourceTracks: [{ slug: 'guitar', lines: [{ t: 4, text: 'Old saved line' }] }],
      lyricsEdits: [{ track_slug: 'guitar', lines: [{ t: 4, text: 'Hellooo' }] }],
    },
  };
  const context = {
    practice,
    renderPracticeLyrics() {},
    practiceKeepPlace(render) { render(); },
  };
  vm.createContext(context);
  vm.runInContext([
    functionSource('applyLyricsEdits'),
    functionSource('refreshPracticeLyricsFromSnapshot'),
  ].join('\n'), context);

  context.refreshPracticeLyricsFromSnapshot({ songs: { I3: {
    lyrics: { tracks: [{ slug: 'guitar', lines: [{ t: 4, text: 'Hello from Ableton' }] }], sections: [], tempo: [] },
    bars: [], tone: [], duration_seconds: 30,
  } } });
  assert.equal(practice.lyrics.tracks[0].lines[0].text, 'Hellooo');

  context.applyLyricsEdits([]); // the Realtime event after clearing the override
  assert.equal(practice.lyrics.tracks[0].lines[0].text, 'Hello from Ableton');
});
