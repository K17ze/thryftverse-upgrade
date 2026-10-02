// Audit screenshot capture — renders key surfaces at desktop 1440px and
// mobile 390px, seeds onboarding/session bypass like journey.mjs.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3010';
const OUT = process.env.OUT_DIR ?? 'qa-shots/audit-oct1-wave7';
mkdirSync(OUT, { recursive: true });

const seed = () => {
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
    // Dismiss the Co-Own first-visit explainer so captures audit the hub.
    localStorage.setItem('thryftverse:coown-hub-tour', '1');
  } catch {}
};

const DESKTOP = [
  ['/', 'home'],
  ['/browse', 'browse'],
  ['/search', 'search'],
  ['/search?q=jacket', 'search-results'],
  ['/explore', 'explore'],
  ['/item/l1', 'pdp'],
  ['/auctions', 'auctions'],
  ['/auctions/a1', 'auction-detail'],
  ['/live', 'live'],
  ['/pulse', 'pulse'],
  ['/galleria', 'galleria'],
  ['/u/mariefullery', 'profile'],
  ['/co-own', 'coown'],
  ['/co-own/co1', 'coown-asset'],
  ['/bag', 'bag'],
  ['/sell', 'sell'],
  ['/inbox', 'inbox'],
  ['/notifications', 'notifications'],
  ['/wallet', 'wallet'],
  ['/orders', 'orders'],
  ['/offers', 'offers'],
  ['/saved', 'saved'],
  ['/seller-hub', 'seller-hub'],
  ['/agents', 'agents'],
  ['/agents/studio', 'agents-studio'],
  ['/moodboards', 'moodboards'],
  ['/collections', 'collections'],
  ['/settings', 'settings'],
];

const MOBILE = [
  ['/', 'home'],
  ['/explore', 'explore'],
  ['/item/l1', 'pdp'],
  ['/browse', 'browse'],
  ['/auctions/a1', 'auction-detail'],
  ['/u/mariefullery', 'profile'],
  ['/bag', 'bag'],
  ['/pulse', 'pulse'],
];

const browser = await chromium.launch();

async function shoot(routes, vp, tag, scheme = 'dark') {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: scheme });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  for (const [route, name] of routes) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      // settle fonts/images
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: false });
      // also capture a scrolled view for long surfaces
      await page.evaluate(() => window.scrollTo(0, 1200)).catch(() => {});
      // Lazy media needs a beat after the scroll or fold2 captures blank thumbs.
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `${OUT}/${tag}-${name}-fold2.png`, fullPage: false });
      console.log(`OK ${tag}-${name}`);
    } catch (e) {
      console.log(`FAIL ${tag}-${name}: ${e.message}`);
    }
  }
  await ctx.close();
}

await shoot(DESKTOP, { width: 1440, height: 900 }, 'd');
await shoot(MOBILE, { width: 390, height: 844 }, 'm');
await browser.close();
console.log('DONE');
