// iPhone only: after the on-screen keyboard closes, Safari can leave the
// fixed playback bar above the screen edge. The fix is a one-shot re-anchor
// after the keyboard goes away — nothing may run while the page scrolls.
const test = require('node:test');
const assert = require('node:assert/strict');
const { appSource } = require('./helpers');

test('nothing listens to the visual viewport any more', () => {
  assert.equal(appSource.includes('visualViewport.addEventListener'), false);
  assert.equal(appSource.includes('--pt-bottom'), false);
});

test('the bar is pinned to the bottom with plain CSS again', () => {
  const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../styles.css'), 'utf8');
  assert.match(css, /\.pt-bar \{ position: fixed; left: 0; right: 0; bottom: 0;/);
  assert.equal(css.includes('.pt-bar::after'), false);
});

test('the re-anchor runs only after a keyboard closes, and only on iPhone', () => {
  assert.match(appSource, /const IPHONE = \/iPhone\|iPod\/\.test/);
  assert.match(appSource, /function ptKeyboardClosed\(\) \{\n  if \(!IPHONE\) return;/);
  assert.match(appSource, /document\.addEventListener\('focusout', \(event\) => \{\n  if \(event\.target\?\.closest\?\.\('input, textarea, select, \[contenteditable\]'\)\) ptKeyboardClosed\(\);/);
});
