const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers');

const ctx = load(['pendingLyricsRowMatchesSnapshot', 'classifyPendingLyricsRows', 'baselineTracksForSave', 'reconcileLyricsAfterRead'],
  { lyricsRowKey: (row) => `${row.song_id}|${row.track_slug}` });

const line = (t, text) => ({ t, e: t + 2, text });
const track = (slug, ...lines) => ({ slug, label: slug, lines });
// Baseline the edits were made against.
const baseline = () => new Map([
  ['E1', { song_id: 'E1', tracks: [track('guitar', line(0, 'G one'), line(4, 'G two')), track('keyboard', line(0, 'K one'))] }],
  ['E2', { song_id: 'E2', tracks: [track('guitar', line(0, 'X one'))] }],
]);
const row = (song, slug, base, lines, updated = 'T1') => ({ song_id: song, track_slug: slug, updated_at: updated, base_lines: base, lines });
const snapshotOf = (songs) => ({ songs: Object.fromEntries(Object.entries(songs).map(([id, tracks]) => [id, { lyrics: { tracks } }])) });

// In-memory stand-in for Supabase: queued edit rows and the stored baseline.
function fakeIo(edits) {
  const store = { edits: edits.map((e) => ({ ...e })), baseline: null, calls: [] };
  return {
    store,
    async currentEdits() { store.calls.push('current'); return store.edits.map(({ song_id, track_slug, updated_at }) => ({ song_id, track_slug, updated_at })); },
    async saveBaseline(snapshot, held, previous) {
      store.calls.push('save');
      store.baseline = Object.fromEntries(Object.entries(snapshot.songs).map(([id, data]) =>
        [id, ctx.baselineTracksForSave(data.lyrics.tracks, held.get(id), previous.get(id)?.tracks)]));
      return Object.keys(store.baseline).length;
    },
    async deleteEdit(target) {
      store.calls.push('delete');
      const i = store.edits.findIndex((e) => e.song_id === target.song_id && e.track_slug === target.track_slug && e.updated_at === target.updated_at);
      if (i < 0) return false;
      store.edits.splice(i, 1); return true;
    },
  };
}
const text = (tracks, slug) => tracks.find((t) => t.slug === slug)?.lines.map((l) => l.text);

test('a matching edit is cleared and the saved set becomes the baseline', async () => {
  const b = baseline();
  const edit = row('E1', 'guitar', b.get('E1').tracks[0].lines, [line(0, 'G one'), line(4, 'G TWO edited')]);
  const io = fakeIo([edit]);
  const snap = snapshotOf({ E1: [track('guitar', line(0, 'G one'), line(4, 'G TWO edited')), track('keyboard', line(0, 'K one'))], E2: [track('guitar', line(0, 'X one'))] });
  const out = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [edit], baselineBySong: b }, io);
  assert.equal(out.cleared.length, 1);
  assert.equal(out.unconfirmed.length, 0);
  assert.equal(io.store.edits.length, 0);
  assert.deepEqual(text(io.store.baseline.E1, 'guitar'), ['G one', 'G TWO edited']);
});

test('a conflicting edit stays queued, is reported, and keeps its old baseline; other data still saves', async () => {
  const b = baseline();
  const edit = row('E1', 'guitar', b.get('E1').tracks[0].lines, [line(0, 'G one'), line(4, 'member text')]);
  const io = fakeIo([edit]);
  // Saved set has a different hand edit on the same clip, and an unrelated keyboard change.
  const snap = snapshotOf({ E1: [track('guitar', line(0, 'G one'), line(4, 'hand edit in Live')), track('keyboard', line(0, 'K changed'))], E2: [track('guitar', line(0, 'X new'))] });
  const out = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [edit], baselineBySong: b }, io);
  assert.equal(out.cleared.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(out.unconfirmed)), [{ song_id: 'E1', track_slug: 'guitar' }]);
  assert.equal(io.store.edits.length, 1, 'edit must remain queued');
  assert.deepEqual(text(io.store.baseline.E1, 'guitar'), ['G one', 'G two'], 'conflicting track keeps the baseline the edit was made against');
  assert.deepEqual(text(io.store.baseline.E1, 'keyboard'), ['K changed'], 'unrelated track updates');
  assert.deepEqual(text(io.store.baseline.E2, 'guitar'), ['X new'], 'unrelated song updates');
  assert.ok(!io.store.calls.includes('delete'));
});

test('mixed: the matching edit clears, the conflicting one stays', async () => {
  const b = baseline();
  const good = row('E2', 'guitar', b.get('E2').tracks[0].lines, [line(0, 'X edited')]);
  const bad = row('E1', 'keyboard', b.get('E1').tracks[1].lines, [line(0, 'K member')]);
  const io = fakeIo([good, bad]);
  const snap = snapshotOf({ E1: [track('guitar', line(0, 'G one'), line(4, 'G two')), track('keyboard', line(0, 'K one'))], E2: [track('guitar', line(0, 'X edited'))] });
  const out = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [good, bad], baselineBySong: b }, io);
  assert.equal(out.cleared.length, 1);
  assert.equal(out.unconfirmed.length, 1);
  assert.deepEqual(io.store.edits.map((e) => e.song_id), ['E1']);
});

test('a second edit arriving during the sync is not cleared and keeps its baseline', async () => {
  const b = baseline();
  const edit = row('E1', 'guitar', b.get('E1').tracks[0].lines, [line(0, 'G one'), line(4, 'first edit')]);
  const io = fakeIo([{ ...edit, updated_at: 'T2', lines: [line(0, 'G one'), line(4, 'second edit')] }]); // changed since validation
  const snap = snapshotOf({ E1: [track('guitar', line(0, 'G one'), line(4, 'first edit')), track('keyboard', line(0, 'K one'))] });
  const out = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [edit], baselineBySong: b }, io);
  assert.equal(out.cleared.length, 0);
  assert.equal(out.changed.length, 1);
  assert.equal(io.store.edits.length, 1);
  assert.equal(io.store.edits[0].lines[1].text, 'second edit');
  assert.deepEqual(text(io.store.baseline.E1, 'guitar'), ['G one', 'G two']);
});

test('a brand-new edit that appeared during the sync keeps its baseline too', async () => {
  const b = baseline();
  const io = fakeIo([row('E2', 'guitar', [], [line(0, 'late edit')], 'T9')]);
  const snap = snapshotOf({ E2: [track('guitar', line(0, 'hand edit'))] });
  const out = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [], baselineBySong: b }, io);
  assert.equal(out.cleared.length, 0);
  assert.deepEqual(text(io.store.baseline.E2, 'guitar'), ['X one']);
});

test('a row that changes between the check and the delete is reported, not lost', async () => {
  const b = baseline();
  const edit = row('E2', 'guitar', b.get('E2').tracks[0].lines, [line(0, 'X edited')]);
  const io = fakeIo([edit]);
  io.deleteEdit = async () => false; // the guarded delete matched nothing
  const snap = snapshotOf({ E2: [track('guitar', line(0, 'X edited'))] });
  const out = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [edit], baselineBySong: b }, io);
  assert.equal(out.cleared.length, 0);
  assert.equal(out.changed.length, 1);
  assert.equal(io.store.edits.length, 1);
});

test('a failed snapshot read changes nothing', async () => {
  const io = fakeIo([row('E1', 'guitar', [], [])]);
  await assert.rejects(() => ctx.reconcileLyricsAfterRead(null, { rowsToClear: [], baselineBySong: new Map() }, io));
  await assert.rejects(() => ctx.reconcileLyricsAfterRead({ ok: false }, { rowsToClear: [], baselineBySong: new Map() }, io));
  assert.deepEqual(io.store.calls, []);
  assert.equal(io.store.edits.length, 1);
});

test('retrying the same sync is safe and gives the same result', async () => {
  const b = baseline();
  const edit = row('E1', 'guitar', b.get('E1').tracks[0].lines, [line(0, 'G one'), line(4, 'G TWO edited')]);
  const io = fakeIo([edit]);
  const snap = snapshotOf({ E1: [track('guitar', line(0, 'G one'), line(4, 'G TWO edited')), track('keyboard', line(0, 'K one'))] });
  await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [edit], baselineBySong: b }, io);
  const first = JSON.stringify(io.store.baseline);
  // Retry with the stale pending list (as if the page had not refreshed it).
  const again = await ctx.reconcileLyricsAfterRead(snap, { rowsToClear: [edit], baselineBySong: b }, io);
  assert.equal(again.cleared.length, 0);
  assert.equal(io.store.edits.length, 0);
  assert.equal(JSON.stringify(io.store.baseline), first);
});
