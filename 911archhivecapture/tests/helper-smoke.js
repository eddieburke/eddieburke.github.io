const query = new URLSearchParams(location.search);
const browserName = query.get('browser');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let result;
try {
  let connected = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await window.ArchivePocketHelper.request('', { type: 'archive-pocket-ping' }); connected = true; break; }
    catch { await delay(500); }
  }
  if (!connected) throw new Error('Helper did not connect. See the installer log.');
  const start = await window.ArchivePocketHelper.request('', { type: 'archive-pocket-open-capture', sourceUrl: new URL('/tests/fixture.html', location.href).href });
  if (!start.requestId) throw new Error(start.error || 'No capture request ID returned.');
  let capture;
  for (let attempt = 0; attempt < 30; attempt++) {
    await delay(1000);
    const status = await window.ArchivePocketHelper.request('', { type: 'archive-pocket-capture-status', requestId: start.requestId });
    if (status.error) throw new Error(status.error);
    if (status.state === 'complete') { capture = status.capture; break; }
  }
  if (capture?.title !== 'Archive Pocket browser smoke test' || capture.person !== 'Archive Pocket Test Author' || capture.postedDate !== '2026-10-21' || !capture.media?.some(url => url.endsWith('/icons/icon.svg'))) throw new Error(`Captured fields did not match: ${JSON.stringify(capture)}`);
  result = { ok: true, message: 'Installed; real page capture passed (title, author, date, image).', capture };
} catch (error) { result = { ok: false, message: error.message }; }
document.querySelector('#heading').textContent = `${browserName}: ${result.ok ? 'ready to test' : 'setup failed'}`;
document.querySelector('#result').textContent = result.message;
document.querySelector('#details').textContent = JSON.stringify(result.capture || {}, null, 2);
await fetch(`/__installer/result?token=${encodeURIComponent(query.get('token'))}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
