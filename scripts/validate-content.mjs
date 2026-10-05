#!/usr/bin/env node
/**
 * Content validation — runs before every production build (`npm run build`).
 *
 * Loads the real TypeScript content modules through Vite's SSR loader and
 * fails the build on broken data: missing atlas frames or files, wrong
 * catalog counts, duplicate ids, invalid generated levels, stale third-party
 * notices, missing legal pages, or anything that looks like a secret.
 */
import { createServer } from 'vite';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);
const check = (cond, msg) => { if (!cond) fail(msg); };

const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const load = (p) => server.ssrLoadModule(p);

try {
  const assets = await load('/src/core/assets.ts');
  const manifest = JSON.parse(readFileSync(join(root, 'content/manifests/assets.runtime.json'), 'utf8'));

  // ---------------------------------------------------------------- atlas files
  for (const p of Object.values(manifest.pages ?? {})) {
    for (const f of [p.image, p.json].filter(Boolean)) check(existsSync(join(root, 'public', f)), `atlas file missing: public/${f}`);
  }
  const base = server.config.base;
  for (const img of assets.standaloneImages()) {
    const rel = (img.url.startsWith(base) ? img.url.slice(base.length) : img.url).replace(/^\.?\//, '');
    check(existsSync(join(root, 'public', rel)), `standalone image missing: public/${rel}`);
  }
  const frameOk = (id, where) => check(assets.hasFrame(id), `${where}: unknown atlas frame "${id}"`);

  // ---------------------------------------------------------------- obstacles
  const { OBSTACLES } = await load('/src/config/obstacles.ts');
  const obstacleIds = Object.keys(OBSTACLES);
  check(obstacleIds.length >= 20, `expected the Batch 4 obstacle set, found ${obstacleIds.length}`);
  for (const [id, o] of Object.entries(OBSTACLES)) {
    check(o.id === id, `obstacle ${id}: id mismatch`);
    frameOk(o.sprite, `obstacle ${id}`);
    check(o.colliders.length > 0, `obstacle ${id}: no colliders`);
    check(o.scaleRange[0] > 0 && o.scaleRange[0] <= o.scaleRange[1], `obstacle ${id}: bad scale range`);
  }

  // ---------------------------------------------------------------- regions
  const regions = await load('/src/config/regions.ts');
  check(regions.REGIONS.length === 16, `expected 16 regions, found ${regions.REGIONS.length}`);
  check(regions.ADVENTURE_LEVEL_COUNT === 800 && regions.LEVELS_PER_REGION === 50, 'Adventure must be 800 levels in regions of 50');
  check(new Set(regions.REGIONS.map((r) => r.id)).size === 16, 'duplicate region ids');

  // ---------------------------------------------------------------- catalogs
  const hoods = await load('/src/progression/hoods.ts');
  check(hoods.RARITIES.length === 10, `expected 10 Hood rarities, found ${hoods.RARITIES.length}`);
  check(hoods.HOODS.length === 200, `expected 200 Hoods, found ${hoods.HOODS.length}`);
  check(new Set(hoods.HOODS.map((x) => x.id)).size === 200, 'duplicate Hood ids');
  check(new Set(hoods.HOODS.map((x) => x.name)).size === 200, 'duplicate Hood names');
  for (const r of hoods.RARITIES) check(hoods.HOODS.filter((x) => x.rarity === r.id).length === 20, `rarity ${r.id} must have exactly 20 Hoods`);
  check(hoods.FAMILIES.length === 20, `expected 20 Hood power families, found ${hoods.FAMILIES.length}`);

  const { WADDLES } = await load('/src/profile/waddles.ts');
  check(WADDLES.length === 20, `expected 20 Waddles, found ${WADDLES.length}`);
  for (const w of WADDLES) frameOk(w.frame, `waddle ${w.id}`);

  const { PROFILE_ICONS } = await load('/src/profile/icons.ts');
  check(PROFILE_ICONS.length === 30, `expected exactly 30 profile icons, found ${PROFILE_ICONS.length}`);
  check(new Set(PROFILE_ICONS.map((i) => i.id)).size === 30, 'duplicate profile icon ids');
  for (const i of PROFILE_ICONS) if (i.frame) frameOk(i.frame, `profile icon ${i.id}`);

  const econ = await load('/src/config/economy.ts');
  check(econ.CHEST_TIERS.length === 5, 'expected exactly five Treasure Chest tiers');
  check(JSON.stringify(econ.CHEST_TIERS.map((c) => c.price)) === '[25,100,225,400,625]', 'chest prices must be 25/100/225/400/625 Fish');
  check(econ.CONTINUE_COST_ICICLES === 800, 'continue must cost 800 Icicles');
  for (const c of econ.CHEST_TIERS) frameOk(c.art, `chest ${c.id}`);
  for (const c of Object.values(econ.CURRENCY_LABEL)) frameOk(c.icon, 'currency icon');

  const quests = await load('/src/quests/quests.ts');
  check(new Set(quests.ALL_QUESTS.map((q) => q.id)).size === quests.ALL_QUESTS.length, 'duplicate quest ids');
  for (const q of quests.ALL_QUESTS) check(q.target > 0, `quest ${q.id}: target must be > 0`);
  for (const cat of ['tutorial', 'daily', 'weekly', 'monthly']) check(quests.ALL_QUESTS.some((q) => q.category === cat), `no ${cat} quests`);

  const ui = readFileSync(join(root, 'src/ui/screens/MainMenuScreen.ts'), 'utf8');
  for (const m of ui.matchAll(/art: '([a-z0-9_]+)'/g)) frameOk(m[1], 'main menu');
  for (const key of ['adventure', 'daily', 'infinite', 'ranked', 'waddle', 'hoods', 'quests', 'treasure', 'purchases', 'watch_ads', 'settings', 'profile']) {
    for (const st of ['normal', 'hover', 'pressed', 'disabled']) frameOk(`btnicon_${key}_${st}`, 'button states');
  }

  // Literal frame references anywhere in the source.
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
  for (const file of walk(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:frame|sprite|spriteFluid|objectButton|textureRef)\(\s*'([a-z0-9_]+)'/g)) frameOk(m[1], relative(root, file));
  }

  // ---------------------------------------------------------------- audio manifest
  const audio = await load('/src/config/audio.ts');
  for (const [slot, track] of Object.entries(audio.MUSIC)) {
    if (!track) continue;
    for (const s of track.src) check(existsSync(join(root, 'public', s)), `music slot ${slot}: missing file public/${s}`);
  }
  const filled = Object.values(audio.MUSIC).filter(Boolean).length;
  notes.push(`music slots filled: ${filled}/${Object.keys(audio.MUSIC).length} recorded tracks (menu slots play the original synthesized theme; other empty slots are silent by design)`);

  // ---------------------------------------------------------------- economy v2 / pet / titles sanity
  const econ2 = await load('/src/config/economy.ts');
  for (const [tier, odds] of Object.entries(econ2.CHEST_HOOD_ODDS)) check(odds.reduce((a, [, w]) => a + w, 0) === 100, `chest ${tier}: Hood odds must sum to 100%`);
  for (const o of econ2.EXCHANGE_OFFERS) check(o.limit && o.limit.count > 0, `exchange ${o.id} must be limited`);
  const pet = await load('/src/config/pet.ts');
  check(pet.PET_TIERS[0].feedCost === 1, 'base pet tier must cost exactly 1 Fish to feed');
  for (const t of pet.PET_TIERS) check(t.dailyShards / t.feedCost < 9, `pet tier ${t.tier} must stay below the Shards→Fish shop price`);
  const titles = await load('/src/config/titles.ts');
  check(new Set(titles.TITLES.map((t) => t.id)).size === titles.TITLES.length, 'title ids must be unique');

  // ---------------------------------------------------------------- generated levels (spot checks; full sweep is in unit tests)
  const { adventureLevel } = await load('/src/levels/adventure.ts');
  const { dailyLevel, utcDateKey } = await load('/src/levels/daily.ts');
  const { infiniteLevel, decodeSeed, encodeSeed } = await load('/src/levels/infinite.ts');
  const { validateLevel } = await load('/src/procedural/validate.ts');
  const levelOk = (lvl, label) => {
    const v = validateLevel(lvl);
    check(v.ok, `${label} invalid: ${v.problems.join('; ')}`);
    check(lvl.fish.length >= lvl.fishRequired && lvl.fishRequired > 0, `${label}: not enough fish`);
    for (const o of lvl.obstacles) check(OBSTACLES[o.type], `${label}: unknown obstacle ${o.type}`);
  };
  for (const n of [1, 2, 8, 9, 50, 51, 137, 400, 650, 799, 800]) {
    levelOk(adventureLevel(n), `adventure ${n}`);
    levelOk(adventureLevel(n, true), `adventure ${n} (hard)`);
  }
  const today = utcDateKey(Date.now());
  for (const i of [1, 20, 40]) levelOk(dailyLevel(today, i), `daily ${today} #${i}`);
  for (const lvlNo of [1, 25, 250, 2500]) {
    const code = encodeSeed({ level: lvlNo, layout: 0x5eed1234 >>> 0 });
    const seed = decodeSeed(code);
    check(seed && seed.level === lvlNo, `seed round-trip failed for level ${lvlNo}`);
    if (seed) levelOk(infiniteLevel(seed), `infinite ${code}`);
  }
  const { dailyMilestoneRewards } = await load('/src/progression/drivers.ts');
  check(dailyMilestoneRewards(today).length === 8, 'Daily must have 8 Popsicle milestone rewards');
} finally {
  await server.close();
}

// ---------------------------------------------------------------- legal pages & notices
for (const f of ['privacy-policy.html', 'terms-of-use.html', 'data-deletion.html', 'support.html', 'third-party-notices.html', 'legal.css']) {
  check(existsSync(join(root, 'public/legal', f)), `legal page missing: public/legal/${f}`);
}
if (existsSync(join(root, 'public/legal/third-party-notices.html'))) {
  const notices = readFileSync(join(root, 'public/legal/third-party-notices.html'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const [name] of Object.entries(pkg.dependencies)) {
    const v = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    check(notices.includes(`<td>${name}</td><td>${v}</td>`), `third-party notices out of date for ${name}@${v} — run: node scripts/gen-notices.mjs`);
  }
}

// ---------------------------------------------------------------- secret scan (client bundles are public)
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bsk_live_[0-9a-zA-Z]{10,}/, 'Stripe live secret key'],
  [/\brk_live_[0-9a-zA-Z]{10,}/, 'Stripe restricted key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bghp_[0-9A-Za-z]{36}\b/, 'GitHub token'],
  [/\bxox[baprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/VITE_[A-Z_]*(?:SECRET|PRIVATE|PASSWORD)[A-Z_]*\s*=/, 'secret-looking VITE_ variable'],
];
const scanDirs = ['src', 'public', 'content', 'index.html'];
const envFiles = readdirSync(root).filter((f) => f.startsWith('.env') && f !== '.env.example');
const scanFile = (p) => {
  if (!/\.(ts|js|mjs|json|html|css|txt|md)$|^\.env/.test(p.split('/').pop())) return;
  const text = readFileSync(p, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) fail(`possible ${label} in ${relative(root, p)} — never ship secrets in the client`);
};
const scanWalk = (p) => {
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) scanWalk(join(p, f));
  else scanFile(p);
};
for (const d of scanDirs) scanWalk(join(root, d));
for (const f of envFiles) scanFile(join(root, f));

// ---------------------------------------------------------------- report
for (const n of notes) console.log(`  note: ${n}`);
if (errors.length) {
  console.error(`\n✗ Content validation failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ Content validation passed');
