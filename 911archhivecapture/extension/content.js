


if (!globalThis.__archivePocketCaptureV2) {
  globalThis.__archivePocketCaptureV2 = true;
  const extract = globalThis.ArchivePocketExtract;
  const dateCache = new Map();
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
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
  const dateIso = extract.dateIso;
  function tooltipDate(element, previous = new Set()) {
    const attached = extract.dateFromElement(element);
    if (attached) return attached;
    for (const tooltip of document.querySelectorAll('[role="tooltip"]')) {
      if (previous.has(tooltip) || !extract.visible(tooltip)) continue;
      const raw = extract.text(tooltip);
      const date = dateIso(raw);
      if (date) return { date, text: raw };
    }
    return null;
  }
  function timestampTargets(scope) {
    return [...scope.querySelectorAll('time, abbr, a[href], [data-utime], [data-timestamp]')].filter(element => {
      if (!extract.visible(element)) return false;
      const label = clean(element.getAttribute('aria-label') || element.textContent);
      return element.matches('time, abbr, [data-utime], [data-timestamp]') || label.length < 100 && /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d|^\d+\s*(?:[mhdwy]|minutes?|hours?|days?|weeks?|years?)(?:\s|$)|^(?:Yesterday|Just now)$/i.test(label);
    }).slice(0, 5);
  }
  async function resolvePostDate(scope) {
    const known = extract.readDate(scope);
    if (known) { dateCache.set(location.href, known); return known; }
    if (dateCache.has(location.href)) return dateCache.get(location.href);
    for (const target of timestampTargets(scope)) {
      const previous = new Set([...document.querySelectorAll('[role="tooltip"]')].filter(extract.visible));
      for (const type of ['pointerover', 'mouseover', 'mouseenter']) target.dispatchEvent(new MouseEvent(type, { bubbles: true, view: window }));
      let found;
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          await wait(150);
          found = tooltipDate(target, previous);
          if (found) { dateCache.set(location.href, found); return found; }
        }
      } finally {
        for (const type of ['pointerout', 'mouseout', 'mouseleave']) target.dispatchEvent(new MouseEvent(type, { bubbles: true, view: window }));
      }
    }
    return null;
  }
  async function readPage() {
    const images = [...document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[property="og:video"],meta[name="twitter:player:stream"],img[src],video[src],video[poster],video source[src],audio[src],audio source[src]')]
      .map(el => absolute(el.content || el.src || el.poster)).filter(Boolean).filter((url, i, list) => list.indexOf(url) === i).slice(0, 40);
    const time = meta(['article:published_time', 'datePublished', 'date', 'og:updated_time']) || document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    const type = sourceType();
    const post = type === 'facebook' ? extract.readPost(document, location.href) : null;
    const exactDate = await resolvePostDate(post?.scope || document);
    let person = meta(['article:author', 'author', 'twitter:creator']);
    if (!person) person = firstText(type === 'instagram' ? ['header a[role="link"]', 'header a', 'main header a'] : type === 'facebook' ? ['h2 a', 'h3 a'] : []);
    if (post?.author) person = post.author;
    let title = meta(['og:title', 'twitter:title', 'title', 'headline']) || document.title;
    if (!title) title = firstText(['h1', '[role="main"] h2']);
    const notes = post?.body || meta(['og:description', 'description', 'twitter:description']);
    if (type === 'facebook') {
      if (!person && title && clean(title).length < 100 && !/[.!?]/.test(title) && !/^(?:Facebook|Log in|Sign up)/i.test(title)) person = clean(title).replace(/\s*[-|]\s*Facebook$/i, '');
      title = extract.titleFromText(notes) || post?.title || '';
    }
    return { sourceUrl: location.href, sourceType: type, title: clean(title), person: clean(person), postedDate: exactDate?.date || dateIso(time), postedDateText: exactDate?.text || time, notes, media: images };
  }
  function startPicker(field) {
    document.querySelector('#archive-pocket-picker-layer')?.remove();
    const layer = document.createElement('div'); layer.id = 'archive-pocket-picker-layer'; layer.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #47d5c4;background:rgba(71,213,196,.18);box-shadow:0 0 0 9999px rgba(13,28,47,.13);display:none;';
    document.documentElement.append(layer);
    const place = el => { const r = el.getBoundingClientRect(); Object.assign(layer.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); };
    let hovered = null;
    let selectedDate = null;
    let seenTooltips = new Set();
    const move = event => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (el && el !== layer) {
        place(el);
        if (hovered !== el) { hovered = el; selectedDate = null; seenTooltips = new Set([...document.querySelectorAll('[role="tooltip"]')].filter(extract.visible)); }
        if (field === 'postedDate') selectedDate = tooltipDate(el, seenTooltips) || selectedDate;
      }
    };
    const observer = new MutationObserver(() => {
      if (field === 'postedDate' && hovered) selectedDate = tooltipDate(hovered, seenTooltips) || selectedDate;
    });
    if (field === 'postedDate') observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-describedby', 'aria-label', 'title'] });
    const finish = event => { event.preventDefault(); event.stopImmediatePropagation(); const el = document.elementFromPoint(event.clientX, event.clientY); const raw = field === 'image' ? absolute(el?.currentSrc || el?.src || el?.getAttribute?.('poster') || '') : clean(el?.innerText || el?.textContent); const exact = field === 'postedDate' ? tooltipDate(el, seenTooltips) || selectedDate : null; const value = field === 'postedDate' ? exact?.date || '' : raw; if (field === 'postedDate' && !value) { layer.textContent = 'Hover the post timestamp until its full date appears, then click it. A year is required. Escape cancels.'; layer.style.color = '#102030'; layer.style.background = '#fff'; return; } cleanup(); if (value) chrome.runtime.sendMessage({ type: 'archive-pocket-picked', field, value, postedDateText: exact?.text }); };
    const cancel = event => { if (event.key === 'Escape') cleanup(); };
    const cleanup = () => { observer.disconnect(); layer.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('click', finish, true); document.removeEventListener('keydown', cancel, true); };
    document.addEventListener('mousemove', move, true); document.addEventListener('click', finish, true); document.addEventListener('keydown', cancel, true);
  }
  function tryAutomaticCapture() {
    chrome.runtime.sendMessage({ type: 'archive-pocket-check-auto' }, response => {
      if (chrome.runtime.lastError || !response?.capture) return;


      setTimeout(() => readPage().then(capture => chrome.runtime.sendMessage({ type: 'archive-pocket-page-read', capture })).catch(console.error), 1500);
      setTimeout(() => readPage().then(capture => chrome.runtime.sendMessage({ type: 'archive-pocket-page-read', capture })).catch(console.error), 4300);
    });
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'archive-pocket-read-v2') { readPage().then(respond).catch(error => respond({ error: error.message })); return true; }
    if (message?.type === 'archive-pocket-pick-v2') { startPicker(message.field); respond({ ok: true }); }
  });
  tryAutomaticCapture();
}
