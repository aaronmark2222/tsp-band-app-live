// iPhone Safari can leave a bottom-pinned bar floating above the screen edge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

function fit(innerHeight, viewport) {
  const set = [];
  const ctx = load(['ptBarFit'], {
    window: { innerHeight, visualViewport: viewport },
    document: { documentElement: { style: { setProperty: (name, value) => set.push([name, value]) } } },
    ptBarGap: 0
  });
  ctx.ptBarFit();
  return set;
}

test('a normal layout is left alone', () => {
  assert.deepEqual(fit(844, { offsetTop: 0, height: 844 }), []);
});

test('a gap under the bar is closed', () => {
  assert.deepEqual(fit(800, { offsetTop: 0, height: 844 }), [['--pt-bottom', '-40px']]);
});

test('the keyboard lifts the bar above itself', () => {
  assert.deepEqual(fit(844, { offsetTop: 0, height: 500 }), [['--pt-bottom', '344px']]);
});

test('a browser without a visual viewport changes nothing', () => {
  assert.deepEqual(fit(844, undefined), []);
});
