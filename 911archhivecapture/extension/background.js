// Archive Pocket Capture Helper background service worker.
// The auto-capture workflow exists entirely inside the user's browser:
// a github.io Archive Pocket page asks us to open one URL; only that new tab's
// rendered metadata is accepted; the result is returned to that same app page.
const AUTO_CAPTURE_KEY = 'archivePocketAutoCapture';
const DRAFT_KEY = 'draft';

const requestId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const getAutoCapture = async () => (await chrome.storage.local.get({ [AUTO_CAPTURE_KEY]: null }))[AUTO_CAPTURE_KEY];
const setAutoCapture = value => chrome.storage.local.set({ [AUTO_CAPTURE_KEY]: value });

async function startAutoCapture(sourceUrl, sender) {
  let url;
  try { url = new URL(sourceUrl); } catch { throw new Error('The source URL is invalid.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) source URLs can be opened.');
  // Create a blank tab first so the pending request is stored before the source begins loading.
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  const capture = { requestId: requestId(), tabId: tab.id, ownerTabId: sender.tab.id, ownerOrigin: new URL(sender.url).origin, requestedUrl: url.href, state: 'pending', startedAt: Date.now() };
  await setAutoCapture(capture);
  await chrome.tabs.update(tab.id, { url: url.href });
  return capture;
}

function captureScore(capture) {
  return (capture.title ? 2 : 0) + (capture.person ? 2 : 0) + (capture.postedDate ? 1 : 0) + (capture.notes ? 1 : 0) + Math.min((capture.media || []).length, 5);
}

async function receivePageCapture(pageCapture, sender) {
  const active = await getAutoCapture();
  if (!active || active.tabId !== sender.tab?.id || sender.frameId !== 0 || Date.now() - active.startedAt > 60000 || !['pending', 'complete'].includes(active.state)) return { ignored: true };
  const incoming = { ...pageCapture, sourceUrl: sender.tab.url || pageCapture.sourceUrl, capturedAt: new Date().toISOString(), captureMethod: 'browser-helper-auto' };
  // A dynamic page may report more than once. Keep whichever reading is richer.
  const existing = active.capture || {};
  const capture = captureScore(incoming) >= captureScore(existing) ? incoming : existing;
  await setAutoCapture({ ...active, state: 'complete', capture, completedAt: Date.now() });
  return { accepted: true };
}

async function receivePicker(message) {
  const { draft = {} } = await chrome.storage.local.get({ draft: {} });
  const next = { ...draft };
  if (message.field === 'image') {
    const media = Array.isArray(next.media) ? next.media : [];
    if (message.value && !media.includes(message.value)) media.unshift(message.value);
    next.media = media;
  } else if (message.field && message.value) {
    next[message.field] = message.value;
    next.manualFields = [...new Set([...(next.manualFields || []), message.field])];
    if (message.field === 'postedDate') next.postedDateText = message.postedDateText || message.value;
  }
  await chrome.storage.local.set({ [DRAFT_KEY]: next });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;
  if (message.type === 'archive-pocket-app-request') {
    handleAppRequest(message.message, sender).then(sendResponse).catch(error => sendResponse({ state: 'failed', error: error.message || String(error) }));
    return true;
  }
  if (message.type === 'archive-pocket-check-auto') {
    getAutoCapture().then(active => sendResponse({ capture: Boolean(active && active.tabId === sender.tab?.id && sender.frameId === 0 && Date.now() - active.startedAt < 60000 && active.state === 'pending') }));
    return true;
  }
  if (message.type === 'archive-pocket-page-read') { receivePageCapture(message.capture || {}, sender).then(sendResponse); return true; }
  if (message.type === 'archive-pocket-picked') { receivePicker(message).then(sendResponse); return true; }
});

function trustedApp(sender) {
  try {
    const url = new URL(sender.url);
    return Number.isInteger(sender.tab?.id) && sender.frameId === 0 && (url.protocol === 'https:' && url.hostname.endsWith('.github.io') || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch { return false; }
}

async function handleAppRequest(message, sender) {
    if (!trustedApp(sender)) throw new Error('This page is not an allowed Archive Pocket app.');
    if (message?.type === 'archive-pocket-ping') return { version: chrome.runtime.getManifest().version, connected: true };
    if (!message?.type) throw new Error('Invalid Archive Pocket request.');
    if (message.type === 'archive-pocket-open-capture') {
      const capture = await startAutoCapture(message.sourceUrl, sender);
      return { requestId: capture.requestId, state: capture.state };
    }
    if (message.type === 'archive-pocket-capture-status') {
      const active = await getAutoCapture();
      if (!active || active.requestId !== message.requestId || active.ownerTabId !== sender.tab.id || active.ownerOrigin !== new URL(sender.url).origin) return { state: 'missing', error: 'The capture request is no longer available.' };
      if (active.state === 'pending' && Date.now() - active.startedAt > 60000) return { state: 'failed', error: 'The capture request expired.' };
      return { state: active.state, capture: active.capture, error: active.error || '' };
    }
    return { error: 'Unknown Archive Pocket request.' };
}

chrome.runtime.onMessageExternal?.addListener((message, sender, sendResponse) => {
  handleAppRequest(message, sender).then(sendResponse).catch(error => sendResponse({ state: 'failed', error: error.message || String(error) }));
  return true;
});
