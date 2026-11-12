// Follow Ableton: the Mac relays Live's playhead and every following device
// reads its lyrics against it. Nothing plays audio while following.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, appSource } = require('./helpers');

function secondsFor(tempo, beats, songTempo = 120) {
  const ctx = load(['lyricsSecondsForBeats'], {
    practice: { lyrics: tempo ? { tempo } : null, songId: 'E1' },
    state: { songs: [{ id: 'E1', tempo_start: songTempo }] }
  });
  return ctx.lyricsSecondsForBeats(beats);
}

test('beats become seconds at a steady tempo', () => {
  assert.equal(secondsFor([[0, 120]], 120), 60);
  assert.equal(secondsFor([[0, 60]], 30), 30);
  assert.equal(secondsFor([[0, 120]], 0), 0);
});

test('a tempo change part way through is followed', () => {
  // 120bpm for the first 30s (60 beats), then 180bpm.
  const map = [[0, 120], [30, 180]];
  assert.equal(secondsFor(map, 60), 30);
  assert.equal(secondsFor(map, 90), 40); // 30 beats at 180bpm = 10s
});

test('without a tempo map the song tempo is used', () => {
  assert.equal(secondsFor(null, 60, 150), 24);
});

test('the position is extrapolated only while Live is playing', () => {
  const ctx = load(['followPosition'], { follow: { state: { seconds: 10, playing: false, at: Date.now() - 5000 } } });
  assert.equal(ctx.followPosition(), 10);
  const moving = load(['followPosition'], { follow: { state: { seconds: 10, playing: true, at: Date.now() - 2000 }, offset: 0 } });
  assert.ok(Math.abs(moving.followPosition() - 12) < 0.1);
});

test('a playhead in another song asks for that song, once', () => {
  const opened = [];
  const ctx = load(['followApply'], {
    follow: { on: true, state: null, songRequest: null, claims: new Map() },
    practice: { songId: 'E1', lyrics: { tempo: [[0, 120]] }, autoplay: true },
    practiceOpenSong: (id) => { opened.push(id); return Promise.resolve(); },
    lyricsSecondsForBeats: () => 0,
    renderFollowUi: () => {},
    state: { songs: [] }
  });
  ctx.followApply({ songId: 'I3', beat: 300, start: 256, playing: true, at: Date.now() });
  ctx.followApply({ songId: 'I3', beat: 302, start: 256, playing: true, at: Date.now() });
  assert.deepEqual(opened, ['I3']);
});

test('a gap between songs is reported rather than guessed at', () => {
  const notes = [];
  const follow = { on: true, state: null, songRequest: null };
  const ctx = load(['followApply'], {
    follow, practice: { songId: 'E1', lyrics: { tempo: [[0, 120]] } },
    practiceOpenSong: () => Promise.resolve(), lyricsSecondsForBeats: () => 0,
    renderFollowUi: () => notes.push(follow.note), state: { songs: [] }
  });
  ctx.followApply({ songId: null, beat: 10, start: 0, playing: true, at: Date.now() });
  assert.match(follow.note, /between songs/);
  assert.equal(follow.state.seconds, null);
});

test('the transport is read-only while following', () => {
  for (const fn of ['ptPlay', 'ptPause', 'ptStop', 'ptSeek']) {
    const body = appSource.slice(appSource.indexOf(`function ${fn}(`), appSource.indexOf(`function ${fn}(`) + 160);
    assert.match(body, /if \(followOn\(\)\) return;/, fn);
  }
  assert.match(appSource, /function ptPauseEverything\(\)/);
});

test('following and a practice room cannot both be on', () => {
  assert.match(appSource, /function followAvailable\(\) \{\n  return songJumpLive\(\) && !room\.code;/);
  assert.match(appSource, /if \(event\.target\.closest\('#room-button, #room-chip'\)\) \{ if \(follow\.on\) return; roomOpenDialog\(\); \}/);
  assert.match(appSource, /roomButton\.disabled = follow\.on;/);
});

test('the Mac only polls Live while somebody is following', () => {
  const ctx = load(['followWanted'], {
    follow: { on: false, claims: new Map([['phone', Date.now()]]) },
    abletonBridge: { connected: true },
    FOLLOW_CLAIM_MS: 30000
  });
  assert.equal(ctx.followWanted(), true);
  const stale = load(['followWanted'], {
    follow: { on: false, claims: new Map([['phone', Date.now() - 60000]]) },
    abletonBridge: { connected: true }, FOLLOW_CLAIM_MS: 30000
  });
  assert.equal(stale.followWanted(), false);
  const own = load(['followWanted'], { follow: { on: true, claims: new Map() }, abletonBridge: { connected: true }, FOLLOW_CLAIM_MS: 30000 });
  assert.equal(own.followWanted(), true);
});

test('an older bridge cannot report the playhead and is refused', () => {
  const old = load(['followSupported'], { abletonBridge: { connected: true, status: { version: '1.31' } }, FOLLOW_MIN_VERSION: [1, 32] });
  assert.equal(old.followSupported(), false);
  const ok = load(['followSupported'], { abletonBridge: { connected: true, status: { version: '1.32' } }, FOLLOW_MIN_VERSION: [1, 32] });
  assert.equal(ok.followSupported(), true);
});

// A const used by code that runs while the page loads must be declared before
// it: this is how "Cannot access 'room' before initialization" got out once.
test('the transport state objects are declared before the transport reads them', () => {
  for (const name of ['const practice = {', 'const room = {', 'const follow = {']) {
    assert.ok(appSource.indexOf(name) > 0, `${name} is missing`);
    assert.ok(appSource.indexOf(name) < appSource.indexOf('function ptIsPlaying('), `${name} must come before the transport`);
    assert.ok(appSource.indexOf(name) < appSource.indexOf('function ptPosition('), `${name} must come before the transport`);
  }
});

test('the button stacks the Ableton mark over the follow glyph, inside the circle', () => {
  const html = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../index.html'), 'utf8');
  const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../styles.css'), 'utf8');
  const button = html.slice(html.indexOf('id="follow-ableton"'), html.indexOf('id="room-button"'));
  assert.ok(button.indexOf('class="sync-logo"') < button.indexOf('class="follow-glyph"'), 'the mark sits above the glyph');
  assert.match(button, /viewBox="0 0 24 10"/);
  // 38px button: 21x10 mark + 2px gap + 19x8 glyph leaves a margin all round.
  assert.match(css, /\.room-btn \{ flex: none; width: 38px; height: 38px;/);
  assert.match(css, /\.follow-btn \.sync-logo \{ display:block; flex:none; width:21px; height:10px;/);
  assert.match(css, /\.follow-btn \.follow-glyph \{ flex:none; width:19px; height:8px; fill:currentColor; stroke:none; \}/);
  assert.match(css, /\.follow-btn \{ display:inline-flex; flex-direction:column;/);
});
