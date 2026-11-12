// A Song ID anywhere in the app is the Ableton jump; titles only open the
// song, the jump raises no review player, and it never touches a playing
// transport.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, appSource } = require('./helpers');

function markup(cls) {
  const ctx = load(['songIdMarkup', 'songEntryIdMarkup'], { escapeHtml: (s) => String(s) });
  return cls ? ctx.songIdMarkup('E12', cls) : ctx.songEntryIdMarkup('E12');
}

function allowed({ admin = false, roomCode = null, members = [], local = false, presence = false }) {
  const classes = new Set();
  const ctx = load(['songJumpAllowed', 'songJumpLive', 'roomHasAdmin', 'updateSongJumpAvailability'], {
    state: { member: { is_admin: admin } },
    room: { code: roomCode, members },
    abletonBridge: { connected: local },
    abletonMainProjectOpen: () => local,
    abletonPresence: { available: presence },
    document: { body: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } } }
  });
  ctx.updateSongJumpAvailability();
  return classes.has('ableton-jumpable');
}

test('the Song ID is the same jump control wherever it is shown', () => {
  assert.match(markup(), /<button type="button" class="song-entry-id song-jump" data-song-jump="E12"/);
  assert.match(markup('setlist-repertoire-id'), /class="setlist-repertoire-id song-jump" data-song-jump="E12"/);
  assert.match(markup('song-id'), /class="song-id song-jump" data-song-jump="E12"/);
});

test('an inert Song ID still reads as plain text', () => {
  const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../styles.css'), 'utf8');
  assert.match(css, /body:not\(\.ableton-jumpable\) button\.song-jump \{ pointer-events:none;/);
});

test('an admin may jump from any device while the Mac is up', () => {
  assert.equal(allowed({ admin: true, presence: true }), true);
  assert.equal(allowed({ admin: true, local: true }), true);
});

test('nothing is jumpable while the Ableton Master Project is closed', () => {
  assert.equal(allowed({ admin: true }), false);
});

test('a bandmate may jump only from a practice room with an admin in it', () => {
  assert.equal(allowed({ presence: true }), false);
  assert.equal(allowed({ presence: true, roomCode: 'ABCD', members: [{ admin: false }] }), false);
  assert.equal(allowed({ presence: true, roomCode: 'ABCD', members: [{ admin: false }, { admin: true }] }), true);
});

test('the Mac accepts a relayed jump from an admin or its own room', () => {
  const ctx = load(['abletonRemoteAllowed'], {
    state: { members: [{ id: 'm-aaron', is_admin: true }, { id: 'm-dale', is_admin: false }] },
    room: { code: 'ABCD', members: [{ member_id: 'm-dale' }] }
  });
  assert.equal(ctx.abletonRemoteAllowed({ member_id: 'm-aaron' }), true);
  assert.equal(ctx.abletonRemoteAllowed({ member_id: 'm-dale', room: 'ABCD' }), true);
  assert.equal(ctx.abletonRemoteAllowed({ member_id: 'm-dale', room: 'WXYZ' }), false);
  assert.equal(ctx.abletonRemoteAllowed({ member_id: 'm-stranger', room: 'ABCD' }), false);
  assert.equal(ctx.abletonRemoteAllowed({}), false);
});

test('a relayed jump is checked against the song list before it runs', () => {
  assert.match(appSource, /if \(!state\.songs\.some\(\(song\) => song\.id === songId\)\) return;/);
  assert.match(appSource, /if \(!abletonRemoteAllowed\(payload\)\) return;/);
});

test('Song IDs in the setlists and the work popover are jumps too', () => {
  assert.match(appSource, /setlist-repertoire-row">\$\{songIdMarkup\(song\.id, 'setlist-repertoire-id'\)\}/);
  assert.match(appSource, /setlist-song-edit-summary">\$\{songIdMarkup\(item\.song_id\)\}/);
  assert.match(appSource, /pt-work-song-heading">\$\{songIdMarkup\(song\.id\)\}/);
});

test('the jump asks for no review session and shows no review player', () => {
  assert.match(appSource, /sendAbletonCommand\('\/jump', \{ song_id: songId, review: false \}, \{ review: false \}\)/);
  assert.match(appSource, /async function sendAbletonCommand\(path, body, \{ review = true \} = \{\}\)/);
  assert.match(appSource, /if \(review && result\?\.review\) showReviewBar/);
});

test('the Ableton Sync page keeps its review jump', () => {
  assert.match(appSource, /const jump = event\.target\.closest\('\[data-sync-jump\]'\);\n\s*if \(jump\) \{ sendAbletonCommand\('\/jump', \{ song_id: jump\.dataset\.syncJump \}\); return; \}/);
});

test('a jump held back because Live is playing is reported, not retried', () => {
  assert.match(appSource, /result\?\.skipped === 'playing'/);
  assert.match(appSource, /Ableton is playing, so the playhead was left where it is/);
});

test('a song title still does not move Ableton', () => {
  assert.match(appSource, /Clicking a song title no longer moves Ableton/);
});

test('a bridge that cannot check the transport is refused, not risked', () => {
  const ctx = load(['abletonJumpGuardReady'], { abletonBridge: { status: { version: '1.30' } }, ABLETON_JUMP_MIN_VERSION: [1, 31] });
  assert.equal(ctx.abletonJumpGuardReady(), false);
  const ok = load(['abletonJumpGuardReady'], { abletonBridge: { status: { version: '1.31' } }, ABLETON_JUMP_MIN_VERSION: [1, 31] });
  assert.equal(ok.abletonJumpGuardReady(), true);
  const newer = load(['abletonJumpGuardReady'], { abletonBridge: { status: { version: '2.0' } }, ABLETON_JUMP_MIN_VERSION: [1, 31] });
  assert.equal(newer.abletonJumpGuardReady(), true);
  const none = load(['abletonJumpGuardReady'], { abletonBridge: { status: null }, ABLETON_JUMP_MIN_VERSION: [1, 31] });
  assert.equal(none.abletonJumpGuardReady(), false);
});
