// The room QR code: built here, read back with the same decoder the scanner
// uses, so a symbol that would not scan fails the build.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./helpers');

const names = ['qrEncode', 'qrEcCodewords', 'qrGaloisTables', 'qrReserved', 'qrPatterns', 'qrFormatBits', 'qrPlaceFormat', 'qrPenalty', 'qrSvg', 'roomCodeFromScan'];
function qr() {
  return load(names, { QR_SIZE: 21, QR_MASKS: [
    (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ], TextEncoder, escapeHtml: (s) => String(s), ROOM_QR_PREFIX: 'TSP:' });
}

test('the symbol has its finder patterns, timing and dark module', () => {
  const m = qr().qrEncode('TSP:ABCD');
  assert.equal(m.length, 21);
  for (const [r, c] of [[0, 0], [0, 14], [14, 0]]) {
    assert.equal(m[r][c], true, 'finder corner');
    assert.equal(m[r + 1][c + 1], false, 'finder ring');
    assert.equal(m[r + 3][c + 3], true, 'finder core');
  }
  assert.equal(m[6][8], true, 'timing starts dark');
  assert.equal(m[6][9], false);
  assert.equal(m[13][8], true, 'the dark module');
});

test('a scanner reads back what was encoded', { skip: skipReason() }, () => {
  const jsQRModule = require(path.resolve(__dirname, '../vendor/jsqr.js'));
  const jsQR = jsQRModule.default || jsQRModule;
  const ctx = qr();
  for (const text of ['TSP:ABCD', 'TSP:9Z7Q', 'TSP:0000', 'TSP:ZZZZ']) {
    const m = ctx.qrEncode(text);
    const scale = 8; const quiet = 4; const n = (21 + quiet * 2) * scale;
    const data = new Uint8ClampedArray(n * n * 4).fill(255);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
      const r = Math.floor(y / scale) - quiet; const c = Math.floor(x / scale) - quiet;
      const dark = r >= 0 && c >= 0 && r < 21 && c < 21 && m[r][c];
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255;
    }
    assert.equal(jsQR(data, n, n)?.data, text, text);
  }
});
function skipReason() {
  try { require(path.resolve(__dirname, '../vendor/jsqr.js')); return false; } catch { return 'the vendored decoder is not present'; }
}

test('the SVG is square, white-backed and carries a label', () => {
  const svg = qr().qrSvg('TSP:ABCD', { size: 120, label: 'Room ABCD' });
  assert.match(svg, /^<svg class="room-qr" width="120" height="120" viewBox="0 0 25 25"/);
  assert.match(svg, /aria-label="Room ABCD"/);
  assert.match(svg, /<rect width="25" height="25" fill="#fff"\/>/);
});

test('a scanned code is understood however it arrives', () => {
  const { roomCodeFromScan } = qr();
  assert.equal(roomCodeFromScan('TSP:ABCD'), 'ABCD');
  assert.equal(roomCodeFromScan('abcd'), 'ABCD');
  assert.equal(roomCodeFromScan(' tsp:9z7q '), '9Z7Q');
  assert.equal(roomCodeFromScan('https://example.com/app/#room=WXYZ'), 'WXYZ');
  assert.equal(roomCodeFromScan('https://example.com/?room=wxyz&x=1'), 'WXYZ');
  assert.equal(roomCodeFromScan('nonsense'), null);
  assert.equal(roomCodeFromScan(''), null);
  assert.equal(roomCodeFromScan('TSP:AB'), null);
});
