const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers');

const ctx = load(['audioInventoryCheck']);
const check = (available, state, songs) => JSON.parse(JSON.stringify(ctx.audioInventoryCheck(new Map(available), new Map(state), songs)));
const file = (element, ext = 'm4a') => ({ element, ext, bytes: 1 });

test('files and upload records that agree exactly report no problems', () => {
  const c = check([['E1', [file('Mixdown'), file('Part - Bass')]]], [['E1', { Mixdown: 'a', 'Part - Bass': 'b' }]], ['E1']);
  assert.deepEqual(c, { files: 2, records: 2, noRecord: [], noFile: [], legacy: [], unknownSongs: [] });
});

test('same counts but different keys are still reported', () => {
  const c = check([['E1', [file('Mixdown')]]], [['E2', { Mixdown: 'a' }]], ['E1', 'E2']);
  assert.equal(c.files, c.records);
  assert.deepEqual(c.noRecord, ['E1 Mixdown']);
  assert.deepEqual(c.noFile, ['E2 Mixdown']);
});

test('older MP3 files and files for unknown song IDs are listed', () => {
  const c = check([['E4', [file('Mixdown', 'mp3')]], ['ZZ9', [file('CPC')]]], [['E4', { Mixdown: 'a' }], ['ZZ9', { CPC: 'b' }]], ['E4']);
  assert.deepEqual(c.legacy, ['E4 Mixdown']);
  assert.deepEqual(c.unknownSongs, ['ZZ9']);
});
