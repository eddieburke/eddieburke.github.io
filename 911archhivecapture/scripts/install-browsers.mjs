import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildExtensions, root } from './build-extensions.mjs';

const requested = process.argv.slice(2);
if (requested.some(value => !['chrome', 'edge', 'firefox'].includes(value))) throw new Error('Usage: Test-Browsers.cmd [chrome] [edge] [firefox]');
const selected = requested.length ? [...new Set(requested)] : ['chrome', 'edge', 'firefox'];
const logDir = join(root, '.browser-tests');
await mkdir(logDir, { recursive: true });
await buildExtensions();
const programs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
const paths = { chrome: 'Google/Chrome/Application/chrome.exe', edge: 'Microsoft/Edge/Application/msedge.exe', firefox: 'Mozilla Firefox/firefox.exe' };
const binaries = Object.fromEntries(selected.map(browser => [browser, programs.map(base => join(base, paths[browser])).find(existsSync)]));
const tokens = new Map();
const results = {};
const children = [];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__installer/result' && request.method === 'POST') {
      const browser = tokens.get(url.searchParams.get('token'));
      if (!browser) { response.writeHead(403).end(); return; }
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 16000) { response.writeHead(413).end(); return; } }
      const result = JSON.parse(body);
      results[browser] = { ...result, browser, checkedAt: new Date().toISOString() };
      await writeFile(join(logDir, 'results.json'), JSON.stringify(results, null, 2));
      console.log(`${browser}: ${result.ok ? 'PASS' : 'FAIL'} - ${result.message}`);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.') || ['node_modules', 'scripts', 'dist'].includes(part)) || !types[extname(file)]) { response.writeHead(404).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
const appUrl = `http://127.0.0.1:${server.address().port}/`;
await writeFile(join(logDir, 'session.json'), JSON.stringify({ pid: process.pid, appUrl, startedAt: new Date().toISOString() }, null, 2));
await writeFile(join(logDir, 'results.json'), '{}');
console.log(`Archive Pocket: ${appUrl}`);
console.log('Installing into separate temporary TEST profiles. Existing browser windows stay open.');
console.log('Keep this installer running while testing. Ctrl+C ends the test sessions.');

for (const browser of selected) {
  const binary = binaries[browser];
  if (!binary) { console.error(`${browser}: browser not found; skipping.`); continue; }
  const token = randomBytes(24).toString('hex');
  tokens.set(token, browser);
  const startUrl = `${appUrl}tests/helper-smoke.html?browser=${browser}&token=${token}`;
  const args = [join(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js'), 'run', '--source-dir', join(root, 'dist', browser), '--no-config-discovery', '--no-input', '--start-url', startUrl];
  if (browser === 'firefox') args.push('--target', 'firefox-desktop', '--firefox', binary);
  else args.push('--target', 'chromium', '--chromium-binary', binary);
  if (browser === 'edge') args.push('--args=--edge-skip-compat-layer-relaunch');
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let log = '';
  const record = chunk => { log += chunk; writeFile(join(logDir, `${browser}.log`), log).catch(console.error); };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  child.on('error', error => console.error(`${browser}: ${error.message}`));
  child.on('exit', code => { if (code) console.error(`${browser}: launcher exited (${code}); see .browser-tests/${browser}.log`); });
}
const timeout = setTimeout(() => {
  for (const browser of selected) if (binaries[browser] && !results[browser]) console.error(`${browser}: no successful verification received. See .browser-tests/${browser}.log`);
}, 60000);
process.on('SIGINT', () => {
  clearTimeout(timeout);
  children.forEach(child => child.kill('SIGINT'));
  server.close();
  process.exit(0);
});
