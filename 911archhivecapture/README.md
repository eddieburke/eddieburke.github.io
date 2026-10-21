# Archive Pocket

A small, static, **local-first** app for cataloging source links, context, media references and selected local images. It is designed to deploy directly to GitHub Pages — no database, paid API, server, or account required.

## What it does

- Stores your working catalog in the browser's IndexedDB.
- Captures source URLs from the Wayback Machine, Internet Archive, Facebook, Instagram, Threads, LinkedIn and other sites.
- Lets you enter or correct title, person/account, posted date, notes, tags and media URLs.
- Parses pasted HTML / Open Graph / JSON-LD snippets locally.
- Opens a source in the user’s normal browser and auto-fills the record through the optional browser helper in [`extension/`](extension/README.md).
- Imports portable JSON from that helper as a manual fallback.
- Exports a versionable `archive-pocket-catalog` JSON file.
- Can write the catalog JSON to a GitHub repository if you supply a temporary fine-grained Contents token; the token is never saved.

## Important constraints

A site hosted at `github.io` cannot access, save, copy, or reuse cookies belonging to Facebook, Instagram, LinkedIn, or another website. Those sites commonly block embedding and cross-origin requests too. This project does **not** attempt to bypass those protections.

For pages you can see while signed in, install the companion extension in [`extension/`](extension/README.md) by running **Install.cmd** on Windows (Node.js 22+ required). The helper connects automatically, without entering an extension ID. Then **Open & auto-capture with helper** opens the supplied URL in an ordinary browser tab. The site itself receives the browser’s normal session request; after it renders, the helper returns a reviewable metadata and media-reference record to the app. The helper does not read cookies and does not defeat a site’s sign-in, access, or download controls.

## Mobile use

The catalog itself works as a GitHub Pages PWA on a phone and keeps its local records there. Mobile Safari and Chrome on Android/iOS do not permit a web app to borrow another site’s cookies or install this Chromium helper, so this installer targets desktop Chrome, Edge, and Firefox. On a phone, open or share the source normally, then add its URL and details manually (or import a capture made on desktop).

## Deploy to GitHub Pages

1. Create a new GitHub repository and upload these files. Keep `index.html` at the repository root.
2. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
3. Visit `https://YOUR-USER.github.io/YOUR-REPOSITORY/`.
4. In the app, optionally configure that `owner/repository` under **Repository**. For browser-driven automatic capture, run `Install.cmd` to launch Chrome, Edge, and Firefox with the helper already loaded in separate test profiles. Keep the installer running; export test records before closing these temporary sessions. Use **Import & export** to download a catalog backup frequently.
5. To publish records, either commit `archive-pocket-catalog-YYYY-MM-DD.json` to `data/archive.json` yourself or use the one-time sync control with a fine-grained token that has only **Contents: Read and write** for this repository.

GitHub Pages and public Git repositories are not private storage. Do not commit private material, sensitive personal information, or content you do not have the right to publish.

## Media workflow

The catalog contains durable **references** to media. For an image you want to retain:

1. Save or obtain it lawfully from the original source.
2. Upload the file to your own repository (for example `media/filename.jpg`) or another storage provider you control.
3. Paste its stable Raw GitHub URL in that record’s **Media URL**.

Local image attachment is useful as a temporary working copy only. It remains in the current browser profile and is deliberately excluded from catalog JSON, because a static page cannot safely or reliably write arbitrary large files to a GitHub repository without explicit authentication.

## Development

It is plain HTML, CSS and JavaScript — no install step. For service-worker testing, use a local static web server rather than opening `index.html` through `file://`.

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
