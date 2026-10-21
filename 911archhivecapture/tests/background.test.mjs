import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
function setup() {
  const saved = {};
  const listeners = [];
  const chrome = {
    storage: { local: { get: async defaults => ({ ...defaults, ...saved }), set: async data => Object.assign(saved, data) } },
    tabs: { create: async () => ({ id: 99 }), update: async () => ({}) },
    runtime: { onMessage: { addListener: fn => listeners.push(fn) }, getManifest: () => ({ version: '1.2.0' }) }
  };
  vm.runInNewContext(source, { chrome, URL, crypto: { randomUUID: () => 'request-1' }, Date, Math });
  const app = (message, sender = { tab: { id: 7 }, url: 'https://archive.github.io/app/', frameId: 0 }) => new Promise(resolve => listeners[0]({ type: 'archive-pocket-app-request', message }, sender, resolve));
  const page = (capture, frameId = 0) => new Promise(resolve => listeners[0]({ type: 'archive-pocket-page-read', capture }, { tab: { id: 99, url: 'https://example.org/article' }, frameId }, resolve));
  return { saved, app, page };
}
test('Firefox without onMessageExternal supports app requests and capture', async () => {
  const { app, page } = setup();
  assert.equal((await app({ type: 'archive-pocket-ping' })).connected, true);
  const start = await app({ type: 'archive-pocket-open-capture', sourceUrl: 'https://example.org/article' });
  assert.equal(start.requestId, 'request-1');
  await page({ title: 'Article', person: 'Author', media: ['https://example.org/image.png'] });
  const status = await app({ type: 'archive-pocket-capture-status', requestId: start.requestId });
  assert.equal(status.state, 'complete');
  assert.equal(status.capture.title, 'Article');
});
test('capture results belong to initiating app tab', async () => {
  const { app, page } = setup();
  await app({ type: 'archive-pocket-open-capture', sourceUrl: 'https://example.org' });
  await page({ title: 'Private title' });
  const status = await app({ type: 'archive-pocket-capture-status', requestId: 'request-1' }, { tab: { id: 8 }, url: 'https://archive.github.io/app/', frameId: 0 });
  assert.equal(status.state, 'missing');
  assert.equal(status.capture, undefined);
});
test('reject untrusted origins, iframe callers and non-web source URLs', async () => {
  const { app } = setup();
  for (const sender of [{ tab: { id: 7 }, url: 'https://archive.github.io.evil.org/', frameId: 0 }, { tab: { id: 7 }, url: 'https://archive.github.io/', frameId: 2 }]) {
    assert.equal((await app({ type: 'archive-pocket-ping' }, sender)).state, 'failed');
  }
  assert.equal((await app({ type: 'archive-pocket-open-capture', sourceUrl: 'file:///private' })).state, 'failed');
});
test('ignore iframe captures and expired requests', async () => {
  const { app, page, saved } = setup();
  await app({ type: 'archive-pocket-open-capture', sourceUrl: 'https://example.org' });
  assert.equal((await page({ title: 'Iframe' }, 2)).ignored, true);
  saved.archivePocketAutoCapture.startedAt -= 61000;
  assert.equal((await page({ title: 'Expired' })).ignored, true);
  assert.equal((await app({ type: 'archive-pocket-capture-status', requestId: 'request-1' })).state, 'failed');
});
test('dynamic capture keeps richer metadata', async () => {
  const { app, page } = setup();
  await app({ type: 'archive-pocket-open-capture', sourceUrl: 'https://example.org' });
  await page({ title: 'Full title', person: 'Author', media: ['https://example.org/image.png'] });
  await page({ title: 'Partial' });
  const status = await app({ type: 'archive-pocket-capture-status', requestId: 'request-1' });
  assert.equal(status.capture.title, 'Full title');
});
