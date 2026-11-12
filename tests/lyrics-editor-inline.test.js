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

// Renders the whole lyrics card, reading and editing, through the real
// renderer: this is what catches a broken branch in its markup.
function renderWith(editing) {
  let html = '';
  const box = { innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null };
  Object.defineProperty(box, 'innerHTML', { get: () => html, set: (v) => { html = v; } });
  const lines = [{ t: 1, e: 5, text: 'first line', c: '#aabbcc' }, { t: 5, e: 9, text: 'second line' }];
  const draft = {
    songId: 'E1', songName: 'Song', slug: 'guitar',
    lines: lines.map((l, i) => ({ ...l, _editKey: 'k' + i, _sessionText: l.text, _addedThisSession: false })),
    sessionLines: lines.map((l, i) => ({ _editKey: 'k' + i, text: l.text })),
    abletonLines: lines.map((l) => ({ ...l })),
    updatedAt: null, hasOverride: false, restoreAbleton: false, activeIndex: editing ? 0 : null, message: '', saving: false
  };
  const ctx = load([
    'renderPracticeLyricsInner', 'lyricsEditorBodyHtml', 'lyricsEditorItems', 'lyricsEditorSectionIndex',
    'lyricsEditBarHtml', 'lyricsEditorHasChanges', 'lyricsEditorMatchesAbleton'
  ], {
    $: (sel) => (sel === '#practice-lyrics' ? box : null),
    practice: { songId: 'E1', lyrics: { tracks: [{ slug: 'guitar', label: 'Guitar', lines }], sections: [{ t: 0, name: 'Intro', c: '#2f4f7a' }, { t: 4, name: 'Verse', c: '#3f6f4a' }], duration_seconds: 20, lyricsEdits: [] } },
    state: { songs: [{ id: 'E1', name: 'Song' }], member: { is_admin: true } },
    lyricsEditDraft: editing ? draft : null,
    lyricsPrefs: () => ({ size: 'm', track: 'guitar' }),
    lyricsTrack: () => ({ slug: 'guitar', lines }),
    lyricsShownSlug: () => 'guitar',
    lyricsEditorTrackForMember: () => 'guitar',
    lyricsEditingHere: () => editing,
    lyricsEditStatus: () => null,
    lyricsTrackLabel: () => 'Guitar',
    LYRICS_STANDARD: [['chords', 'Chords'], ['guitar', 'Guitar']],
    LY_FS_ICONS: { enter: '<svg/>', exit: '<svg/>' },
    lyricsFs: { on: false },
    abletonPresence: { available: false },
    escapeHtml: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    lyricInk: (c) => (c ? c : ''),
    lyricLineHtml: (t) => String(t),
    lyricsClipTextForEditor: (t) => String(t),
    lyricsDotCount: () => 0,
    ptDuration: () => 20,
    practiceLyricsTick: () => {},
    practiceCheckLyricsLength: () => {}
  });
  ctx.renderPracticeLyricsInner();
  return html;
}

test('the lyrics view renders the editor in place of the lines', () => {
  const reading = renderWith(false);
  assert.match(reading, /<div class="ly-line" data-line="0" data-t="1" data-e="5"/);
  assert.equal(reading.includes('lyrics-edit-cell'), false);
  assert.equal(reading.includes('ly-edit-bar'), false);
  assert.match(reading, /Click a line to jump there/);

  const editing = renderWith(true);
  assert.match(editing, /id="practice-lyrics-scroll"/);
  assert.match(editing, /ly-edit-bar/);
  assert.match(editing, /class="ly-line lyrics-edit-cell editing[^"]*" data-edit-cell="0" data-line="0" data-t="1" data-e="5"/);
  assert.match(editing, /data-edit-line="0"/);
  assert.match(editing, /Tap a clip to edit it/);
  assert.equal(editing.includes('Click a line to jump there'), false);
  assert.equal(editing.includes('undefined'), false);
  assert.equal(/\$\{/.test(editing), false, 'unresolved template placeholder');
});

test('the track chips, sizes and the pencil stay while editing', () => {
  const editing = renderWith(true);
  assert.match(editing, /data-lyrics-track="chords"/);
  assert.match(editing, /data-lyrics-edit="guitar"/);
  assert.match(editing, /data-lyrics-size="l"/);
});

test('full screen keeps the editor, with its buttons as their own row', () => {
  assert.match(appSource, /if \(lyricsFs\.on\) lyricsFsShowControls\(6000\);/);
  assert.equal(appSource.includes('if (lyricsFs.on) lyricsFsExit(true);'), false);
  assert.match(appSource, /if \(lyricsEditDraft\) lyricsFs\.timer = setTimeout\(check, 500\); \/\/ editing: the buttons stay/);
  const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../styles.css'), 'utf8');
  assert.match(css, /body\.lyrics-fs #practice-lyrics \.ly-edit-bar \{/);
  assert.match(css, /body\.lyrics-fs\.lyrics-editing #practice-lyrics \.ly-scroll \{ padding-top:/);
});
