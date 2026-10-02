#!/usr/bin/env node
/**
 * Serves the production build (dist/) the way GitHub Pages serves a project
 * site: under a sub-path (default "/Slippery-Fish/"), with real 404s outside
 * it. Use it to catch absolute-URL / base-path bugs before deploying.
 *
 *   BASE_PATH=/Slippery-Fish/ npm run build
 *   npm run preview:subpath            # → http://localhost:4174/Slippery-Fish/
 *   PORT=5000 SUBPATH=/game/ node scripts/serve-subpath.mjs
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const sub = `/${(process.env.SUBPATH ?? process.env.E2E_BASE_PATH ?? '/Slippery-Fish/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const port = Number(process.env.PORT ?? 4174);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === sub.slice(0, -1)) { res.writeHead(301, { Location: sub }); res.end(); return; }
  if (!path.startsWith(sub)) return notFound(res);
  path = path.slice(sub.length) || 'index.html';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return notFound(res);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}${sub}`));

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 — not found (outside the site base path, like GitHub Pages)');
}
