// Loads named top-level functions out of app.js (a browser module with no
// exports) into a vm context, so the pure logic can be tested without a DOM.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');

function functionSource(name) {
  let start = appSource.indexOf(`\nasync function ${name}(`);
  if (start === -1) start = appSource.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = appSource.indexOf('{', appSource.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < appSource.length; i += 1) {
    if (appSource[i] === '{') depth += 1;
    if (appSource[i] === '}') { depth -= 1; if (depth === 0) return appSource.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${name}`);
}

function load(names, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(names.map(functionSource).join('\n'), context);
  return context;
}

module.exports = { appSource, functionSource, load };
