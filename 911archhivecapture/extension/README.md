# Archive Pocket Capture Helper

This Chrome, Edge, Firefox, and Brave extension lets Archive Pocket open a source and collect a reviewable metadata record. It does not read or export cookies.

## Install into your normal browser

Double-click **Install.cmd** in the project root. No Node.js installation is required. It copies the helper to the fixed folder `%LOCALAPPDATA%\ArchivePocket\CaptureHelper\chromium`, copies that path to the clipboard, and opens the extension managers in your normal Chrome and Edge profiles.

1. In the profile you normally use, enable **Developer mode**.
2. Click **Load unpacked**, paste the copied folder path into the folder picker, and select it.
3. Refresh Archive Pocket and any source pages already open.

The extension remains installed after restarting the browser. Keep that fixed folder in place. The installer prepares files and opens the browser; the browser requires this initial Load unpacked action before installation is complete. It does not modify profile databases or browser security policies.

To update, rerun **Install.cmd**, then click **Reload** on the helper's extension card. Use `Install.cmd chrome` or `Install.cmd edge` to open just one browser. If multiple browser profiles exist, select the profile you normally use.

### Firefox permanent installation

Normal Firefox requires a Mozilla-signed XPI for a persistent installation. The installer prepares `%LOCALAPPDATA%\ArchivePocket\CaptureHelper\archive-pocket-firefox-1.3.0-unsigned.xpi` for [unlisted Mozilla signing](https://addons.mozilla.org/developers/addon/submit/distribution). This package is not signed and cannot be installed permanently yet.

Once Mozilla returns the signed XPI, run:

```bat
Install.cmd firefox -FirefoxXpi "C:\path\to\signed-addon.xpi"
```

The installer checks the package's ID, version, and presence of signing metadata, then opens it in normal Firefox. Firefox verifies the actual signature and asks you to approve installation. No signature checks are disabled. **Load Temporary Add-on** is for testing only and disappears after restart.

### Temporary browser tests

**Test-Browsers.cmd** is the separate disposable test launcher (Node.js 22+ required). It opens fresh test profiles and reports real page-capture results under `.browser-tests/`. These profiles are not your daily browser profiles. Export any test records before closing them. `npm run test:browsers` runs the same tests; `npm run install:browsers` opens the normal-profile setup.

## Automatic app-to-browser workflow

1. Visit your deployed Archive Pocket GitHub Pages site or your local development app in the same browser where the helper is loaded.
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
