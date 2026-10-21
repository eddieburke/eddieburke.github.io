(() => {
  const clean = value => String(value || '').replace(/[\s\u200e\u200f]+/g, ' ').trim();
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function calendar(year, month, day) {
    const date = new Date(Date.UTC(+year, +month - 1, +day));
    return +year >= 1900 && +year <= 2200 && date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
  }
  function dateIso(value) {
    const text = clean(value).replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i, '');
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}|[AP]M))?)?$/i);
    if (match) return calendar(match[1], match[2], match[3]);
    const suffix = '(?:\\s*(?:at|,)\\s*\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:[AP]M)?(?:\\s+[A-Z]{2,5})?)?';
    match = text.match(new RegExp('^([A-Za-z]+)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})' + suffix + '$', 'i'));
    if (match) {
      const month = months.findIndex(name => name === match[1].toLowerCase() || name.slice(0, 3) === match[1].toLowerCase());
      return month < 0 ? '' : calendar(match[3], month + 1, match[2]);
    }
    match = text.match(new RegExp('^(\\d{1,2})\\s+([A-Za-z]+)\\.?,?\\s+(\\d{4})' + suffix + '$', 'i'));
    if (match) {
      const month = months.findIndex(name => name === match[2].toLowerCase() || name.slice(0, 3) === match[2].toLowerCase());
      return month < 0 ? '' : calendar(match[3], month + 1, match[1]);
    }
    return '';
  }
  function visible(element) {
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = globalThis.getComputedStyle?.(element);
    return !style || style.display !== 'none' && style.visibility !== 'hidden';
  }
  function text(element) { return clean(element?.innerText || element?.textContent); }
  function dateFromElement(element) {
    for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
      for (const attribute of ['datetime', 'title', 'aria-label', 'data-tooltip-content']) {
        const raw = node.getAttribute(attribute);
        const date = dateIso(raw);
        if (date) return { date, text: clean(raw) };
      }
      for (const attribute of ['data-utime', 'data-timestamp']) {
        const raw = node.getAttribute(attribute);
        if (/^\d{10}(?:\d{3})?$/.test(raw || '')) {
          const date = new Date(+raw * (raw.length === 10 ? 1000 : 1));
          return { date: calendar(date.getFullYear(), date.getMonth() + 1, date.getDate()), text: date.toString() };
        }
      }
      for (const id of (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
        const raw = text(node.ownerDocument.getElementById(id));
        const date = dateIso(raw);
        if (date) return { date, text: raw };
      }
      const raw = text(node);
      const date = raw.length < 150 ? dateIso(raw) : '';
      if (date) return { date, text: raw };
      if (node.matches('article, [role="article"], [role="dialog"], main, body')) break;
    }
    return null;
  }
  const messageSelector = '[data-ad-preview="message"], [data-ad-rendering-role="story_message"], [data-testid="post_message"]';
  function postScope(document, href) {
    const candidates = [...document.querySelectorAll('[role="article"], article, [role="dialog"]')].filter(visible);
    const current = new URL(href);
    const identity = url => url.pathname.match(/\/(?:posts|videos)\/([^/]+)/)?.[1] || url.searchParams.get('story_fbid') || url.searchParams.get('fbid');
    const postId = identity(current);
    if (postId) {
      const exact = candidates.find(scope => [...scope.querySelectorAll('a[href]')].some(link => {
        try { return identity(new URL(link.getAttribute('href'), href)) === postId; } catch { return false; }
      }));
      if (exact) return exact;
    }
    return candidates.find(scope => scope.querySelector(messageSelector)) || document.querySelector('[role="main"], main') || document;
  }
  function titleFromText(value) {
    const first = clean(value).match(/^.*?[.!?](?=\s|$)/)?.[0] || clean(value);
    return first.length > 160 ? first.slice(0, 157).replace(/\s+\S*$/, '') + '…' : first;
  }
  function readPost(document, href) {
    const scope = postScope(document, href);
    const body = [...scope.querySelectorAll(messageSelector)].filter(visible).map(text).find(Boolean) || '';
    const author = [...scope.querySelectorAll('h2 a, h3 a, h4 a, strong a, a[role="link"] strong')].filter(visible).map(text).find(Boolean) || '';
    return { scope, body, author, title: titleFromText(body) };
  }
  function readDate(scope) {
    for (const element of scope.querySelectorAll('time, abbr, [data-utime], [data-timestamp], a[aria-label], a[title], a[aria-describedby], a[href*="/posts/"], a[href*="story_fbid"], a[href*="/permalink/"]')) {
      const article = element.closest('article, [role="article"]');
      if (scope.matches?.('article, [role="article"]') && article !== scope) continue;
      if (!visible(element)) continue;
      const date = dateFromElement(element);
      if (date) return date;
    }
    return null;
  }
  function mergeDraft(detected, old) {
    if (old.sourceUrl !== detected.sourceUrl) return { ...detected, manualFields: [] };
    const next = { ...old, ...detected, tags: old.tags || '', manualFields: old.manualFields || [], media: old.media?.length ? old.media : detected.media };
    for (const field of next.manualFields) if (Object.hasOwn(old, field)) next[field] = old[field];
    if (next.manualFields.includes('postedDate')) next.postedDateText = old.postedDateText || '';
    return next;
  }
  globalThis.ArchivePocketExtract = Object.freeze({ dateIso, dateFromElement, readDate, readPost, titleFromText, mergeDraft, clean, visible, text });
})();
