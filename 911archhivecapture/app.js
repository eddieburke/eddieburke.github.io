/* Archive Pocket — a dependency-free, local-first catalog.
   Records live in IndexedDB. Settings are localStorage. No cookies, account data,
   or page content is sent anywhere unless the user chooses GitHub Sync. */
(() => {
  'use strict';

  const DB_NAME = 'archive-pocket-db';
  const DB_VERSION = 1;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const state = { entries: [], assetUrls: new Map(), currentView: 'library' };

  const sourceNames = {
    facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', linkedin: 'LinkedIn',
    archive: 'Internet Archive', wayback: 'Wayback Machine', other: 'Website'
  };

  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async function store(name, mode = 'readonly') {
    const db = await dbPromise;
    return db.transaction(name, mode).objectStore(name);
  }
  async function allFromStore(name) {
    const objectStore = await store(name);
    return new Promise((resolve, reject) => { const r = objectStore.getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  async function put(storeName, value) {
    const objectStore = await store(storeName, 'readwrite');
    return new Promise((resolve, reject) => { const r = objectStore.put(value); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  async function remove(storeName, key) {
    const objectStore = await store(storeName, 'readwrite');
    return new Promise((resolve, reject) => { const r = objectStore.delete(key); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); });
  }

  function id(prefix = 'rec') { return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`; }
  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
  function validUrl(value) { try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
  function shortHost(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; } }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function displayDate(value, fallback = 'Date unknown') {
    if (!value) return fallback;
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }
  function dateValue(value) { return value ? Date.parse(value.length === 10 ? `${value}T12:00:00` : value) || 0 : 0; }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3600); }
  function fileSafeName(value) { return (value || 'archive-pocket').replace(/[^a-z0-9_-]+/gi, '-').replace(/(^-|-$)/g, '').slice(0, 70) || 'archive-pocket'; }
  function downloadBlob(blob, filename) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  function detectSource(url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { return 'other'; }
    if (host.includes('web.archive.org')) return 'wayback';
    if (host.includes('archive.org')) return 'archive';
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host.includes('fb.watch')) return 'facebook';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'threads.net' || host.endsWith('.threads.net') || host === 'threads.com' || host.endsWith('.threads.com')) return 'threads';
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
    return 'other';
  }

  function guessFromUrl(value) {
    const sourceUrl = validUrl(value);
    if (!sourceUrl) return { sourceType: 'other', title: '', person: '' };
    const sourceType = detectSource(sourceUrl);
    let title = '';
    let person = '';
    try {
      const u = new URL(sourceUrl);
      // A common Wayback convention appends a human title after a colon:
      // .../page.html:Radio_mookie
      const finalColon = sourceUrl.lastIndexOf(':');
      const afterProtocol = sourceUrl.indexOf('//') + 2;
      if (finalColon > afterProtocol && finalColon > sourceUrl.lastIndexOf('/')) {
        title = decodeURIComponent(sourceUrl.slice(finalColon + 1)).replace(/[_-]+/g, ' ').trim();
      }
      if (!title && sourceType === 'archive') {
        const parts = u.pathname.split('/').filter(Boolean);
        const position = parts.findIndex(x => x === 'details');
        if (position >= 0 && parts[position + 1]) title = decodeURIComponent(parts[position + 1]).replace(/[_-]+/g, ' ');
      }
      if (!title && sourceType === 'wayback') {
        const original = u.pathname.replace(/^\/web\/\d+(id_|im_|if_|js_|cs_)?\//, '');
        if (original) title = decodeURIComponent(original.split('/').pop() || '').replace(/\.(html?|php|asp|aspx)$/i, '').replace(/[_-]+/g, ' ');
      }
      if (sourceType === 'instagram') {
        const match = u.pathname.match(/^\/([^/]+)\/p\//);
        if (match) person = match[1];
      }
      if (sourceType === 'facebook') {
        const match = u.pathname.match(/^\/([^/]+)\/posts\//);
        if (match && !/^\d+$/.test(match[1])) person = match[1].replace(/[_-]+/g, ' ');
      }
    } catch { /* already validated */ }
    return { sourceType, title: sentenceCase(title), person: sentenceCase(person) };
  }
  function sentenceCase(text) {
    if (!text) return '';
    return text.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim();
  }

  function getSettings() {
    const defaults = { repoName: '', repoBranch: 'main', repoPath: 'data/archive.json', mediaPath: 'media', extensionId: '' };
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem('archive-pocket-settings')) || {}) }; }
    catch { return defaults; }
  }
  function saveSettings(settings) { localStorage.setItem('archive-pocket-settings', JSON.stringify(settings)); }

  function normalizeMedia(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map(item => {
      if (typeof item === 'string') return { id: id('media'), type: 'remote', url: validUrl(item), alt: '' };
      return {
        id: item.id || id('media'), type: item.type === 'local' ? 'local' : 'remote',
        url: validUrl(item.url || ''), assetId: item.assetId || '', alt: String(item.alt || ''),
        name: String(item.name || '')
      };
    }).filter(item => item.type === 'local' || item.url);
  }

  function normalizeEntry(raw) {
    const sourceUrl = validUrl(raw.sourceUrl || raw.url || raw.canonical || '');
    const inferred = guessFromUrl(sourceUrl);
    const capturedAt = raw.capturedAt || raw.createdAt || new Date().toISOString();
    const postedDate = String(raw.postedDate || raw.date || raw.datePublished || '').slice(0, 10);
    const tags = Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',');
    return {
      id: raw.id || id(), sourceUrl, sourceType: Object.prototype.hasOwnProperty.call(sourceNames, raw.sourceType) ? raw.sourceType : inferred.sourceType,
      title: String(raw.title || raw.headline || inferred.title || 'Untitled capture').trim().slice(0, 500),
      person: String(raw.person || raw.author || raw.account || inferred.person || '').trim().slice(0, 300),
      postedDate, notes: String(raw.notes || raw.description || '').trim().slice(0, 10000),
      tags: tags.map(x => String(x).trim().replace(/^#/, '')).filter(Boolean).slice(0, 25),
      media: normalizeMedia(raw.media || raw.images || raw.image),
      capturedAt, updatedAt: new Date().toISOString(),
      captureMethod: raw.captureMethod || 'manual'
    };
  }

  async function loadEntries() {
    state.entries = await allFromStore('entries');
    state.entries = state.entries.map(normalizeEntry);
    await refreshAssetUrls();
    renderLibrary();
    updateCounts();
    updateTransferInfo();
  }
  async function refreshAssetUrls() {
    for (const url of state.assetUrls.values()) URL.revokeObjectURL(url);
    state.assetUrls.clear();
    const assets = await allFromStore('assets');
    for (const asset of assets) if (asset.blob) state.assetUrls.set(asset.id, URL.createObjectURL(asset.blob));
  }
  async function saveEntry(entry) {
    entry.updatedAt = new Date().toISOString();
    await put('entries', entry);
    const index = state.entries.findIndex(e => e.id === entry.id);
    if (index < 0) state.entries.unshift(entry); else state.entries[index] = entry;
    renderLibrary(); updateCounts(); updateTransferInfo();
  }
  async function deleteEntry(entry) {
    if (!confirm(`Delete “${entry.title}”? This only removes the local catalog record.`)) return;
    for (const media of entry.media || []) if (media.type === 'local' && media.assetId) await remove('assets', media.assetId);
    await remove('entries', entry.id);
    state.entries = state.entries.filter(e => e.id !== entry.id);
    await refreshAssetUrls(); renderLibrary(); updateCounts(); updateTransferInfo();
    $('#entryDialog').close(); toast('Capture deleted.');
  }

  function updateCounts() {
    $('#entryCount').textContent = state.entries.length;
    const local = state.entries.filter(e => e.media.some(m => m.type === 'local')).length;
    $('#statsRow').innerHTML = state.entries.length ? `<span class="stat"><b>${state.entries.length}</b> capture${state.entries.length === 1 ? '' : 's'}</span><span class="stat"><b>${new Set(state.entries.map(e => e.sourceType)).size}</b> source types</span>${local ? `<span class="stat"><b>${local}</b> with local media</span>` : ''}` : '';
  }
  function updateTransferInfo() {
    const localCount = state.entries.reduce((sum, e) => sum + e.media.filter(m => m.type === 'local').length, 0);
    $('#exportInfo').textContent = state.entries.length ? `${state.entries.length} record${state.entries.length === 1 ? '' : 's'}${localCount ? ` · ${localCount} local file${localCount === 1 ? '' : 's'} not included` : ''}` : 'No records yet';
  }

  function firstMedia(entry) { return (entry.media || []).find(m => (m.type === 'local' && state.assetUrls.get(m.assetId)) || (m.type !== 'local' && m.url)); }
  function mediaUrl(media) { return media.type === 'local' ? state.assetUrls.get(media.assetId) || '' : media.url; }
  function renderLibrary() {
    const query = ($('#searchInput').value || '').trim().toLowerCase();
    const source = $('#sourceFilter').value;
    const order = $('#sortSelect').value;
    let entries = state.entries.filter(entry => {
      const haystack = [entry.title, entry.person, entry.notes, entry.tags.join(' '), entry.sourceUrl, sourceNames[entry.sourceType]].join(' ').toLowerCase();
      return (!source || entry.sourceType === source) && (!query || haystack.includes(query));
    });
    entries.sort((a, b) => {
      if (order === 'title') return a.title.localeCompare(b.title);
      if (order === 'posted') return dateValue(b.postedDate) - dateValue(a.postedDate) || dateValue(b.capturedAt) - dateValue(a.capturedAt);
      return dateValue(b.capturedAt) - dateValue(a.capturedAt);
    });
    const grid = $('#entryGrid');
    $('#emptyLibrary').hidden = state.entries.length > 0;
    if (!entries.length) {
      grid.innerHTML = state.entries.length ? `<div class="empty-state"><div class="empty-glyph">⌕</div><h2>No matching captures.</h2><p>Try removing a filter or searching for another word.</p></div>` : '';
      return;
    }
    grid.innerHTML = entries.map(entry => {
      const media = firstMedia(entry); const image = mediaUrl(media || {});
      const tags = entry.tags.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
      return `<article class="entry-card" data-entry-id="${escapeHtml(entry.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(entry.title)}">
        <div class="entry-image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(media?.alt || '')}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'image-empty\'>⌑</div>'">` : `<div class="image-empty">⌑</div>`}<span class="source-chip">${escapeHtml(sourceNames[entry.sourceType])}</span></div>
        <div class="entry-body"><div class="entry-heading"><h3>${escapeHtml(entry.title)}</h3><button class="entry-menu" data-open-entry="${escapeHtml(entry.id)}" aria-label="Open capture">⋯</button></div>
        ${entry.person ? `<p class="entry-person">${escapeHtml(entry.person)}</p>` : '<span></span>'}
        <div class="entry-meta"><span>${escapeHtml(displayDate(entry.postedDate, 'Date unknown'))}</span><span>${escapeHtml(shortHost(entry.sourceUrl))}</span></div>${tags ? `<div class="tag-list">${tags}</div>` : ''}</div></article>`;
    }).join('');
  }

  function setView(view) {
    state.currentView = view;
    const labels = { library: ['YOUR ARCHIVE', 'Library'], add: ['NEW RECORD', 'New capture'], imports: ['PORTABLE DATA', 'Import & export'], settings: ['ARCHIVE SETTINGS', 'Repository'] };
    $$('.view').forEach(el => el.classList.remove('active-view'));
    $(`#${view}View`).classList.add('active-view');
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    $('#viewEyebrow').textContent = labels[view][0]; $('#viewTitle').textContent = labels[view][1];
    $('.sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function parsePastedContent(rawText) {
    const result = { title: '', person: '', postedDate: '', notes: '', media: [] };
    const parser = new DOMParser(); const doc = parser.parseFromString(rawText, 'text/html');
    const meta = (names) => {
      for (const name of names) {
        const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`);
        if (el?.content) return el.content.trim();
      } return '';
    };
    result.title = meta(['og:title', 'twitter:title', 'title', 'headline']) || doc.querySelector('title')?.textContent.trim() || '';
    result.person = meta(['article:author', 'author', 'og:site_name', 'twitter:creator']);
    result.postedDate = meta(['article:published_time', 'datePublished', 'date', 'og:updated_time']).slice(0, 10);
    result.notes = meta(['og:description', 'description', 'twitter:description']);
    const imageTags = $$('meta[property="og:image"], meta[name="twitter:image"], img[src]', doc);
    result.media = imageTags.map(el => validUrl(el.content || el.src || '')).filter(Boolean).slice(0, 30);
    for (const script of $$('script[type="application/ld+json"]', doc)) {
      try { inspectJsonLd(JSON.parse(script.textContent), result); } catch { /* invalid JSON-LD is ignored */ }
    }
    // Useful when someone has pasted a copied text card instead of the source HTML.
    if (!result.person) { const author = rawText.match(/(?:by|author)\s*[:\-]?\s*@?([^\n|•]{2,80})/i); if (author) result.person = author[1].trim(); }
    if (!result.postedDate) { const date = rawText.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/); if (date) result.postedDate = date[1].replaceAll('/', '-'); }
    return result;
  }
  function inspectJsonLd(value, result) {
    if (Array.isArray(value)) { value.forEach(item => inspectJsonLd(item, result)); return; }
    if (!value || typeof value !== 'object') return;
    const data = value['@graph'] || value;
    if (data !== value) { inspectJsonLd(data, result); return; }
    if (!result.title) result.title = value.headline || value.name || '';
    if (!result.postedDate) result.postedDate = String(value.datePublished || value.uploadDate || value.dateCreated || '').slice(0, 10);
    if (!result.person && value.author) result.person = typeof value.author === 'string' ? value.author : value.author.name || '';
    if (!result.notes) result.notes = value.description || '';
    const images = value.image || value.thumbnailUrl || [];
    (Array.isArray(images) ? images : [images]).forEach(image => {
      const url = validUrl(typeof image === 'string' ? image : image?.url || ''); if (url) result.media.push(url);
    });
  }
  function applyParsed(result) {
    if (result.title) $('#title').value = result.title;
    if (result.person) $('#person').value = result.person;
    if (result.postedDate && /^\d{4}-\d{2}-\d{2}$/.test(result.postedDate)) $('#postedDate').value = result.postedDate;
    if (result.notes) $('#notes').value = result.notes;
    $('#captureForm').dataset.parsedMedia = JSON.stringify([...new Set(result.media)].slice(0, 30));
    const suffix = result.media.length ? ` and ${result.media.length} image link${result.media.length === 1 ? '' : 's'}` : '';
    toast(`Details parsed${suffix}. Review before saving.`);
  }

  function helperMessage(extensionId, message) {
    return window.ArchivePocketHelper.request(extensionId, message);
  }
  function setCaptureStatus(message, busy = false) {
    $('#captureStatus').textContent = message;
    $('.source-capture-row').classList.toggle('capturing', busy);
    $('#autoCapture').disabled = busy;
  }
  function applyHelperCapture(capture) {
    const sourceUrl = validUrl(capture.sourceUrl || $('#sourceUrl').value) || validUrl($('#sourceUrl').value);
    if (sourceUrl) $('#sourceUrl').value = sourceUrl;
    const inferred = guessFromUrl(sourceUrl);
    const sourceType = Object.prototype.hasOwnProperty.call(sourceNames, capture.sourceType) ? capture.sourceType : inferred.sourceType;
    $('#sourceType').value = sourceType;
    if (capture.title) $('#title').value = capture.title;
    if (capture.person) $('#person').value = capture.person;
    if (capture.postedDate && /^\d{4}-\d{2}-\d{2}$/.test(capture.postedDate)) $('#postedDate').value = capture.postedDate;
    if (capture.notes) $('#notes').value = capture.notes;
    if (Array.isArray(capture.tags) && capture.tags.length) $('#tags').value = capture.tags.join(', ');
    const media = [...new Set((capture.media || []).map(validUrl).filter(Boolean))];
    $('#captureForm').dataset.parsedMedia = JSON.stringify(media);
    $('#urlHint').textContent = `${sourceNames[sourceType]} details were captured from the browser tab.`;
    setCaptureStatus(`Captured ${media.length} media reference${media.length === 1 ? '' : 's'}. Review fields, then save.`);
  }
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function autoCaptureWithHelper() {
    const sourceUrl = validUrl($('#sourceUrl').value.trim());
    if (!sourceUrl) return toast('Paste a valid source URL first.');
    const settings = getSettings();
    try {
      setCaptureStatus('Opening the source in your browser…', true);
      const start = await helperMessage(settings.extensionId, { type: 'archive-pocket-open-capture', sourceUrl });
      if (!start.requestId) throw new Error(start.error || 'The helper did not start a capture.');
      for (let attempt = 0; attempt < 45; attempt++) {
        await pause(1000);
        const status = await helperMessage(settings.extensionId, { type: 'archive-pocket-capture-status', requestId: start.requestId });
        if (status.state === 'complete' && status.capture) {
          applyHelperCapture(status.capture); toast('Source details captured from your browser tab.'); return;
        }
        if (status.state === 'failed' || status.state === 'missing') throw new Error(status.error || 'The source page could not be read.');
        setCaptureStatus(`Waiting for the page to load… ${attempt + 1}s`, true);
      }
      throw new Error('Timed out. The source may block extensions or still be loading.');
    } catch (error) {
      setCaptureStatus(`Auto-capture unavailable: ${error.message}`);
      toast('Auto-capture could not finish. You can still use the manual helper.');
    } finally { $('.source-capture-row').classList.remove('capturing'); $('#autoCapture').disabled = false; }
  }

  function entryFromForm() {
    const sourceUrl = validUrl($('#sourceUrl').value.trim());
    const inferred = guessFromUrl(sourceUrl);
    const media = (() => { try { return JSON.parse($('#captureForm').dataset.parsedMedia || '[]'); } catch { return []; } })();
    return normalizeEntry({
      sourceUrl, sourceType: $('#sourceType').value || inferred.sourceType, title: $('#title').value || inferred.title,
      person: $('#person').value || inferred.person, postedDate: $('#postedDate').value, notes: $('#notes').value,
      tags: $('#tags').value, media, capturedAt: new Date().toISOString(), captureMethod: media.length ? 'pasted-metadata' : 'manual'
    });
  }

  async function openEntry(entryId) {
    const entry = state.entries.find(e => e.id === entryId); if (!entry) return;
    const dialog = $('#entryDialog');
    const primary = firstMedia(entry); const primaryUrl = mediaUrl(primary || {});
    const media = entry.media || [];
    $('#entryDialogContent').innerHTML = `<div class="detail-hero">${primaryUrl ? `<img src="${escapeHtml(primaryUrl)}" alt="${escapeHtml(primary?.alt || '')}">` : '<div class="image-empty">⌑</div>'}</div>
      <div class="detail-body"><div class="detail-top"><div><p class="eyebrow">${escapeHtml(sourceNames[entry.sourceType])} · CAPTURED ${escapeHtml(displayDate(entry.capturedAt, 'recently'))}</p><h2>${escapeHtml(entry.title)}</h2>${entry.person ? `<p class="detail-person">${escapeHtml(entry.person)}</p>` : ''}</div><p class="detail-date">${escapeHtml(displayDate(entry.postedDate))}</p></div>
      ${entry.tags.length ? `<div class="tag-list">${entry.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      ${entry.notes ? `<p class="detail-notes">${escapeHtml(entry.notes)}</p>` : ''}
      <a class="detail-url" target="_blank" rel="noopener noreferrer" href="${escapeHtml(entry.sourceUrl)}">↗ ${escapeHtml(entry.sourceUrl)}</a>
      <section class="detail-media"><h3>Media references <span class="muted">(${media.length})</span></h3><div class="media-row">${media.map(m => { const url = mediaUrl(m); return url ? `<a class="media-thumb" href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${escapeHtml(m.alt || '')}"></a>` : `<span class="media-thumb"><span>Missing<br>local file</span></span>`; }).join('') || '<span class="muted">No media links yet.</span>'}</div></section>
      <div class="detail-actions"><div class="action-set"><button class="secondary-button" data-add-url="${escapeHtml(entry.id)}">+ Media URL</button><button class="secondary-button" data-attach-file="${escapeHtml(entry.id)}">Attach image</button><button class="secondary-button" data-edit-entry="${escapeHtml(entry.id)}">Edit fields</button></div><button class="text-button" data-delete-entry="${escapeHtml(entry.id)}">Delete record</button></div></div>`;
    dialog.showModal();
  }

  async function addMediaUrl(entryId) {
    const entry = state.entries.find(e => e.id === entryId); if (!entry) return;
    const value = prompt('Paste a direct image, video, or GitHub Raw URL:'); if (value === null) return;
    const url = validUrl(value.trim()); if (!url) return toast('Please use a valid http(s) media URL.');
    const alt = prompt('Optional description / alt text:', '') || '';
    entry.media.push({ id: id('media'), type: 'remote', url, alt }); await saveEntry(entry); await openEntry(entryId); toast('Media link added.');
  }
  async function attachFile(entryId) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 20 * 1024 * 1024) return toast('Choose an image under 20 MB for local browser storage.');
      const entry = state.entries.find(e => e.id === entryId); if (!entry) return;
      const assetId = id('asset'); await put('assets', { id: assetId, blob: file, name: file.name, type: file.type, savedAt: new Date().toISOString() });
      entry.media.push({ id: id('media'), type: 'local', assetId, name: file.name, alt: file.name }); await refreshAssetUrls(); await saveEntry(entry); await openEntry(entryId); toast('Local image attached. Export/upload it separately to keep it.');
    }; input.click();
  }
  async function editEntry(entryId) {
    const entry = state.entries.find(e => e.id === entryId); if (!entry) return;
    $('#entryDialog').close(); setView('add');
    $('#sourceUrl').value = entry.sourceUrl; $('#sourceType').value = entry.sourceType; $('#title').value = entry.title; $('#person').value = entry.person; $('#postedDate').value = entry.postedDate; $('#notes').value = entry.notes; $('#tags').value = entry.tags.join(', ');
    $('#captureForm').dataset.editingId = entry.id; $('#captureForm').dataset.parsedMedia = JSON.stringify(entry.media.filter(m => m.type === 'remote').map(m => m.url));
    $('#captureForm button[type="submit"]').innerHTML = 'Update capture <span>→</span>'; toast('Editing existing capture. Local media will be kept.');
  }

  function catalogExport() {
    return { format: 'archive-pocket-catalog', version: 1, exportedAt: new Date().toISOString(), notice: 'Local browser file attachments are not included. Upload them separately, then update each record with a stable URL.', entries: state.entries };
  }
  function exportCatalog() {
    const content = JSON.stringify(catalogExport(), null, 2); downloadBlob(new Blob([content], { type: 'application/json' }), `archive-pocket-catalog-${todayISO()}.json`); toast('Catalog JSON downloaded.');
  }
  async function importJsonFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('That file is not valid JSON.'); }
    let records = [];
    if (data.format === 'archive-pocket-capture') records = [data.entry || data.record || data];
    else if (Array.isArray(data)) records = data;
    else if (Array.isArray(data.entries)) records = data.entries;
    else if (data.sourceUrl || data.url) records = [data];
    else return toast('No archive records were found in that file.');
    let imported = 0;
    for (const raw of records) {
      const record = normalizeEntry(raw); if (!record.sourceUrl) continue;
      const existing = state.entries.find(e => e.id === record.id || (e.sourceUrl === record.sourceUrl && e.title === record.title));
      if (existing) record.id = existing.id;
      await put('entries', record); const pos = state.entries.findIndex(e => e.id === record.id); if (pos < 0) state.entries.unshift(record); else state.entries[pos] = record; imported++;
    }
    renderLibrary(); updateCounts(); updateTransferInfo(); toast(`${imported} capture${imported === 1 ? '' : 's'} imported.`); setView('library');
  }

  function sampleEntries() {
    return [
      normalizeEntry({ sourceUrl: 'https://web.archive.org/web/20011109235801/http://www.geocities.com/radio_mookie/tradecenter.html:Radio_mookie', sourceType: 'wayback', title: 'Radio Mookie', notes: 'Example: an archived GeoCities Trade Center page. Replace this sample with your own notes and source context.', tags: ['sample', 'web archive'], postedDate: '2001-11-09', capturedAt: '2026-10-21T12:00:00.000Z' }),
      normalizeEntry({ sourceUrl: 'https://www.facebook.com/share/1CChWPFhWs/?mibextid=wwXIfr', sourceType: 'facebook', title: 'Facebook post', person: 'Jennifer Porter', notes: 'Example social record. Use the browser helper while signed in, then review its fields before import.', tags: ['sample', 'social'], capturedAt: '2026-10-21T12:01:00.000Z' }),
      normalizeEntry({ sourceUrl: 'https://www.facebook.com/share/1FM2iXioxT/?mibextid=wwXIfr', sourceType: 'facebook', title: 'Facebook post', person: 'Unknown', tags: ['sample', 'social'], capturedAt: '2026-10-21T12:02:00.000Z' }),
      normalizeEntry({ sourceUrl: 'https://www.threads.com/share/BAX35waYCH/', sourceType: 'threads', title: 'Threads post', person: 'Nelson Jeng', tags: ['sample'], capturedAt: '2026-10-21T12:03:00.000Z' }),
      normalizeEntry({ sourceUrl: 'https://www.instagram.com/p/DdFpcH3Di20/?rpxt=emlhenhyOGVhaW92', sourceType: 'instagram', title: 'Instagram post', person: 'shefuchoice', tags: ['sample', 'social'], capturedAt: '2026-10-21T12:04:00.000Z' }),
      normalizeEntry({ sourceUrl: 'https://www.facebook.com/100003159618340/posts/28820774944277776', sourceType: 'facebook', title: 'Facebook post', person: 'adam riback', tags: ['sample', 'social'], capturedAt: '2026-10-21T12:05:00.000Z' })
    ];
  }
  async function loadSamples() {
    if (state.entries.length && !confirm('Add the six example records to your existing library?')) return;
    for (const record of sampleEntries()) { await put('entries', record); state.entries.unshift(record); }
    renderLibrary(); updateCounts(); updateTransferInfo(); toast('Example records added. Replace or delete them at any time.'); setView('library');
  }

  function settingsFromForm() { return { repoName: $('#repoName').value.trim().replace(/^https?:\/\/(?:www\.)?github\.com\//, '').replace(/\/$/, ''), repoBranch: $('#repoBranch').value.trim() || 'main', repoPath: $('#repoPath').value.trim().replace(/^\/+/, '') || 'data/archive.json', mediaPath: $('#mediaPath').value.trim().replace(/^\/+|\/+$/g, '') || 'media', extensionId: $('#extensionId').value.trim() }; }
  function populateSettings() { const s = getSettings(); $('#repoName').value = s.repoName || ''; $('#repoBranch').value = s.repoBranch || 'main'; $('#repoPath').value = s.repoPath || 'data/archive.json'; $('#mediaPath').value = s.mediaPath || 'media'; $('#extensionId').value = s.extensionId || ''; }
  function bytesToBase64(text) { const bytes = new TextEncoder().encode(text); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
  async function githubSync() {
    const settings = settingsFromForm(); const token = $('#githubToken').value.trim(); const status = $('#syncStatus');
    if (!/^[^/\s]+\/[^/\s]+$/.test(settings.repoName)) return toast('Enter a repository as owner/repository.');
    if (!token) return toast('A temporary fine-grained GitHub token is required to sync.');
    saveSettings(settings); status.textContent = 'Checking the existing catalog…';
    const base = `https://api.github.com/repos/${settings.repoName}/contents/${settings.repoPath.split('/').map(encodeURIComponent).join('/')}`;
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
    let sha = '';
    try {
      const current = await fetch(`${base}?ref=${encodeURIComponent(settings.repoBranch)}`, { headers });
      if (current.ok) sha = (await current.json()).sha;
      else if (current.status !== 404) throw new Error(`GitHub returned ${current.status}`);
      status.textContent = 'Writing catalog JSON…';
      const body = { message: `${sha ? 'Update' : 'Create'} Archive Pocket catalog`, content: bytesToBase64(JSON.stringify(catalogExport(), null, 2)), branch: settings.repoBranch };
      if (sha) body.sha = sha;
      const response = await fetch(base, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `GitHub returned ${response.status}`);
      $('#githubToken').value = ''; status.textContent = `Synced at ${new Date().toLocaleTimeString()}. Token discarded.`; toast('Catalog written to your GitHub repository.');
    } catch (error) { status.textContent = `Sync failed: ${error.message}`; toast('GitHub sync failed. See the note below the button.'); }
  }

  function wireEvents() {
    $$('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    $$('[data-go]').forEach(button => button.addEventListener('click', () => setView(button.dataset.go)));
    $('#headerAdd').addEventListener('click', () => { $('#captureForm').reset(); delete $('#captureForm').dataset.editingId; delete $('#captureForm').dataset.parsedMedia; $('#captureForm button[type="submit"]').innerHTML = 'Save capture <span>→</span>'; setView('add'); $('#sourceUrl').focus(); });
    $('#mobileMenu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
    $('#aboutButton').addEventListener('click', () => $('#aboutDialog').showModal());
    $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    $$('.dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    $('#searchInput').addEventListener('input', renderLibrary); $('#sourceFilter').addEventListener('change', renderLibrary); $('#sortSelect').addEventListener('change', renderLibrary);
    document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setView('library'); $('#searchInput').focus(); } });
    $('#entryGrid').addEventListener('click', event => { const card = event.target.closest('[data-entry-id]'); if (card) openEntry(card.dataset.entryId); });
    $('#entryGrid').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-entry-id]')) { event.preventDefault(); openEntry(event.target.closest('[data-entry-id]').dataset.entryId); } });
    $('#entryDialog').addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.dataset.addUrl) addMediaUrl(target.dataset.addUrl);
      if (target.dataset.attachFile) attachFile(target.dataset.attachFile);
      if (target.dataset.editEntry) editEntry(target.dataset.editEntry);
      if (target.dataset.deleteEntry) { const e = state.entries.find(x => x.id === target.dataset.deleteEntry); if (e) deleteEntry(e); }
    });
    $('#sourceUrl').addEventListener('input', event => {
      const info = guessFromUrl(event.target.value); const hint = $('#urlHint');
      if (validUrl(event.target.value)) { $('#sourceType').value = info.sourceType; hint.textContent = `${sourceNames[info.sourceType]} detected. ${info.title ? `Possible title: “${info.title}”.` : 'Use the extension or paste page data for full details.'}`; }
      else hint.textContent = 'Use the original link whenever possible.';
    });
    $('#openSource').addEventListener('click', () => { const url = validUrl($('#sourceUrl').value); if (url) window.open(url, '_blank', 'noopener'); else toast('Paste a valid source URL first.'); });
    $('#autoCapture').addEventListener('click', autoCaptureWithHelper);
    $('#openPasteModal').addEventListener('click', () => $('#pasteDialog').showModal()); $('#extractPasted').addEventListener('click', () => $('#pasteDialog').showModal());
    $('#parsePasted').addEventListener('click', () => { const text = $('#htmlPaste').value.trim(); if (!text) return toast('Paste some HTML or page text first.'); applyParsed(parsePastedContent(text)); $('#pasteDialog').close(); });
    $('#captureForm').addEventListener('reset', () => setTimeout(() => { delete $('#captureForm').dataset.editingId; delete $('#captureForm').dataset.parsedMedia; $('#captureForm button[type="submit"]').innerHTML = 'Save capture <span>→</span>'; $('#urlHint').textContent = 'Use the original link whenever possible.'; setCaptureStatus('Requires the helper in desktop Chrome, Edge, or Brave.'); }, 0));
    $('#captureForm').addEventListener('submit', async event => {
      event.preventDefault(); const url = validUrl($('#sourceUrl').value); if (!url) return toast('A valid original URL is required.');
      const record = entryFromForm(); const editing = $('#captureForm').dataset.editingId;
      if (editing) { const previous = state.entries.find(e => e.id === editing); record.id = editing; record.capturedAt = previous?.capturedAt || record.capturedAt; const local = previous?.media.filter(m => m.type === 'local') || []; record.media = [...local, ...record.media]; }
      await saveEntry(record); $('#captureForm').reset(); toast(editing ? 'Capture updated.' : 'Capture saved locally.'); setView('library');
    });
    $('#importFile').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importJsonFile(file); event.target.value = ''; });
    $('#exportAll').addEventListener('click', exportCatalog); $('#importSamples').addEventListener('click', loadSamples);
    $('#settingsForm').addEventListener('submit', event => { event.preventDefault(); const data = settingsFromForm(); if (data.repoName && !/^[^/\s]+\/[^/\s]+$/.test(data.repoName)) return toast('Repository format must be owner/repository.'); saveSettings(data); toast('Repository settings saved in this browser.'); });
    $('#syncGithub').addEventListener('click', githubSync);
  }

  async function init() {
    try { wireEvents(); populateSettings(); await loadEntries(); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {}); }
    catch (error) { console.error(error); toast('Local storage could not be opened. Try using this app in a normal browser tab.'); }
  }
  init();
})();
