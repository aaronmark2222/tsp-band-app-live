// A Song ID anywhere in the app is the Ableton jump; titles only open the
// song, the jump raises no review player, and it never touches a playing
// transport.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, appSource } = require('./helpers');

function markup(isAdmin, cls) {
  const ctx = load(['songIdMarkup', 'songEntryIdMarkup'], {
    state: { member: { is_admin: isAdmin } },
    escapeHtml: (s) => String(s)
  });
  return cls ? ctx.songIdMarkup('E12', cls) : ctx.songEntryIdMarkup('E12');
}

test('an admin gets a jump button on the Song ID', () => {
  assert.match(markup(true), /<button type="button" class="song-entry-id song-jump" data-song-jump="E12"/);
});

test('the same control is used wherever a Song ID is shown', () => {
  assert.match(markup(true, 'setlist-repertoire-id'), /class="setlist-repertoire-id song-jump" data-song-jump="E12"/);
  assert.match(markup(true, 'song-id'), /class="song-id song-jump" data-song-jump="E12"/);
});

test('everyone else sees the plain Song ID', () => {
  const html = markup(false);
  assert.match(html, /<span class="song-entry-id">E12<\/span>/);
  assert.equal(html.includes('data-song-jump'), false);
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
