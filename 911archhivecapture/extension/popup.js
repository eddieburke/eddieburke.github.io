const $ = selector => document.querySelector(selector);
let tabId = null;
let scannedMedia = [];
const draftFields = ['sourceUrl','title','person','postedDate','notes','tags'];
const showStatus = (text, error = false) => { const el = $('#status'); el.textContent = text; el.classList.toggle('error', error); };
const normalizeUrl = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; } };
async function getDraft() { return (await chrome.storage.local.get({ draft: {} })).draft; }
async function storeDraft(event) { const old = await getDraft(); const media = selectedMedia(); const field = event?.target?.id; const manualFields = [...new Set([...(old.manualFields || []), ...(draftFields.includes(field) ? [field] : [])])]; const next = { ...old, ...recordFields(), media, manualFields }; if (field === 'postedDate') { next.postedDateText = ''; $('#postedDateDetail').textContent = ''; } await chrome.storage.local.set({ draft: next }); }
function recordFields() { const record = {}; draftFields.forEach(field => record[field] = $(`#${field}`).value.trim()); return record; }
function selectedMedia() { return [...document.querySelectorAll('input[name="media"]:checked')].map(input => input.value); }
function renderMedia(items) { scannedMedia = [...new Set(items.map(normalizeUrl).filter(Boolean))]; const list = $('#mediaList'); list.innerHTML = scannedMedia.length ? scannedMedia.map((url, index) => `<label title="${escapeHtml(url)}"><input type="checkbox" name="media" value="${escapeHtml(url)}" ${index < 12 ? 'checked' : ''}><span>${escapeHtml(url)}</span></label>`).join('') : '<p>No media URLs found.</p>'; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[x])); }
function applyDraft(draft) { draftFields.forEach(field => { $(`#${field}`).value = draft[field] || ''; }); $('#postedDateDetail').textContent = draft.postedDateText || 'If missing, point at the timestamp and wait for its full-date tooltip.'; $('#postedDateDetail').dataset.date = draft.postedDate || ''; if (Array.isArray(draft.media)) renderMedia(draft.media); }
async function ensureContent() { await chrome.scripting.executeScript({ target: { tabId }, files: ['extract.js', 'content.js'] }); }
async function scan() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = tab.id; $('#pageHost').textContent = tab.url ? new URL(tab.url).hostname : 'Unsupported page';
    if (!tab.url || !/^https?:/.test(tab.url)) { showStatus('Open a regular web page before using the helper.', true); return; }
    await ensureContent();
    const detected = await chrome.tabs.sendMessage(tabId, { type: 'archive-pocket-read-v2' });
    if (detected.error) throw new Error(detected.error);
    const old = await getDraft();

    const draft = globalThis.ArchivePocketExtract.mergeDraft(detected, old);
    await chrome.storage.local.set({ draft }); applyDraft(draft); showStatus('Captured.');
  } catch (error) { console.error(error); showStatus('Unable to read this page. It may be a browser-protected page.', true); }
}
async function pick(field) {
  try { await storeDraft(); await ensureContent(); await chrome.tabs.sendMessage(tabId, { type: 'archive-pocket-pick-v2', field }); window.close(); }
  catch { showStatus('The picker could not start on this page.', true); }
}
async function addCustomMedia() { const value = normalizeUrl($('#customMedia').value.trim()); if (!value) return showStatus('Paste a valid http(s) media URL.', true); const currently = selectedMedia(); renderMedia([value, ...currently, ...scannedMedia]); $('#customMedia').value = ''; await storeDraft(); }
function buildRecord() { const fields = recordFields(); const detail = $('#postedDateDetail'); const postedDateText = fields.postedDate && detail.dataset.date === fields.postedDate ? detail.textContent : ''; return { format: 'archive-pocket-capture', version: 1, exportedAt: new Date().toISOString(), entry: { ...fields, postedDateText, media: selectedMedia(), tags: fields.tags.split(',').map(x => x.trim()).filter(Boolean), capturedAt: new Date().toISOString(), captureMethod: 'browser-helper' } }; }
async function exportRecord(event) { event.preventDefault(); const record = buildRecord(); if (!normalizeUrl(record.entry.sourceUrl)) return showStatus('A valid source URL is required.', true); await chrome.storage.local.set({ draft: { ...(await getDraft()), ...record.entry, media: record.entry.media } }); const data = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record, null, 2))}`; chrome.downloads.download({ url: data, filename: `archive-pocket-capture-${new Date().toISOString().slice(0,10)}.json`, saveAs: true }); showStatus('JSON exported.'); }
async function copyRecord() { try { await navigator.clipboard.writeText(JSON.stringify(buildRecord(), null, 2)); showStatus('JSON copied.'); } catch { showStatus('Copy failed. Export JSON instead.', true); } }
document.addEventListener('DOMContentLoaded', () => { document.querySelectorAll('.picker').forEach(button => button.addEventListener('click', () => pick(button.dataset.pick))); $('#addMedia').addEventListener('click', addCustomMedia); $('#captureForm').addEventListener('submit', exportRecord); $('#copyButton').addEventListener('click', copyRecord); draftFields.forEach(field => $(`#${field}`).addEventListener('change', storeDraft)); scan(); });
