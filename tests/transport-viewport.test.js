// iPhone only: the on-screen keyboard leaves the fixed playback bar anchored
// to a viewport that no longer exists. The bar leaves the layout while the
// keyboard is up and is rebuilt into place afterwards. Nothing may run while
// the page is merely scrolling.
const test = require('node:test');
const assert = require('node:assert/strict');
const { appSource } = require('./helpers');
const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../styles.css'), 'utf8');

test('nothing listens to the visual viewport or moves the bar by hand', () => {
  assert.equal(appSource.includes('visualViewport.addEventListener'), false);
  assert.equal(appSource.includes('--pt-bottom'), false);
  assert.match(css, /\.pt-bar \{ position: fixed; left: 0; right: 0; bottom: 0;/);
});

test('the bar leaves the layout while the keyboard is up', () => {
  assert.match(css, /body\.keyboard-open #practice-transport \{ display: none !important; \}/);
  assert.match(appSource, /document\.body\.classList\.add\('keyboard-open'\)/);
  assert.match(appSource, /document\.body\.classList\.remove\('keyboard-open'\)/);
});

test('it is put back only once the keyboard has really gone', () => {
  assert.match(appSource, /if \(ptTypingTarget\(document\.activeElement\)\) return;/);
  assert.match(appSource, /ptKeyboardTimers = \[120, 350, 700\]\.map/);
});

test('putting it back forces a real reflow', () => {
  const fn = appSource.slice(appSource.indexOf('function ptReanchorBar()'), appSource.indexOf('function ptKeyboardOpen()'));
  assert.match(fn, /bar\.style\.display = 'none';/);
  assert.match(fn, /void bar\.offsetHeight;/);
  assert.match(fn, /bar\.style\.display = '';/);
});

test('only text fields count, and only on iPhone', () => {
  assert.match(appSource, /const IPHONE = \/iPhone\|iPod\/\.test/);
  assert.match(appSource, /function ptKeyboardOpen\(\) \{\n  if \(!IPHONE\) return;/);
  assert.match(appSource, /input:not\(\[type=range\]\)/);
});
