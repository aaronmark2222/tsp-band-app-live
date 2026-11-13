// iPhone only: the on-screen keyboard leaves the fixed playback bar anchored
// to a viewport that no longer exists. The bar leaves the layout while the
// keyboard is up and is rebuilt into place afterwards. Nothing may run while
// the page is merely scrolling.
const test = require('node:test');
const assert = require('node:assert/strict');
const { appSource } = require('./helpers');
const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../styles.css'), 'utf8');

test('the bar is never moved by hand, and the viewport is only watched while the keyboard is up', () => {
  assert.equal(appSource.includes('--pt-bottom'), false);
  assert.match(css, /\.pt-bar \{ position: fixed; left: 0; right: 0; bottom: 0;/);
  const listener = appSource.slice(appSource.indexOf("window.visualViewport.addEventListener('resize'"));
  assert.match(listener, /if \(!IPHONE \|\| !document\.body\.classList\.contains\('keyboard-open'\)\) return;/);
});

test('the bar waits for the keyboard animation to finish', () => {
  assert.match(appSource, /function ptKeyboardGone\(\) \{/);
  assert.match(appSource, /return vv\.height >= window\.innerHeight - 80;/);
  const closed = appSource.slice(appSource.indexOf('function ptKeyboardClosed()'), appSource.indexOf('if (window.visualViewport) {'));
  assert.match(closed, /if \(ptKeyboardGone\(\)\) ptKeyboardRestore\(\);/);
  assert.match(closed, /setTimeout\(ptKeyboardRestore, 1600\)/); // the fallback
});

test('the bar leaves the layout while the keyboard is up', () => {
  assert.match(css, /body\.keyboard-open #practice-transport \{ display: none !important; \}/);
  assert.match(appSource, /document\.body\.classList\.add\('keyboard-open'\)/);
  assert.match(appSource, /document\.body\.classList\.remove\('keyboard-open'\)/);
});

test('it is put back only once no field has focus', () => {
  assert.match(appSource, /if \(ptTypingTarget\(document\.activeElement\)\) return; \/\/ moved to another field/);
  assert.match(appSource, /setTimeout\(ptReanchorBar, 220\); \/\/ once more after the layout has settled/);
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
