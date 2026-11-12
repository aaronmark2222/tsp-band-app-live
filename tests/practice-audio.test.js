const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers');

const BUDGET = 320 * 1048576;
const RATES = [44100, 32000, 24000, 22050];
const PARTS = ['Part - Bass', 'Part - Keyboard', 'Part - Guitar', 'Part - Drums', 'Backing', 'CPC'];
const STEMS = ['Stem - Bass', 'Stem - Drums', 'Stem - Other', 'Stem - Vocals'];

function engine({ phone = true, seconds = 241, elements = [...PARTS, ...STEMS], settings = {} } = {}) {
  const tracks = elements.map((element) => ({ element, bytes: 4e6 }));
  const practice = { songId: 'E5', mono: false, buffers: new Map(), nodes: new Map(), loadState: new Map(), decodedBytes: 0, playing: false,
    ctx: { createBuffer: (ch, length, rate) => ({ numberOfChannels: ch, length, sampleRate: rate, data: new Float32Array(length), getChannelData() { return this.data; } }) } };
  const ctx = load(['practiceDecodePlan', 'practiceAudibleElements', 'practiceIsDualMono', 'practiceToMono', 'practiceFitBuffer', 'practiceForgetBuffer', 'practiceMakeRoom', 'practiceEagerTracks', 'practiceMultiLoaded'], {
    PHONE: phone, PRACTICE_MEM_BUDGET: BUDGET, PRACTICE_RATES: RATES, practice,
    state: { songs: [{ id: 'E5', duration_seconds: seconds }] },
    practiceMultiTracks: () => tracks,
    practiceTrackSetting: (element) => ({ on: !element.startsWith('Stem'), solo: false, vol: 1, ...(settings[element] || {}) }),
    practiceBufferBytes: (buffer) => buffer.length * buffer.numberOfChannels * 4
  });
  return { ctx, tracks, practice };
}
const buffer = (channels, length, pattern) => ({
  numberOfChannels: channels, length, sampleRate: 44100,
  getChannelData: (c) => Float32Array.from({ length }, (unused, i) => (pattern && c === 1 ? pattern(i) : i / length))
});

test('a computer decodes every track, in stereo, at the device sample rate', () => {
  const { ctx, tracks } = engine({ phone: false });
  const plan = ctx.practiceDecodePlan(tracks);
  assert.equal(plan.rate, 0);
  assert.equal(plan.mono, false);
  assert.equal(plan.eager.size, tracks.length);
});

test('a phone plays a normal song in stereo and leaves the silent stems for later', () => {
  const { ctx, tracks } = engine({ seconds: 241 });
  const plan = ctx.practiceDecodePlan(tracks);
  assert.equal(plan.mono, false, 'stereo');
  assert.ok(plan.rate >= 24000, `kept a usable sample rate, got ${plan.rate}`);
  assert.ok(246 * 4 * plan.rate * 2 * plan.eager.size <= BUDGET, 'fits the phone budget');
  for (const element of PARTS) assert.ok(plan.eager.has(element), `${element} is decoded up front`);
  assert.ok(STEMS.some((element) => !plan.eager.has(element)), 'the stems that do not fit wait until they are switched on');
});

test('every track being listened to is decoded up front, switched-on stems included', () => {
  const { ctx, tracks } = engine({ settings: { 'Stem - Vocals': { on: true } } });
  const plan = ctx.practiceDecodePlan(tracks);
  for (const element of ctx.practiceAudibleElements(tracks)) assert.ok(plan.eager.has(element), `${element} is ready to play`);
  assert.ok(plan.eager.has('Stem - Vocals'));
  assert.ok(plan.eager.size <= tracks.length);
});

test('soloing one track makes it the only one that has to be ready', () => {
  const { ctx, tracks } = engine({ settings: { 'Part - Drums': { solo: true } } });
  assert.deepEqual([...ctx.practiceAudibleElements(tracks)], ['Part - Drums']);
  const plan = ctx.practiceDecodePlan(tracks);
  assert.ok(plan.eager.has('Part - Drums'));
});

test('a long medley falls back to mono and only decodes what fits', () => {
  const { ctx, tracks } = engine({ seconds: 764, elements: [...PARTS, ...PARTS.map((p) => p + ' 2'), ...STEMS] });
  const plan = ctx.practiceDecodePlan(tracks);
  assert.equal(plan.mono, true, 'mono rather than a crash');
  assert.ok(plan.eager.size >= 1 && plan.eager.size < tracks.length);
  assert.ok(764 * 4 * plan.rate * plan.eager.size <= BUDGET);
});

test('a track with the same signal in both channels is stored once; a real stereo track keeps both', () => {
  const { ctx, practice } = engine();
  assert.equal(ctx.practiceFitBuffer(buffer(2, 64, (i) => i / 64)).numberOfChannels, 1, 'dual mono collapses');
  assert.equal(ctx.practiceFitBuffer(buffer(2, 64, (i) => 1 - i / 64)).numberOfChannels, 2, 'stereo is kept');
  assert.equal(ctx.practiceFitBuffer(buffer(1, 64)).numberOfChannels, 1);
  practice.mono = true;
  assert.equal(ctx.practiceFitBuffer(buffer(2, 64, (i) => 1 - i / 64)).numberOfChannels, 1, 'the mono plan still wins');
});

test('making room drops only tracks nobody is listening to, newest first, and keeps the count right', () => {
  const { ctx, practice } = engine();
  const put = (element, bytes) => { practice.buffers.set(element, { length: bytes / 4, numberOfChannels: 1 }); practice.decodedBytes += bytes; };
  put('Part - Bass', 100 * 1048576);
  put('Stem - Drums', 100 * 1048576);
  put('Stem - Other', 100 * 1048576);
  ctx.practiceMakeRoom(100 * 1048576);
  assert.ok(practice.buffers.has('Part - Bass'), 'an audible track is never dropped');
  assert.ok(!practice.buffers.has('Stem - Other'), 'a silent stem makes way');
  assert.ok(practice.buffers.has('Stem - Drums'), 'only as many as needed are dropped');
  assert.equal(practice.decodedBytes, 200 * 1048576);
});

test('the mixer unlocks when the planned tracks are in, and a failed track does not lock it', () => {
  const { ctx, practice } = engine();
  practice.eager = new Set(['Part - Bass', 'Part - Keyboard']);
  assert.equal(ctx.practiceMultiLoaded(), false);
  practice.buffers.set('Part - Bass', buffer(2, 8));
  assert.equal(ctx.practiceMultiLoaded(), false);
  practice.loadState.set('Part - Keyboard', 'error');
  assert.equal(ctx.practiceMultiLoaded(), true);
  assert.deepEqual(ctx.practiceEagerTracks().map((t) => t.element), ['Part - Bass', 'Part - Keyboard']);
});
