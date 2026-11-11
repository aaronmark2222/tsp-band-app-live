const assert = require('node:assert/strict');
const test = require('node:test');
const { load, appSource } = require('./helpers');

const ctx = load(['signOutKeysToRemove']);
const keys = ['tsp-data-cache-v1', 'tsp-offline-v1', 'tsp-offline-manifest-v1', 'tsp-practice-song', 'tsp-export-prefs-v1',
  'tsp-practice-lyrics-v2', 'sb-project-auth-token', 'unrelated'];

test('sign-out removes every app key and leaves other sites’ and Supabase’s own keys alone', () => {
  const removed = [...ctx.signOutKeysToRemove(keys, false)];
  assert.deepEqual(removed.sort(), keys.filter((k) => k.startsWith('tsp-')).sort());
  assert.ok(!removed.includes('sb-project-auth-token') && !removed.includes('unrelated'));
});

test('"keep saved audio" keeps only the two audio keys; band data still goes', () => {
  const removed = [...ctx.signOutKeysToRemove(keys, true)];
  assert.ok(removed.includes('tsp-data-cache-v1'));
  assert.ok(!removed.includes('tsp-offline-v1') && !removed.includes('tsp-offline-manifest-v1'));
});

test('every localStorage/Cache Storage name the app uses is covered by the cleanup', () => {
  const names = new Set([...appSource.matchAll(/'(tsp-[a-z0-9-]+)'/g)].map((m) => m[1]));
  const shell = 'tsp-app-shell-v1'; // public files only; kept on purpose
  const cachesCleared = ['tsp-offline-data-v1', 'tsp-practice-audio-v1'];
  const broadcast = 'tsp-practice-lyrics-sync'; // BroadcastChannel name and a transient key
  for (const name of names) {
    if (name === shell) continue;
    const coveredAsKey = ctx.signOutKeysToRemove([name], false).length === 1;
    assert.ok(coveredAsKey || cachesCleared.includes(name) || name === broadcast, `${name} is not removed at sign-out`);
  }
  for (const cache of cachesCleared) assert.ok(appSource.includes(`caches.delete('${cache}')`), `${cache} not deleted`);
  assert.ok(appSource.includes("indexedDB.deleteDatabase('tsp-offline')"));
});
