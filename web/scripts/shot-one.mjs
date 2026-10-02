import { chromium } from 'playwright';
const [,, route, name, w='1440', h='900'] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width:+w, height:+h }, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  try {
    const key='thryftverse.web.store';
    const s=JSON.parse(localStorage.getItem(key)||'{"version":0,"state":{}}');
    s.state={...(s.state??{}),hasSeenOnboarding:true};
    localStorage.setItem(key,JSON.stringify(s));
    const pk='thryftverse.web.settings-prefs';
    const ps=JSON.parse(localStorage.getItem(pk)||'{"version":0,"state":{}}');
    ps.state={...(ps.state??{}),ageConfirmedAt:new Date().toISOString()};
    localStorage.setItem(pk,JSON.stringify(ps));
  } catch {}
});
const page = await ctx.newPage();
await page.goto(`http://localhost:3010${route}`, { waitUntil:'domcontentloaded', timeout:30000 });
await page.waitForTimeout(2500);
await page.waitForLoadState('networkidle', { timeout:8000 }).catch(()=>{});
await page.screenshot({ path: `../research/audit-views/wave7/${name}.png` });
console.log('OK', name);
await browser.close();
