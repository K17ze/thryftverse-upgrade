import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
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
await page.goto('http://localhost:3010/wallet', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const rows = await page.$$eval('section[aria-label="Activity hub"] li', els =>
  els.slice(0, 6).map(el => {
    const r = el.getBoundingClientRect();
    const kids = [...el.children].map(c => ({
      cls: (c.className || '').toString().slice(0, 80),
      text: (c.textContent || '').trim().slice(0, 50),
      rect: `${Math.round(c.getBoundingClientRect().x)},${Math.round(c.getBoundingClientRect().width)}`,
      disp: getComputedStyle(c).display,
    }));
    return { rowRect: `${Math.round(r.x)},w=${Math.round(r.width)}`, kids };
  })
);
console.log(JSON.stringify(rows, null, 1));
// section rect + parent widths
const sec = await page.$eval('section[aria-label="Activity hub"]', el => {
  const r = el.getBoundingClientRect();
  let p = el.parentElement, chain = [];
  while (p && chain.length < 4) { chain.push(`${p.tagName}.${(p.className||'').toString().slice(0,60)} w=${Math.round(p.getBoundingClientRect().width)}`); p = p.parentElement; }
  return { secW: Math.round(r.width), secX: Math.round(r.x), chain };
});
console.log(JSON.stringify(sec, null, 1));
await browser.close();
