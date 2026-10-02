#!/usr/bin/env node
/**
 * Generates public/legal/third-party-notices.html from the licence files of
 * every RUNTIME dependency (code or fonts that ship in the built game).
 * Dev-only tools (Vite, TypeScript, Vitest, Playwright) are not distributed.
 *
 *   node scripts/gen-notices.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const entries = Object.keys(pkg.dependencies).sort().map((name) => {
  const dir = join(root, 'node_modules', name);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licFile = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  if (!licFile) throw new Error(`No licence file found for ${name}`);
  const homepage = typeof meta.homepage === 'string' ? meta.homepage : (meta.repository?.url ?? '').replace(/^git\+/, '');
  return { name, version: meta.version, license: meta.license, homepage, text: readFileSync(join(dir, licFile), 'utf8').trim() };
});

const rows = entries.map((e) => `  <tr><td>${esc(e.name)}</td><td>${esc(e.version)}</td><td>${esc(String(e.license))}</td><td>${e.homepage ? `<a href="${esc(e.homepage)}" rel="noopener noreferrer">${esc(e.homepage)}</a>` : ''}</td></tr>`).join('\n');
const texts = entries.map((e) => `<h3>${esc(e.name)} ${esc(e.version)} — ${esc(String(e.license))}</h3>\n<pre>${esc(e.text)}</pre>`).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Third-Party Notices — Slippery Fish</title>
<link rel="stylesheet" href="legal.css" />
</head>
<body>
<main>
<nav class="legal-nav" aria-label="Legal pages"><a href="privacy-policy.html">Privacy Policy</a><a href="terms-of-use.html">Terms of Use</a><a href="data-deletion.html">Data Deletion &amp; Privacy Requests</a><a href="support.html">Support</a><a href="third-party-notices.html">Third-Party Notices</a></nav>
<h1>Third-Party Notices</h1>
<p class="meta">Generated from the game's runtime dependencies by scripts/gen-notices.mjs. Do not edit by hand.</p>
<p>Slippery Fish includes the following open-source software and fonts. Original game art was supplied by the publisher; see the project's ASSETS documentation.</p>
<table>
  <tr><th>Component</th><th>Version</th><th>Licence</th><th>Source</th></tr>
${rows}
</table>
<p>Phaser's distributed build incorporates further components under their own permissive licences; see the Phaser licence and source repository.</p>
<h2>Licence texts</h2>
${texts}
<footer>Slippery Fish · Third-party notices</footer>
</main>
</body>
</html>
`;
writeFileSync(join(root, 'public/legal/third-party-notices.html'), html);
console.log(`third-party-notices.html: ${entries.length} runtime dependencies`);
