const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers');

// The shared clock: a follower predicts the host's position from an anchor and
// the measured difference between the two devices' clocks, so the lyrics never
// wait for the next message.
function follower({ offset = 0 } = {}) {
  const room = { code: 'K7QD', role: 'follower', channel: {}, members: [], state: null, anchor: null,
    offset, rtt: null, synced: false, samples: [], pings: new Map() };
  const ctx = load(['roomPosition', 'roomAccuracy', 'roomOnPong', 'roomHosting', 'roomFollowing', 'roomCmd'],
    { room, ROOM_SAMPLE_LIFE_MS: 120000, roomDeviceId: 'me', renderRoomUi: () => {}, state: { member: { name: 'Rowen' } } });
  return { ctx, room };
}

test('a paused host holds the follower at the same place', () => {
  const { ctx, room } = follower();
  room.state = { position: 62.5, at: Date.now() - 4000, playing: false };
  assert.equal(ctx.roomPosition(), 62.5);
});

test('a playing host carries the follower forward with its own clock', () => {
  const { ctx, room } = follower();
  room.state = { position: 10, at: Date.now() - 2000, playing: true };
  assert.ok(Math.abs(ctx.roomPosition() - 12) < 0.05, 'two seconds on from the anchor');
});

test('a clock that is ahead of ours is corrected for, not added to the position', () => {
  const hostAhead = 5000; // the host's clock reads 5 s later than ours
  const { ctx, room } = follower({ offset: hostAhead });
  room.state = { position: 30, at: Date.now() + hostAhead - 1000, playing: true };
  assert.ok(Math.abs(ctx.roomPosition() - 31) < 0.05);
});

test('the quickest round trip sets the offset, and later ones ease it over', () => {
  const { ctx, room } = follower();
  const t0 = Date.now();
  room.pings.set('a', t0 - 400);          // slow trip: 400 ms, lopsided
  ctx.roomOnPong({ id: 'a', t1: t0 - 400 + 350 });
  const afterSlow = room.offset;
  room.pings.set('b', t0 - 40);           // quick trip: 40 ms
  ctx.roomOnPong({ id: 'b', t1: t0 - 40 + 20 });
  assert.ok(Math.abs(room.rtt - 40) <= 5, `keeps the shortest round trip, got ${room.rtt}`);
  assert.notEqual(room.offset, afterSlow, 'moves towards the better sample');
  assert.ok(Math.abs(ctx.roomAccuracy() - 20) <= 3, 'reports half the round trip as the bound');
});

test('a pong nobody asked for is ignored', () => {
  const { ctx, room } = follower();
  ctx.roomOnPong({ id: 'nope', t1: Date.now() });
  assert.equal(room.synced, false);
  assert.equal(ctx.roomAccuracy(), null);
});

test('the follower sends its button presses instead of playing', () => {
  const sent = [];
  const room = { role: 'follower', channel: { send: (m) => sent.push(m.payload) }, state: {}, members: [] };
  const ctx = load(['roomCmd'], { room, roomDeviceId: 'me', state: { member: { name: 'Albert' } } });
  assert.equal(ctx.roomCmd('play'), true);
  assert.equal(ctx.roomCmd('seek', 42), true);
  assert.deepEqual(sent.map((p) => [p.action, p.value]), [['play', undefined], ['seek', 42]]);
});

test('the host and a device in no room play their own audio as usual', () => {
  for (const role of ['host', null]) {
    const ctx = load(['roomCmd'], { room: { role, channel: role ? {} : null }, roomDeviceId: 'me', state: {} });
    assert.equal(ctx.roomCmd('play'), false, `${role} plays locally`);
  }
});

// The host's own clock: a steady line rather than the coarse steps some
// browsers report for an <audio> element.
function host({ playing = true, position = 0 } = {}) {
  const practice = { songId: 'E5' };
  const room = { role: 'host', channel: {}, anchor: null };
  const live = { playing, position };
  const ctx = load(['roomHostAnchor'], { room, practice, ptIsPlaying: () => live.playing, ptPosition: () => live.position, ROOM_ANCHOR_SNAP: 0.25, ROOM_ANCHOR_EASE: 0.25 });
  return { ctx, room, live, practice };
}

test('small wobble is eased into the anchor, not jumped to', () => {
  const { ctx, room, live } = host({ position: 10 });
  const first = ctx.roomHostAnchor();
  assert.equal(first.pos, 10);
  live.position = 10.08; // a coarse reading a moment later
  const next = ctx.roomHostAnchor();
  // The anchor moves a quarter of the way to the new reading, so a follower
  // glides to it instead of stepping.
  assert.ok(next.pos > 10 && next.pos < 10.08, `eased, got ${next.pos}`);
  assert.ok(Math.abs(next.pos - 10.02) < 0.01, `a quarter of the error, got ${next.pos}`);
});

test('a steady clock leaves the anchor where it is', () => {
  const { ctx, live } = host({ position: 10 });
  ctx.roomHostAnchor();
  live.position = 10; // no time has passed in the test's clock either
  const next = ctx.roomHostAnchor();
  assert.ok(Math.abs(next.pos - 10) < 0.001);
});

test('a real jump (a seek), a pause or a new song makes a new anchor', () => {
  const { ctx, live, practice } = host({ position: 10 });
  const first = ctx.roomHostAnchor();
  live.position = 95;
  const afterSeek = ctx.roomHostAnchor();
  assert.notEqual(afterSeek, first);
  assert.equal(afterSeek.pos, 95);
  live.playing = false;
  const afterPause = ctx.roomHostAnchor();
  assert.equal(afterPause.playing, false);
  live.playing = true;
  practice.songId = 'H2';
  assert.equal(ctx.roomHostAnchor().songId, 'H2');
});

test('the host anchor is corrected a little on every send, not left to drift', () => {
  const { appSource } = require('./helpers');
  assert.match(appSource, /const ROOM_ANCHOR_SNAP = 0\.25;/);
  assert.match(appSource, /room\.anchor = \{ at: now, pos: predicted \+ error \* ROOM_ANCHOR_EASE, playing, songId: practice\.songId \};/);
});

test('state goes out twice a second and the clocks are re-checked every ten', () => {
  const { appSource } = require('./helpers');
  assert.match(appSource, /room\.stateTimer = setInterval\(roomSendState, 500\);/);
  assert.match(appSource, /room\.pingTimer = setInterval\(\(\) => roomPingBurst\(3\), 10000\);/);
});

test('a clock that really moved is taken at once', () => {
  const { appSource } = require('./helpers');
  assert.match(appSource, /else if \(Math\.abs\(delta\) > 120\) room\.offset \+= delta;/);
  assert.match(appSource, /if \(!document\.hidden && room\.role === 'follower'\) roomPingBurst\(5\)/);
});
