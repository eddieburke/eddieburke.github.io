(() => {
  if (window !== window.top) return;
  const allowed = location.protocol === 'https:' && location.hostname.endsWith('.github.io') || location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!allowed) return;
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'archive-pocket-helper-request') return;
    const { id, message } = event.data;
    if (typeof id !== 'string' || id.length > 100 || !['archive-pocket-ping', 'archive-pocket-open-capture', 'archive-pocket-capture-status'].includes(message?.type)) return;
    chrome.runtime.sendMessage({ type: 'archive-pocket-app-request', message }, response => {
      const error = chrome.runtime.lastError?.message;
      window.postMessage({ channel: 'archive-pocket-helper-response', id, response, error }, location.origin);
    });
  });
})();
