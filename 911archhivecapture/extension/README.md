# Capture Helper

Reads a selected page's post text, author, date and media URLs. Sends them to Archive Pocket or exports JSON. Cookies are not read.

## Chrome / Edge

Open `chrome://extensions` or `edge://extensions`. Enable **Developer mode**, choose **Load unpacked**, and select this `extension` folder. Keep the folder in place. Click **Reload** after updating its files.

`Install.cmd` alternatively copies the helper to `%LOCALAPPDATA%\ArchivePocket\CaptureHelper\chromium` and opens the normal browser's extension manager. Select that folder once.

## Firefox

Run `npm run build:extensions`. Load `dist/firefox/manifest.json` from `about:debugging` for a temporary test.

Persistent installation requires a Mozilla-signed XPI. `Install.cmd -PrepareOnly` prepares the unsigned XPI under `%LOCALAPPDATA%\ArchivePocket\CaptureHelper`. Submit it for [unlisted signing](https://addons.mozilla.org/developers/addon/submit/distribution), then install the signed file through `about:addons` → gear → **Install Add-on From File**.

## Use

In Archive Pocket, paste a source URL and choose **Capture with helper**. Review the fields and save. The helper connects on GitHub Pages, localhost and 127.0.0.1; no extension ID is required.

The toolbar popup also captures the current page. Use **Point at timestamp** if its date is missing: hover until the full-date tooltip appears, then click. Export the resulting JSON and import it into the library.

`Test-Browsers.cmd` runs disposable Chrome, Edge and Firefox tests. These profiles are separate from normal browsing.
