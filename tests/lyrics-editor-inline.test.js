// The lyrics editor renders inside the lyrics view, so its cells must be
// lines the playback tick can find, highlight and scroll to.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, appSource } = require('./helpers');

function context(draft, sections = []) {
  const ctx = load([
    'lyricsEditorBodyHtml', 'lyricsEditorItems', 'lyricsEditorSectionIndex', 'lyricsEditBarHtml',
    'lyricsEditorHasChanges', 'lyricsEditorMatchesAbleton'
  ], {
    lyricsEditDraft: draft,
    practice: { songId: 'E1', lyrics: { sections } },
    state: { songs: [{ id: 'E1', name: 'Test Song' }] },
    escapeHtml: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    lyricInk: () => '',
    lyricLineHtml: (text) => String(text),
    lyricsClipTextForEditor: (text) => String(text),
    lyricsTrackLabel: (slug) => slug
  });
  return ctx;
}

function draftOf(lines, extra = {}) {
  return {
    songId: 'E1', songName: 'Test Song', slug: 'guitar',
    lines: lines.map((line, i) => ({ _editKey: `opening-${i}`, _sessionText: line.text, _addedThisSession: false, ...line })),
    sessionLines: lines.map((line, i) => ({ _editKey: `opening-${i}`, text: line.text })),
    abletonLines: lines.map((line) => ({ ...line })),
    updatedAt: null, hasOverride: false, restoreAbleton: false, activeIndex: null, message: '', saving: false,
    ...extra
  };
}

test('every clip cell is a lyric line the tick can highlight', () => {
  const draft = draftOf([{ t: 1, e: 5, text: 'first' }, { t: 5, e: 9, text: 'second' }]);
  const html = context(draft).lyricsEditorBodyHtml();
  assert.match(html, /class="ly-line lyrics-edit-cell[^"]*" data-edit-cell="0" data-line="0" data-t="1" data-e="5"/);
  assert.match(html, /data-edit-cell="1" data-line="1" data-t="5" data-e="9"/);
});

test('the cell being edited holds a textarea, the rest show their text', () => {
  const draft = draftOf([{ t: 1, e: 5, text: 'first' }, { t: 5, e: 9, text: 'second' }], { activeIndex: 1 });
  const html = context(draft).lyricsEditorBodyHtml();
  assert.match(html, /data-edit-line="1"/);
  assert.equal(/data-edit-line="0"/.test(html), false);
  assert.match(html, /lyrics-edit-cell-preview">first/);
});

test('a changed clip is marked, so it reads as edited before saving', () => {
  const draft = draftOf([{ t: 1, e: 5, text: 'first' }]);
  draft.lines[0].text = 'changed';
  const html = context(draft).lyricsEditorBodyHtml();
  assert.match(html, /lyrics-edit-cell[^"]*changed/);
  assert.match(html, /data-edit-undo="0"/);
});

test('sections keep their time, so the section highlight still works', () => {
  const draft = draftOf([{ t: 9, e: 12, text: 'verse line' }]);
  const html = context(draft, [{ t: 0, name: 'Intro', c: '#2f4f7a' }, { t: 8, name: 'Verse', c: '#2f4f7a' }]).lyricsEditorBodyHtml();
  assert.match(html, /<div class="ly-section" data-t="0"/);
  assert.match(html, /<div class="ly-section" data-t="8"/);
});

test('the toolbar disables Save until something changes', () => {
  const unchanged = context(draftOf([{ t: 1, e: 5, text: 'first' }]));
  assert.match(unchanged.lyricsEditBarHtml(), /data-edit-save disabled/);
  const draft = draftOf([{ t: 1, e: 5, text: 'first' }]);
  draft.lines[0].text = 'changed';
  assert.equal(/data-edit-save disabled/.test(context(draft).lyricsEditBarHtml()), false);
});

test('a blank clip cannot be saved', () => {
  const draft = draftOf([{ t: 1, e: 5, text: 'first' }]);
  draft.lines[0].text = '   ';
  assert.match(context(draft).lyricsEditBarHtml(), /data-edit-save disabled/);
});

test('the editor no longer opens a modal dialog', () => {
  assert.equal(appSource.includes('lyrics-edit-dialog'), false);
  assert.match(appSource, /function closeLyricsEditor\(\)/);
});

test('clicking a clip while editing does not move the playhead', () => {
  const handler = appSource.slice(appSource.indexOf("$('#practice-lyrics').addEventListener('click'"));
  assert.match(handler, /const line = event\.target\.closest\('\.ly-line, \.ly-section'\);\n\s*if \(line && !lyricsEditingHere\(\)\)/);
});

test('the autoscroll is held while a clip is open and released in view', () => {
  const tick = appSource.slice(appSource.indexOf('function practiceLyricsTick('));
  assert.match(tick, /if \(lyricsEditDraft\.activeIndex != null\) practice\.lyricsHold = true;/);
  assert.match(tick, /lyricsLineInView\(scroll, target\)\) practice\.lyricsHold = false;/);
});
