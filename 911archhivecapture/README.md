# Archive Pocket

[Open app](https://eddieburke.github.io/911archhivecapture/)

- **Library:** search, import/export JSON, GitHub settings.
- **New capture:** source URL, browser capture, editable fields.

Records and attached images are stored in the current browser. JSON exports exclude attached image files.

## Browser helper

See [extension/README.md](extension/README.md). `Install.cmd` prepares a persistent Chrome/Edge installation. `Test-Browsers.cmd` opens disposable test profiles.

## Development

```sh
python -m http.server 8080
npm ci
npm test
npm run build:extensions
```

Open `http://localhost:8080`. The site is plain HTML, CSS and JavaScript; npm is needed only for tests and extension packaging.
