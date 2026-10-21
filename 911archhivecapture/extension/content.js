// Runs on pages so the helper can react after Archive Pocket explicitly opens a URL.
// It first asks the extension background whether THIS tab is an active capture target;
// it does not inspect page metadata unless the answer is yes.
if (!globalThis.__archivePocketContentInstalled) {
  globalThis.__archivePocketContentInstalled = true;
  const absolute = value => { try { const u = new URL(value, location.href); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const meta = names => {
    for (const name of names) { const el = document.querySelector(`meta[property="${name}"],meta[name="${name}"],meta[itemprop="${name}"]`); if (el?.content) return clean(el.content); }
    return '';
  };
  const firstText = selectors => { for (const selector of selectors) { const el = document.querySelector(selector); const text = clean(el?.innerText || el?.textContent); if (text) return text; } return ''; };
  const sourceType = () => {
    const host = location.hostname.toLowerCase();
    if (host.includes('web.archive.org')) return 'wayback'; if (host.includes('archive.org')) return 'archive';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook'; if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('threads.')) return 'threads'; if (host.includes('linkedin.com')) return 'linkedin'; return 'other';
  };
  const dateIso = value => { const parsed = Date.parse(value); return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10); };
  function readPage() {
    const images = [...document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[property="og:video"],meta[name="twitter:player:stream"],img[src],video[src],video[poster],video source[src],audio[src],audio source[src]')]
      .map(el => absolute(el.content || el.src || el.poster)).filter(Boolean).filter((url, i, list) => list.indexOf(url) === i).slice(0, 40);
    const time = meta(['article:published_time', 'datePublished', 'date', 'og:updated_time']) || document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    const type = sourceType();
    let person = meta(['article:author', 'author', 'twitter:creator']);
    if (!person) person = firstText(type === 'instagram' ? ['header a[role="link"]', 'header a', 'main header a'] : type === 'facebook' ? ['h2 a', 'h3 a'] : []);
    let title = meta(['og:title', 'twitter:title', 'title', 'headline']) || document.title;
    if (!title) title = firstText(['h1', '[role="main"] h2']);
    return { sourceUrl: location.href, sourceType: type, title: clean(title), person: clean(person), postedDate: dateIso(time), notes: meta(['og:description', 'description', 'twitter:description']), media: images };
  }
  function startPicker(field) {
    document.querySelector('#archive-pocket-picker-layer')?.remove();
    const layer = document.createElement('div'); layer.id = 'archive-pocket-picker-layer'; layer.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #47d5c4;background:rgba(71,213,196,.18);box-shadow:0 0 0 9999px rgba(13,28,47,.13);display:none;';
    document.documentElement.append(layer);
    const place = el => { const r = el.getBoundingClientRect(); Object.assign(layer.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); };
    const move = event => { const el = document.elementFromPoint(event.clientX, event.clientY); if (el && el !== layer) place(el); };
    const finish = event => { event.preventDefault(); event.stopImmediatePropagation(); const el = document.elementFromPoint(event.clientX, event.clientY); const raw = field === 'image' ? absolute(el?.currentSrc || el?.src || el?.getAttribute?.('poster') || '') : clean(el?.innerText || el?.textContent); const value = field === 'postedDate' ? (dateIso(el?.getAttribute?.('datetime') || raw) || raw) : raw; cleanup(); if (value) chrome.runtime.sendMessage({ type: 'archive-pocket-picked', field, value }); };
    const cancel = event => { if (event.key === 'Escape') cleanup(); };
    const cleanup = () => { layer.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('click', finish, true); document.removeEventListener('keydown', cancel, true); };
    document.addEventListener('mousemove', move, true); document.addEventListener('click', finish, true); document.addEventListener('keydown', cancel, true);
  }
  function tryAutomaticCapture() {
    chrome.runtime.sendMessage({ type: 'archive-pocket-check-auto' }, response => {
      if (chrome.runtime.lastError || !response?.capture) return;
      // Social and single-page apps often fill metadata after document_idle. Report twice;
      // the background keeps the more complete of the two readings.
      setTimeout(() => chrome.runtime.sendMessage({ type: 'archive-pocket-page-read', capture: readPage() }), 1500);
      setTimeout(() => chrome.runtime.sendMessage({ type: 'archive-pocket-page-read', capture: readPage() }), 4300);
    });
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'archive-pocket-read') respond(readPage());
    if (message?.type === 'archive-pocket-pick') { startPicker(message.field); respond({ ok: true }); }
  });
  tryAutomaticCapture();
}
