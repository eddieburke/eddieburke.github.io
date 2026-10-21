(() => {
  function bridge(message, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
      const receive = event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'archive-pocket-helper-response' || event.data.id !== id) return;
        cleanup();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.response || {});
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Capture Helper is not connected. Run Install.cmd, load the helper in your normal browser profile, then refresh this page.')); }, timeout);
      window.addEventListener('message', receive);
      window.postMessage({ channel: 'archive-pocket-helper-request', id, message }, location.origin);
    });
  }
  async function request(extensionId, message) {
    try { await bridge({ type: 'archive-pocket-ping' }, 1500); }
    catch (error) {
      if (!extensionId || !window.chrome?.runtime?.sendMessage) throw error;
      return new Promise((resolve, reject) => {
        window.chrome.runtime.sendMessage(extensionId, message, response => {
          const failure = window.chrome.runtime.lastError;
          if (failure) reject(new Error(failure.message));
          else resolve(response || {});
        });
      });
    }
    return bridge(message);
  }
  window.ArchivePocketHelper = Object.freeze({ request });
})();
