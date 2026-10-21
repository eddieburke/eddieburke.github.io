import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

const extractor = await readFile(new URL('../extension/extract.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const precise = 'Friday, September 11, 2026 at 8:37 PM';
const body = '25 years ago today I parked my car on William Street. I remember 9/11/2001. Thank you to all the first responders.';
function setup(html = '') {
  const { document, window } = parseHTML(`<!doctype html><html><head><meta property="og:title" content="Adam Riback"><meta name="description" content="${body}"></head><body>${html}</body></html>`);
  const listeners = [];
  const messages = [];
  const context = vm.createContext({ document, window, location: new URL('https://www.facebook.com/100003159618340/posts/28820774944277776'), URL, Date, Map, Set, console, setTimeout, clearTimeout, MouseEvent: window.Event, MutationObserver: window.MutationObserver, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), chrome: { runtime: { onMessage: { addListener: fn => listeners.push(fn) }, sendMessage: (message, callback) => { messages.push(message); callback?.({ capture: false }); } } } });
  vm.runInContext(extractor, context);
  const api = context.ArchivePocketExtract;
  vm.runInContext(content, context);
  const read = () => new Promise(resolve => listeners[0]({ type: 'archive-pocket-read-v2' }, {}, resolve));
  return { api, document, window, listeners, messages, read };
}
const post = (attribute = '') => `<article role="article"><h3><a href="/adam">Adam Riback</a></h3><a id="timestamp" href="/100003159618340/posts/28820774944277776" ${attribute}><span>September 11</span></a><div data-ad-preview="message">${body}</div></article>`;

test('parse screenshot tooltip with explicit year and preserve displayed calendar date', () => {
  const { api } = setup();
  assert.equal(api.dateIso(precise), '2026-09-11');
  assert.equal(api.dateIso('2026-09-11T23:37:00-07:00'), '2026-09-11');
  assert.equal(api.dateIso('11 September 2026 at 8:37 PM'), '2026-09-11');
  assert.equal(api.dateIso('September 11'), '');
  assert.equal(api.dateIso('9/11'), '');
  assert.equal(api.dateIso('25 years ago today, I remember September 11, 2001.'), '');
  assert.equal(api.dateIso('February 30, 2026'), '');
});
test('capture Facebook post body as title and notes, independently from author', async () => {
  const { read } = setup(post(`aria-label="${precise}"`));
  const result = await read();
  assert.equal(result.title, '25 years ago today I parked my car on William Street.');
  assert.equal(result.notes, body);
  assert.equal(result.person, 'Adam Riback');
  assert.equal(result.postedDate, '2026-09-11');
  assert.equal(result.postedDateText, precise);
});
test('discover full date in a dynamically created hover tooltip', async () => {
  const { read, document } = setup(post());
  document.querySelector('#timestamp').addEventListener('mouseover', event => {
    const tooltip = document.createElement('div');
    tooltip.id = 'date-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = precise;
    document.body.append(tooltip); event.currentTarget.setAttribute('aria-describedby', tooltip.id);
  });
  const result = await read();
  assert.equal(result.postedDate, '2026-09-11');
  assert.equal(result.postedDateText, precise);
});
test('do not invent a year or extract historical date from post text', async () => {
  const { read } = setup(post());
  assert.equal((await read()).postedDate, '');
});
test('select the linked post instead of an earlier unrelated article', async () => {
  const unrelated = '<article role="article"><h3><a>Other Author</a></h3><a href="/other/posts/123" aria-label="January 1, 2001">January 1</a><div data-ad-preview="message">Wrong post.</div></article>';
  const { read } = setup(unrelated + post(`title="${precise}"`));
  const result = await read();
  assert.equal(result.person, 'Adam Riback');
  assert.equal(result.postedDate, '2026-09-11');
  assert.equal(result.notes, body);
});
test('fresh extraction repairs legacy automatic dates while preserving deliberate edits', () => {
  const { api } = setup();
  const detected = { sourceUrl: 'https://example.org', title: 'Actual post', postedDate: '2026-09-11', postedDateText: precise };
  const old = { sourceUrl: detected.sourceUrl, title: 'Adam Riback', postedDate: '2001-09-11', tags: 'history' };
  assert.equal(api.mergeDraft(detected, old).postedDate, '2026-09-11');
  assert.equal(api.mergeDraft(detected, old).title, 'Actual post');
  assert.equal(api.mergeDraft(detected, old).tags, 'history');
  const edited = api.mergeDraft(detected, { ...old, manualFields: ['title'], title: 'My custom title' });
  assert.equal(edited.title, 'My custom title');
  assert.equal(edited.postedDate, '2026-09-11');
});
test('date picker waits for tooltip and saves the precise selected date', async () => {
  const { document, window, listeners, messages } = setup(post());
  const timestamp = document.querySelector('#timestamp span');
  timestamp.getBoundingClientRect = () => ({ left: 0, top: 0, width: 50, height: 20 });
  document.elementFromPoint = () => timestamp;
  listeners[0]({ type: 'archive-pocket-pick-v2', field: 'postedDate' }, {}, () => {});
  timestamp.dispatchEvent(new window.Event('mousemove', { bubbles: true }));
  timestamp.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(messages.filter(message => message.type === 'archive-pocket-picked').length, 0);
  document.querySelector('#timestamp').setAttribute('title', precise);
  timestamp.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  const picked = messages.find(message => message.type === 'archive-pocket-picked');
  assert.equal(picked.value, '2026-09-11');
  assert.equal(picked.postedDateText, precise);
});
