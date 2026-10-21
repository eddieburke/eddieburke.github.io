# Archive Pocket Capture Helper

This optional Chrome/Edge/Brave extension lets the Archive Pocket web app open a source link in a normal browser tab and collect a **reviewable metadata record** from that rendered page. It can use the page that your browser already loads while you are signed in, but it does **not** read, export, save, or reuse website cookies.

## Install unpacked

1. Download or clone this project to your computer.
2. Open your Chromium browser’s extension page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode**.
4. Select **Load unpacked** and select the `extension` folder itself.
5. Copy the extension’s **ID** shown on that page. Pin **Archive Pocket Capture Helper** if desired.

## Automatic app-to-browser workflow

1. Visit your deployed Archive Pocket GitHub Pages site in the same Chromium browser.
2. Open **Repository**, paste the helper’s ID into **Capture Helper extension ID**, and save settings.
3. Sign in normally to any sources you are authorized to view, if necessary.
4. Go to **New capture**, paste a source link, and choose **Open & auto-capture with helper**.
5. The helper opens that one link in a normal browser tab. The site request uses the browser session normally, and after the page loads the helper returns its visible metadata — title, person/account when detectable, post date when detectable, page description, and direct image/video-poster references — to the Archive Pocket form.
6. Review, correct if needed, and save the record locally.

The app page can communicate with this extension only from a GitHub Pages address (`https://*.github.io/*`) or local development (`localhost`). The extension ID is stored only in the Archive Pocket browser settings; it is not a secret.

## Manual popup workflow

For a page that needs a more exact field or does not work with auto-capture:

1. Open a page you are permitted to preserve, and sign in normally if it requires it.
2. Click the extension icon. It scans visible document metadata such as Open Graph tags, JSON-LD, `<time>` elements and image links.
3. Review every field. If automatic detection misses a name, date or image, click **Point at text/image**, then click the desired part of the page. Reopen the popup afterward; the chosen value is kept in the current draft.
4. Click **Download capture JSON**.
5. In Archive Pocket, open **Import & export → Choose JSON file** and import it.

The extension exports media **references** (URLs). It does not bypass sign-in, platform download controls, copyright, paywalls, or access restrictions, and it does not guarantee a reference will remain live. Before committing a catalog or media to a public GitHub repository, verify your rights, consent, and the source platform’s rules.

## Scope and privacy

The helper requests broad site access because it must be ready to receive the one page that Archive Pocket opens. Its content script first asks the extension background whether that **specific tab** is an active capture target. It does not read page metadata unless the answer is yes. It makes no network requests and uses no analytics.

The helper stores a short-lived pending capture and the manual popup’s current draft in `chrome.storage.local`. The only page data sent outside the extension is the captured record sent back to the Archive Pocket GitHub Pages tab that explicitly started the request. Cookies stay in the browser’s own cookie jar and are never exposed to the extension or the web app.
