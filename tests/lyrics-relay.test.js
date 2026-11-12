const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers');

const ctx = load(['lyricsRelayStateLines', 'lyricsRelayStateMatches', 'lyricsRelayPlan', 'relayLyricsRows', 'mergeLyricsEditorLines', 'lyricsEditStatus'],
  { LYRICS_RELAY_ERRORS: { source_changed: 'changed by hand.' } });
const plain = (value) => JSON.parse(JSON.stringify(value));
const L = (t, text) => ({ t, e: t + 2, text });
const row = (song, track, lines, applied, extra = {}) => ({ song_id: song, track_slug: track, updated_at: 'u1', lines, source_lines: lines,
  base_lines: applied || extra.saved || [], applied_lines: applied || null, saved_base_lines: extra.saved || [], saved_lines: applied ? lines : null, ...extra });

test('only edits that are not in Live yet are sent; a full check sends all', () => {
  const done = row('E1', 'guitar', [L(0, 'new')], [L(0, 'new')]);
  const todo = row('E1', 'keyboard', [L(0, 'new2')], [L(0, 'new')]);
  const fresh = row('E2', 'guitar', [L(0, 'x')], null);
  assert.deepEqual(plain(ctx.lyricsRelayPlan([done, todo, fresh]).send.map((r) => r.track_slug + r.song_id)), ['keyboardE1', 'guitarE2']);
  assert.equal(ctx.lyricsRelayPlan([done, todo, fresh], { full: true }).send.length, 3);
});

test('a refused edit waits, but is sent again as soon as it is saved again or on a full check', () => {
  const r = row('E1', 'guitar', [L(0, 'new')], null);
  const refused = new Map([['E1|guitar', { updated_at: 'u1', until: 2000 }]]);
  assert.equal(ctx.lyricsRelayPlan([r], { refused, now: 1000 }).send.length, 0);
  assert.equal(ctx.lyricsRelayPlan([r], { refused, now: 3000 }).send.length, 1);
  assert.equal(ctx.lyricsRelayPlan([{ ...r, updated_at: 'u2' }], { refused, now: 1000 }).send.length, 1);
  assert.equal(ctx.lyricsRelayPlan([r], { refused, now: 1000, full: true }).send.length, 1);
});

test('several tracks from several devices go to Live in one request', async () => {
  const rows = [row('E1', 'guitar', [L(0, 'a')]), row('E1', 'keyboard', [L(0, 'b')]), row('H2', 'drums', [L(0, 'c')])];
  const calls = [];
  const out = await ctx.relayLyricsRows(rows, async (edits) => { calls.push(edits.length); return { ok: true }; });
  assert.deepEqual(calls, [3]);
  assert.equal(out.applied.length, 3);
  assert.equal(out.refused.length, 0);
});

test('Live was reopened without saving: the edit is retried against the saved set and applied', async () => {
  const saved = [L(0, 'saved')];
  const r = row('E1', 'guitar', [L(0, 'second edit')], [L(0, 'first edit')], { saved });
  const bases = [];
  const out = await ctx.relayLyricsRows([r], async (edits) => {
    bases.push(edits[0].base_lines[0].text);
    return edits[0].base_lines[0].text === 'saved' ? { ok: true } : { ok: false, error: 'source_changed', song_id: 'E1', track_slug: 'guitar' };
  });
  assert.deepEqual(bases, ['first edit', 'saved']);
  assert.equal(out.applied.length, 1);
  assert.equal(out.refused.length, 0);
});

test('a real conflict is set aside and the other tracks still apply', async () => {
  const rows = [row('E1', 'guitar', [L(0, 'a')], [L(0, 'old')], { saved: [L(0, 's')] }), row('E1', 'keyboard', [L(0, 'b')]), row('H2', 'chords', [L(0, 'c')])];
  const out = await ctx.relayLyricsRows(rows, async (edits) =>
    edits.some((e) => e.track_slug === 'guitar') ? { ok: false, error: 'source_changed', song_id: 'E1', track_slug: 'guitar' } : { ok: true });
  assert.deepEqual(plain(out.applied.map((r) => r.track_slug)), ['keyboard', 'chords']);
  assert.deepEqual(plain(out.refused), [{ song_id: 'E1', track_slug: 'guitar', updated_at: 'u1', error: 'source_changed' }]);
});

test('a busy bridge is reported for a quick retry, not as a conflict', async () => {
  const out = await ctx.relayLyricsRows([row('E1', 'guitar', [L(0, 'a')])], async () => ({ ok: false, error: 'busy' }));
  assert.equal(out.busy, true);
  assert.equal(out.refused.length, 0);
  assert.equal(out.applied.length, 0);
});

test('an unexplained bridge failure throws so the relay retries; nothing is marked applied', async () => {
  await assert.rejects(() => ctx.relayLyricsRows([row('E1', 'guitar', [L(0, 'a')])], async () => ({ ok: false, error: 'timeout' })));
});

test('two devices editing different lines of one track are merged', () => {
  const mine = [{ ...L(0, 'one'), opened: 'one', changed: false }, { ...L(4, 'TWO mine'), opened: 'two', changed: true }];
  const theirs = [L(0, 'ONE theirs'), L(4, 'two')];
  const m = plain(ctx.mergeLyricsEditorLines(mine, theirs));
  assert.deepEqual(m.lines.map((l) => l.text), ['ONE theirs', 'TWO mine']);
  assert.equal(m.both, 0);
  assert.equal(m.taken, 1);
  assert.ok(!('changed' in m.lines[0]) && !('opened' in m.lines[1]));
});

test('both devices changed the same line: this editor wins and it is counted', () => {
  const m = plain(ctx.mergeLyricsEditorLines([{ ...L(0, 'mine'), opened: 'one', changed: true }], [L(0, 'theirs')]));
  assert.deepEqual(m.lines.map((l) => l.text), ['mine']);
  assert.equal(m.both, 1);
});

test('a clip added or moved on the other device cannot be merged', () => {
  const mine = [{ ...L(0, 'a'), opened: 'a', changed: true }];
  assert.equal(ctx.mergeLyricsEditorLines(mine, [L(0, 'a'), L(4, 'b')]), null);
  assert.equal(ctx.mergeLyricsEditorLines(mine, [L(9, 'a')]), null);
});

test('status line: queued, sending, in Ableton, needs attention', () => {
  const edit = { lines: [L(0, 'a')], applied_lines: null, relay_error: null };
  assert.equal(ctx.lyricsEditStatus(null, {}), null);
  assert.equal(ctx.lyricsEditStatus(edit, { available: false }).state, 'queued');
  assert.equal(ctx.lyricsEditStatus(edit, { available: true }).state, 'sending');
  assert.equal(ctx.lyricsEditStatus({ ...edit, applied_lines: [L(0, 'a')] }, { available: true }).state, 'applied');
  assert.equal(ctx.lyricsEditStatus({ ...edit, applied_lines: [L(0, 'older')] }, { available: true }).state, 'sending');
  assert.equal(ctx.lyricsEditStatus({ ...edit, relay_error: 'source_changed' }, { available: true }).state, 'attention');
});
