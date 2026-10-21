import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildExtensions() {
  const source = join(root, 'extension');
  const base = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  for (const browser of ['chrome', 'edge', 'firefox']) {
    const output = join(root, 'dist', browser);
    await mkdir(output, { recursive: true });
    for (const file of ['background.js', 'bridge.js', 'content.js', 'popup.js', 'popup.html', 'popup.css', 'icons']) await cp(join(source, file), join(output, file), { recursive: true });
    const manifest = structuredClone(base);
    if (browser === 'firefox') {
      manifest.background = { scripts: ['background.js'] };
      delete manifest.externally_connectable;
      manifest.browser_specific_settings = { gecko: { id: 'capture-helper@archive-pocket.local', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } };
    }
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log('Prepared dist/chrome, dist/edge, dist/firefox');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildExtensions();
