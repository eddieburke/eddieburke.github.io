# Archive Pocket Capture Helper

This Chrome, Edge, Firefox, and Brave extension lets Archive Pocket open a source and collect a reviewable metadata record. It does not read or export cookies.

## Automatic Windows test installer

Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/), then double-click **Install.cmd** in the project root. It installs its pinned Mozilla `web-ext` dependency, prepares browser-specific extensions in `dist/`, starts a loopback-only app server, and opens every installed browser with the helper loaded. No extension ID is needed.

Each browser uses a separate temporary test profile. Existing browser windows and profiles are untouched. Sign in to your source in the test window if needed. Keep the installer running while testing, and export any catalog records before closing the session. Closing and rerunning the installer starts fresh test sessions. This is a developer test installation, not a signed permanent store installation.

The test tab reports whether a real page capture returned the expected title, author, date, and image URL. Results and launcher logs are in `.browser-tests/`. Select **Open Archive Pocket** on that tab to use the app. The capture source opens in a second tab.

To launch only one browser, run `Install.cmd chrome`, `Install.cmd edge`, or `Install.cmd firefox`. Browser binaries must already be installed. Missing browsers are reported and skipped. Press Ctrl+C in the installer window to end testing.

## Install unpacked

1. Download or clone this project to your computer.
2. Open your Chromium browser’s extension page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode**.
4. Select **Load unpacked** and select the `extension` folder itself, or `dist/chrome` / `dist/edge` after running the installer.
5. Pin **Archive Pocket Capture Helper** if desired. The app connects automatically.

For Firefox in your existing profile, run the installer to generate `dist/firefox`, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`. Firefox removes an unsigned temporary add-on when it restarts. Permanent Firefox distribution requires Mozilla signing; the installer does not turn off signature checks.

## Automatic app-to-browser workflow

1. Visit your deployed Archive Pocket GitHub Pages site or the installer's local app in the same browser where the helper is loaded.
2. The helper connects automatically in Chrome, Edge, Firefox, and Brave. The optional extension ID setting remains available for older Chromium installations.
3. Sign in normally to any sources you are authorized to view, if necessary.
4. Go to **New capture**, paste a source link, and choose **Open & auto-capture with helper**.
5. The helper opens that one link in a normal browser tab. The site request uses the browser session normally, and after the page loads the helper returns its visible metadata — title, person/account when detectable, post date when detectable, page description, and direct image/video-poster references — to the Archive Pocket form.
6. Review, correct if needed, and save the record locally.

The app connects through an origin-checked content-script bridge from GitHub Pages (`https://*.github.io/*`) or HTTP local development (`localhost` / `127.0.0.1`). Capture status is restricted to the initiating app tab and origin. Pending requests expire after one minute. Firefox uses event background scripts; Chromium uses a service worker.

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
