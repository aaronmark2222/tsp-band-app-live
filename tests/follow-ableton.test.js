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

test('stopping the follow leaves the playhead where Ableton left it', () => {
  const fn = appSource.slice(appSource.indexOf('function followStop('), appSource.indexOf('function followToggle('));
  assert.match(fn, /const at = follow\.state && follow\.state\.seconds != null \? followPosition\(\) : null;/);
  assert.match(fn, /practice\.position = Math\.max\(0, at\);/);
  assert.match(fn, /practice\.offset = Math\.max\(0, at\);/);
});

test('a quiet relay freezes the playhead instead of running on', () => {
  const now = Date.now();
  const stale = load(['followPosition'], { follow: { state: { seconds: 10, playing: true, at: now - 9000 }, offset: 0, stale: true, frozen: 12.5 } });
  assert.equal(stale.followPosition(), 12.5);
  const live = load(['followPosition'], { follow: { state: { seconds: 10, playing: true, at: now - 2000 }, offset: 0, stale: false, frozen: null } });
  assert.ok(Math.abs(live.followPosition() - 12) < 0.1);
});

test('the watchdog freezes, mends and finally lets go', () => {
  const fn = appSource.slice(appSource.indexOf('function followWatch()'), appSource.indexOf("// --- the Mac's side"));
  assert.match(fn, /if \(quiet < FOLLOW_STALE_MS\) return;/);
  assert.match(fn, /follow\.frozen = followPosition\(\);/);
  assert.match(fn, /if \(quiet > FOLLOW_GIVEUP_MS\) \{\n    followStop\(/);
  assert.match(fn, /abletonRemoteHeal\(!abletonRemoteHealthy\(\)\);/);
  assert.match(fn, /if \(!live\) \{ followStop\(/);
  assert.match(appSource, /follow\.watchdog = setInterval\(followWatch, 1000\);/);
});

test('a dead relay channel is rebuilt rather than waited on', () => {
  assert.match(appSource, /function abletonRemoteHealthy\(\) \{ return !!abletonRemote\.channel && abletonRemote\.status === 'SUBSCRIBED'; \}/);
  assert.match(appSource, /function abletonRemoteHeal\(force\) \{/);
  assert.match(appSource, /try \{ db\.removeChannel\(old\); \} catch/);
  assert.match(appSource, /abletonRemoteHeal\(!abletonRemoteHealthy\(\)\); \/\/ a stale channel is rebuilt before we wait on it/);
  assert.match(appSource, /window\.addEventListener\('online', back\);/);
});

test('losing the network takes the chip, the jumps and the following with it', () => {
  assert.match(appSource, /if \(navigator\.onLine === false\) \{ abletonPresence\.failures = 9; abletonPresenceLost\(\); return; \}/);
  assert.match(appSource, /if \(abletonPresence\.failures >= 2\) abletonPresenceLost\(\);/);
  assert.match(appSource, /window\.addEventListener\('offline', \(\) => \{ abletonPresence\.failures = 9; abletonPresenceLost\(\); \}\);/);
  // and the chip going is what hides the button and releases the transport
  assert.match(appSource, /if \(follow\.on && !songJumpLive\(\)\) followStop\(\);/);
});

test('the follow note lives on its own line and is cleared when it ends', () => {
  const html = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /<span id="follow-note" class="muted follow-note"><\/span>/);
  const fn = appSource.slice(appSource.indexOf('function renderFollowUi()'));
  assert.match(fn, /const note = document\.getElementById\('follow-note'\);/);
  assert.match(fn, /if \(note\) note\.textContent = follow\.on \? \(follow\.note \|\| /);
  // and it must not borrow the song's line any more
  assert.equal(fn.includes("getElementById('practice-song-note')"), false);
});

test('a heartbeat that stops being written expires on the device itself', () => {
  assert.match(appSource, /const ABLETON_PRESENCE_TTL_MS = 18000;/);
  assert.match(appSource, /abletonPresence\.expiry = setInterval\(abletonPresenceExpiryCheck, 2000\);/);
  const fn = appSource.slice(appSource.indexOf('function abletonPresenceExpiryCheck()'), appSource.indexOf('function startSharedAbletonPresence()'));
  assert.match(fn, /if \(abletonBridge\.connected && abletonMainProjectOpen\(\)\) return;/);
  assert.match(fn, /Date\.now\(\) - abletonPresence\.heartbeatAt > ABLETON_PRESENCE_TTL_MS\) abletonPresenceLost\(\);/);
});

test('the Mac beats often enough for that life to be safe', () => {
  assert.match(appSource, /abletonBridge\.timer = setInterval\(probeAbletonBridge, 6000\);/);
  assert.match(appSource, /Date\.now\(\) - abletonPresence\.lastHeartbeat < 5000\) return;/);
  assert.match(appSource, /abletonPresence\.heartbeatAt = available \? Date\.now\(\) : 0;/);
});
