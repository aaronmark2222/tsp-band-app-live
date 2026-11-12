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
  assert.deepEqual(plain(out.refused), [{ song_id: 'E1', track_slug: 'guitar', updated_at: 'u1', error: 'source_changed', conflicts: null }]);
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
  assert.equal(ctx.lyricsEditStatus({ ...edit, relay_error: 'source_changed' }, { available: true }).state, 'sending');
  assert.match(ctx.lyricsEditStatus({ ...edit, relay_error: 'source_changed' }, {}).text, /decision/);
  assert.equal(ctx.lyricsEditStatus({ ...edit, relay_error: 'song_not_found' }, { available: true }).state, 'attention');
});

test('re-check of an edit believed to be in Live goes against the saved set first (Live reopened without saving)', async () => {
  const saved = [L(0, 'saved')];
  const r = row('E3', 'chords', [L(0, 'edited')], [L(0, 'edited')], { saved });
  const seen = [];
  const out = await ctx.relayLyricsRows([r], async (edits) => { seen.push(edits[0].base_lines[0].text); return { ok: true }; });
  assert.deepEqual(seen, ['saved']); // the bridge sees saved -> edited and renames the clip
  assert.equal(out.applied.length, 1);
});

test('re-check falls back to the applied state when the saved-set description does not fit Live', async () => {
  const r = row('E2', 'drums', [L(0, 'fill')], [L(0, 'fill')], { saved: [] });
  const seen = [];
  const out = await ctx.relayLyricsRows([r], async (edits) => {
    seen.push(edits[0].base_lines.length);
    return edits[0].base_lines.length === 0 ? { ok: false, error: 'clip_count_mismatch', song_id: 'E2', track_slug: 'drums' } : { ok: true };
  });
  assert.deepEqual(seen, [0, 1]);
  assert.equal(out.applied.length, 1);
  assert.equal(out.refused.length, 0);
});

test('four queued tracks after a Live restart: each is re-described against the saved set and all apply', async () => {
  const rows = ['I1', 'E2', 'E3', 'H1'].map((id) => row(id, 'chords', [L(0, 'edited ' + id)], [L(0, 'edited ' + id)], { saved: [L(0, 'saved ' + id)] }));
  let calls = 0;
  const out = await ctx.relayLyricsRows(rows, async (edits) => { calls += 1; return edits.every((e) => e.base_lines[0].text.startsWith('saved')) ? { ok: true } : { ok: false, error: 'source_changed', song_id: edits[0].song_id, track_slug: 'chords' }; });
  assert.equal(calls, 1);
  assert.equal(out.applied.length, 4);
});

const sig = load(['lyricsEditsSignature']);
test('the small poll notices a new edit, an apply, a refusal and a new baseline', () => {
  const base = [{ track_slug: 'chords', updated_at: 'u1', relay_error: null, applied_at: null }];
  const s0 = sig.lyricsEditsSignature(base, 'b1');
  assert.equal(s0, sig.lyricsEditsSignature([{ ...base[0], lines: [1], applied_lines: null }], 'b1'));
  assert.notEqual(s0, sig.lyricsEditsSignature([{ ...base[0], updated_at: 'u2' }], 'b1'));
  assert.notEqual(s0, sig.lyricsEditsSignature([{ ...base[0], applied_at: 't' }], 'b1'));
  assert.notEqual(s0, sig.lyricsEditsSignature([{ ...base[0], relay_error: 'source_changed' }], 'b1'));
  assert.notEqual(s0, sig.lyricsEditsSignature(base, 'b2'));
  assert.notEqual(s0, sig.lyricsEditsSignature([], 'b1'));
});

const mm = load(['lyricsRelayAnnotate', 'lyricsConflictResolution', 'lyricsRelayStateLines', 'lyricsRelayStateMatches', 'relayLyricsRows']);
test('each clip is sent with the texts Practice itself put there, and whether Practice left it alone', () => {
  const saved = [L(0, 'one'), L(4, 'two')];
  const out = plain(mm.lyricsRelayAnnotate([L(0, 'one'), L(4, 'TWO v2'), { ...L(8, 'new'), is_new_clip: true }], saved, [L(0, 'one'), L(4, 'TWO v1')]));
  assert.deepEqual(out[0].accept, ['one']);
  assert.equal(out[0].untouched, true);
  assert.deepEqual(out[1].accept, ['two', 'TWO v1']);
  assert.equal(out[1].untouched, false);
  assert.ok(!('accept' in out[2]));
});

test('a mismatch reported by the bridge is passed on with the saved text, without trying the other baseline', async () => {
  const r = row('E5', 'guitar', [L(0, 'practice')], [L(0, 'practice')], { saved: [L(0, 'saved')] });
  let calls = 0;
  const out = await mm.relayLyricsRows([r], async () => { calls += 1; return { ok: false, error: 'source_changed', song_id: 'E5', track_slug: 'guitar', conflicts: [{ line: 1, t: 0, base_text: 'practice', practice_text: 'practice', live_text: 'hand' }] }; });
  assert.equal(calls, 1);
  assert.deepEqual(plain(out.refused[0].conflicts), [{ line: 1, t: 0, base_text: 'saved', practice_text: 'practice', live_text: 'hand' }]);
});

test('decision "Use Practice edit": that clip is forced once, other lines untouched', () => {
  const lines = [L(0, 'a'), L(4, 'practice')];
  const conflicts = [{ line: 2, t: 4, base_text: 'saved', practice_text: 'practice', live_text: 'hand' }];
  const out = plain(mm.lyricsConflictResolution(lines, conflicts, 4, 'practice'));
  assert.deepEqual(out.lines, [L(0, 'a'), { ...L(4, 'practice'), force: true }]);
  assert.deepEqual(out.conflicts, []);
  // the forced flag is not part of the applied state, so it does not look like a new edit
  assert.ok(mm.lyricsRelayStateMatches(out.lines, lines));
});

test('decision "Keep Ableton": the queue adopts the text now in Live', () => {
  const conflicts = [{ line: 1, t: 0, base_text: 's1', practice_text: 'p1', live_text: 'hand1' }, { line: 2, t: 4, base_text: 's2', practice_text: 'p2', live_text: 'hand2' }];
  const out = plain(mm.lyricsConflictResolution([L(0, 'p1'), L(4, 'p2')], conflicts, 0, 'ableton'));
  assert.deepEqual(out.lines.map((l) => l.text), ['hand1', 'p2']);
  assert.equal(out.conflicts.length, 1); // the other clip still waits for a decision
});

test('keeping a clip Practice had removed puts it back with the Ableton text; unknown clips give null', () => {
  const conflicts = [{ line: 1, t: 0, base_text: 'fill', practice_text: null, live_text: 'hand fill' }];
  const out = plain(mm.lyricsConflictResolution([], conflicts, 0, 'ableton', L(0, 'fill')));
  assert.deepEqual(out.lines, [L(0, 'hand fill')]);
  assert.equal(mm.lyricsConflictResolution([L(0, 'x')], conflicts, 99, 'ableton'), null);
  assert.equal(mm.lyricsConflictResolution([], conflicts, 0, 'practice'), null);
});
