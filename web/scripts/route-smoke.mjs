// Route smoke — visits every route on the running server (fixture mode),
// records HTTP status + console errors + page errors. Dynamic routes use
// fixture IDs. Run against `next start` on :3000.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const ROUTES = [
  // core surfaces
  '/', '/browse', '/search', '/explore', '/collections', '/moodboards',
  '/outfits', '/galleria', '/live', '/pulse', '/auctions', '/sell',
  '/inbox', '/notifications', '/offers', '/orders', '/saved',
  '/profile', '/profile/edit', '/wallet', '/wallet/history',
  '/wallet/send', '/wallet/payouts', '/wallet/convert', '/wallet/exchange',
  '/wallet/withdraw', '/settings', '/settings/personal', '/settings/security',
  '/settings/notifications', '/settings/messaging', '/settings/privacy',
  '/help', '/support', '/create', '/invite', '/verification',
  '/co-own', '/co-own/alerts', '/co-own/orders', '/co-own/portfolio',
  '/co-own/pools', '/co-own/ledger', '/co-own/leaderboard',
  '/co-own/distributions', '/co-own/guide', '/co-own/create',
  '/agents', '/agents/ledger', '/agents/algorithm',
  '/seller-hub', '/seller-hub/listings', '/seller-hub/auctions',
  '/seller-hub/promotions', '/seller-hub/storefront', '/seller-hub/bulk',
  '/seller-hub/earnings', '/seller-hub/fulfilment', '/seller-hub/settings',
  '/seller-hub/import', '/seller-hub/quick-replies', '/seller-hub/analytics',
  '/creator-analytics', '/search/chat', '/search/visual',
  '/poster/archive', '/live/create', '/outfits/builder',
  '/verification/demands', '/privacy', '/terms', '/sustainability',
  // dynamic routes w/ fixture ids
  '/item/l1', '/item/l10', '/u/mariefullery', '/u/dankdunksuk',
  '/u/mariefullery/followers', '/u/mariefullery/following',
  '/auctions/a1', '/collection/col-rotation', '/look/look-1',
  '/moodboard/mb1', '/inbox/c1', '/orders/ord-1021', '/co-own/co1',
  '/poster/p1', '/support/buyer-protection', '/explore/collection/cur-archive',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  try {
    const key = 'thryftverse.web.store';
    const raw = localStorage.getItem(key);
    const s = raw ? JSON.parse(raw) : { version: 0, state: {} };
    s.state = { ...(s.state ?? {}), hasSeenOnboarding: true };
    localStorage.setItem(key, JSON.stringify(s));
    const pk = 'thryftverse.web.settings-prefs';
    const pr = localStorage.getItem(pk);
    const ps = pr ? JSON.parse(pr) : { version: 0, state: {} };
    ps.state = { ...(ps.state ?? {}), ageConfirmedAt: new Date().toISOString() };
    localStorage.setItem(pk, JSON.stringify(ps));
  } catch {}
});
const page = await ctx.newPage();

const results = [];
const errByRoute = new Map();
for (const route of ROUTES) {
  const errors = [];
  const onConsole = (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); };
  const onPageErr = (e) => errors.push(`PAGEERR ${String(e).slice(0, 160)}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageErr);
  const t0 = Date.now();
  const res = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => null);
  await page.waitForTimeout(1200);
  const ms = Date.now() - t0;
  const status = res ? res.status() : 'NAV-FAIL';
  const flag = status === 200 ? 'OK ' : 'BAD';
  results.push(`${flag} ${status} ${String(ms).padStart(5)}ms ${route}${errors.length ? `  [${errors.length} console err]` : ''}`);
  if (errors.length) errByRoute.set(route, errors.slice(0, 4));
  page.off('console', onConsole);
  page.off('pageerror', onPageErr);
}
console.log(results.join('\n'));
console.log('\n── console/page errors ──');
for (const [r, errs] of errByRoute) {
  console.log(`\n${r}`);
  errs.forEach((e) => console.log(`   ${e}`));
}
const bad = results.filter((r) => r.startsWith('BAD'));
console.log(`\n${ROUTES.length - bad.length}/${ROUTES.length} routes 200 · ${bad.length} bad · ${errByRoute.size} with errors`);
await browser.close();
