const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers');

// The mixer drop-up is the only place the multitrack rows live, so it has to
// open from the playback bar on the page, not only in full-screen lyrics.
function mixer({ fullScreen = false, tracks = [{ element: 'Part - Bass' }] } = {}) {
  const calls = [];
  const button = { classList: { add: () => calls.push('button-open'), remove: () => calls.push('button-closed') }, setAttribute: () => {} };
  const panel = { classList: { add: (c) => calls.push('panel-' + c) } };
  const ctx = load(['ptMixerOpen', 'ptMixerClose'], {
    ptMixer: { open: false },
    lyricsFs: { on: fullScreen },
    practiceMultiTracks: () => tracks,
    ptMixerRender: () => calls.push('render'),
    lyricsFsShowControls: () => {},
    document: { querySelector: () => button, getElementById: () => panel }
  });
  return { ctx, calls };
}

test('the mixer opens from the playback bar on the Practice page', () => {
  const { ctx, calls } = mixer();
  ctx.ptMixerOpen();
  assert.equal(ctx.ptMixer.open, true);
  assert.ok(calls.includes('render'));
});

test('it still opens in full-screen lyrics', () => {
  const { ctx } = mixer({ fullScreen: true });
  ctx.ptMixerOpen();
  assert.equal(ctx.ptMixer.open, true);
});

test('with no multitrack for this song it stays shut', () => {
  const { ctx, calls } = mixer({ tracks: [] });
  ctx.ptMixerOpen();
  assert.equal(ctx.ptMixer.open, false);
  assert.deepEqual(calls, []);
});

test('closing hides the panel and lets the button open it again', () => {
  const { ctx, calls } = mixer();
  ctx.ptMixerOpen();
  ctx.ptMixerClose();
  assert.equal(ctx.ptMixer.open, false);
  assert.ok(calls.includes('panel-hidden'));
  ctx.ptMixerOpen();
  assert.equal(ctx.ptMixer.open, true);
});

// Clicking a row redraws the mixer, so the clicked button leaves the page and
// "is this click inside the mixer?" has to be answered before that happens.
const decide = load(['ptMixerClickClosesIt']).ptMixerClickClosesIt;
const at = (patch = {}) => ({ mixer: false, transport: false, lyricsControls: false, ...patch });

test('a click on a track button inside the mixer leaves it open', () => {
  assert.equal(decide(at({ mixer: true }), { open: true, fullScreen: false }), false);
});

test('a click on the playback bar leaves it open', () => {
  assert.equal(decide(at({ transport: true }), { open: true, fullScreen: false }), false);
});

test('a click anywhere else on the page closes it', () => {
  assert.equal(decide(at(), { open: true, fullScreen: false }), true);
});

test('full screen keeps its own handling, and a shut mixer is left alone', () => {
  assert.equal(decide(at(), { open: true, fullScreen: true }), false);
  assert.equal(decide(at(), { open: false, fullScreen: false }), false);
});
