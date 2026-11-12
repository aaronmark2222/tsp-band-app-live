// iPhone Safari can leave a bottom-pinned bar floating above the screen edge,
// most often after the keyboard closes. The fix measures where the bar landed
// rather than guessing why, so one pass puts it back.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, appSource } = require('./helpers');

function fit({ innerHeight = 844, viewport = { offsetTop: 0, height: 844 }, barBottom = 844, barHeight = 60, gap = 0 }) {
  const set = [];
  const ctx = load(['ptBarFit'], {
    window: { innerHeight, visualViewport: viewport },
    document: {
      documentElement: { style: { setProperty: (name, value) => set.push([name, value]) } },
      getElementById: () => (barHeight ? { getBoundingClientRect: () => ({ bottom: barBottom, height: barHeight }) } : null)
    },
    ptBarGap: gap
  });
  ctx.ptBarFit();
  return set;
}

test('a bar already on the edge is left alone', () => {
  assert.deepEqual(fit({}), []);
});

test('a bar left floating above the edge is pushed back down', () => {
  // What the keyboard leaves behind: the bar's bottom is 24px short.
  assert.deepEqual(fit({ barBottom: 820 }), [['--pt-bottom', '-24px']]);
});

test('a correction already in place is adjusted, not restarted', () => {
  assert.deepEqual(fit({ barBottom: 820, gap: 10 }), [['--pt-bottom', '-14px']]);
});

test('the keyboard lifts the bar above itself', () => {
  assert.deepEqual(fit({ viewport: { offsetTop: 0, height: 500 } }), [['--pt-bottom', '344px']]);
});

test('a hidden bar and a browser without a visual viewport are skipped', () => {
  assert.deepEqual(fit({ barHeight: 0 }), []);
  assert.deepEqual(fit({ viewport: undefined }), []);
});

test('the bar is re-measured while the keyboard animation settles', () => {
  assert.match(appSource, /window\.addEventListener\('focusout', ptBarSettle\)/);
  assert.match(appSource, /\[60, 180, 340, 550, 900\]\.map/);
});
