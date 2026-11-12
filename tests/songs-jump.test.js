// The Song ID under a title is the Ableton jump; the title itself only opens
// the song in the app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, appSource } = require('./helpers');

function markup(isAdmin) {
  const ctx = load(['songEntryIdMarkup'], {
    state: { member: { is_admin: isAdmin } },
    escapeHtml: (s) => String(s)
  });
  return ctx.songEntryIdMarkup('E12');
}

test('an admin gets a jump button on the Song ID', () => {
  const html = markup(true);
  assert.match(html, /<button type="button" class="song-entry-id song-entry-jump" data-song-jump="E12"/);
});

test('everyone else sees the plain Song ID', () => {
  const html = markup(false);
  assert.match(html, /<span class="song-entry-id">E12<\/span>/);
  assert.equal(html.includes('data-song-jump'), false);
});

test('the click sends the Ableton jump and the title does not', () => {
  assert.match(appSource, /sendAbletonCommand\('\/jump', \{ song_id: songJump\.dataset\.songJump \}\)/);
  assert.match(appSource, /Clicking a song title no longer moves Ableton/);
});
