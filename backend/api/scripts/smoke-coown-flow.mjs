/**
 * Phase 8 — Co-Own / Trade Backend Smoke Test
 *
 * Runs against a live backend API to verify end-to-end co-own flows.
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000 node scripts/smoke-coown-flow.mjs
 *
 * Exit codes:
 *   0 = all steps passed
 *   1 = one or more steps failed
 */

const API_BASE_URL = process.env.API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

const TEST_EMAIL = `smoke-coown-${Date.now()}@thryftverse.test`;
const TEST_PASSWORD = 'SmokeTest123!';
const TEST_USERNAME = `smokecoown${Date.now()}`;

let token = null;
let userId = null;
let listingId = null;
let assetId = null;
let orderId = null;

const results = [];

function logResult(step, endpoint, expected, actual, pass) {
  results.push({ step, endpoint, expected, actual, pass });
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${step} | ${endpoint}`);
  if (!pass) {
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
  }
}

async function apiFetch(path, opts = {}) {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }
  return { status: res.status, text, json };
}

async function authFetch(path, opts = {}) {
  return apiFetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function run() {
  console.log(`\nCo-Own Smoke Test against ${API_BASE_URL}\n`);

  // 1. Signup
  let res = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, username: TEST_USERNAME, password: TEST_PASSWORD }),
  });
  let pass = res.status === 200 || res.status === 201;
  logResult('Signup', '/auth/signup', '200/201', res.status, pass);
  if (!pass) {
    console.log('  Response:', res.text);
    process.exit(1);
  }
  token = res.json?.token ?? res.json?.accessToken ?? null;
  userId = res.json?.user?.id ?? res.json?.userId ?? null;

  // 2. Login (if signup didn't return token)
  if (!token) {
    res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    pass = res.status === 200;
    logResult('Login', '/auth/login', '200', res.status, pass);
    if (!pass) {
      console.log('  Response:', res.text);
      process.exit(1);
    }
    token = res.json?.token ?? res.json?.accessToken ?? null;
    userId = res.json?.user?.id ?? res.json?.userId ?? null;
  }

  // 3. Create listing (needed for co-own asset)
  listingId = `lst_coown_${Date.now()}`;
  res = await authFetch('/listings', {
    method: 'POST',
    body: JSON.stringify({
      id: listingId,
      sellerId: userId,
      title: 'Smoke Test Co-Own Listing',
      description: 'Created by smoke test',
      priceGbp: 100,
      status: 'active',
      condition: 'new',
      size: 'M',
      category: 'test',
    }),
  });
  pass = res.status === 200 || res.status === 201;
  logResult('Create listing', '/listings', '200/201', res.status, pass);
  if (!pass) {
    console.log('  Response:', res.text);
    process.exit(1);
  }

  // 4. Create co-own asset
  assetId = `asset_${Date.now()}`;
  res = await authFetch('/co-own/assets', {
    method: 'POST',
    body: JSON.stringify({
      id: assetId,
      listingId,
      issuerId: userId,
      title: 'Smoke Test Co-Own Asset',
      totalUnits: 10,
      unitPriceGbp: 10.0,
      unitPriceStable: 10.0,
      settlementMode: 'GBP',
    }),
  });
  pass = res.status === 201 && res.json?.ok === true && res.json?.asset?.id === assetId;
  logResult('Create co-own asset', '/co-own/assets', '201 + ok + asset.id', `${res.status} | ok=${res.json?.ok} | assetId=${res.json?.asset?.id}`, pass);
  if (!pass) {
    console.log('  Response:', res.text);
    process.exit(1);
  }

  // 5. List co-own assets
  res = await authFetch(`/co-own/assets?limit=10`);
  pass = res.status === 200 && Array.isArray(res.json?.items);
  logResult('List co-own assets', '/co-own/assets', '200 + items[]', `${res.status} | items=${res.json?.items?.length}`, pass);

  // 6. Get asset detail
  res = await authFetch(`/co-own/assets/${assetId}`);
  pass = res.status === 200 && res.json?.item?.id === assetId;
  logResult('Get asset detail', `/co-own/assets/${assetId}`, '200 + item.id === assetId', `${res.status} | id=${res.json?.item?.id}`, pass);

  // 7. Buy units
  res = await authFetch(`/co-own/assets/${assetId}/orders`, {
    method: 'POST',
    body: JSON.stringify({
      userId,
      side: 'buy',
      units: 3,
      orderType: 'market',
    }),
  });
  const buyPass = res.status === 200 && res.json?.ok === true && res.json?.order?.status === 'filled';
  const jurisdictionBlocked = res.status === 403 && res.json?.code === 'JURISDICTION_RULE_MISSING';
  pass = buyPass || jurisdictionBlocked;
  logResult('Buy units', `/co-own/assets/${assetId}/orders`, '200 filled or 403 jurisdiction', `${res.status} | ok=${res.json?.ok} | status=${res.json?.order?.status} | code=${res.json?.code}`, pass);
  if (jurisdictionBlocked) {
    console.log('  Note: Test environment lacks jurisdiction rules for co-own market');
  }
  if (!pass) {
    console.log('  Response:', res.text);
    process.exit(1);
  }
  orderId = res.json?.order?.id ?? null;

  // 8. Verify holdings
  res = await authFetch(`/users/${userId}/co-own/holdings`);
  pass = res.status === 200 && Array.isArray(res.json?.items);
  const holding = res.json?.items?.find((h) => h.assetId === assetId);
  const holdingOk = jurisdictionBlocked ? !holding : holding && holding.unitsOwned === 3;
  logResult('Fetch holdings', `/users/${userId}/co-own/holdings`, '200 + items[]', `${res.status} | unitsOwned=${holding?.unitsOwned ?? 0}`, pass && holdingOk);

  // 9. List orders for asset
  res = await authFetch(`/co-own/assets/${assetId}/orders?limit=10`);
  pass = res.status === 200 && Array.isArray(res.json?.items);
  const order = res.json?.items?.find((o) => o.id === orderId);
  logResult('List asset orders', `/co-own/assets/${assetId}/orders`, '200 + order[]', `${res.status} | orders=${res.json?.items?.length} | found=${!!order}`, pass);

  // 10. Fetch market history
  res = await authFetch(`/users/${userId}/market-history?limit=10`);
  pass = res.status === 200 && Array.isArray(res.json?.items);
  const historyItem = res.json?.items?.find((h) => h.referenceId === assetId);
  logResult('Fetch market history', `/users/${userId}/market-history`, '200 + history[]', `${res.status} | history=${res.json?.items?.length} | found=${!!historyItem}`, pass);

  // 11. Asset detail shows correct available units
  res = await authFetch(`/co-own/assets/${assetId}`);
  const expectedAvailable = jurisdictionBlocked ? 10 : 7;
  pass = res.status === 200 && res.json?.item?.availableUnits === expectedAvailable;
  logResult('Asset available check', `/co-own/assets/${assetId}`, `availableUnits=${expectedAvailable}`, `${res.status} | available=${res.json?.item?.availableUnits}`, pass);

  // 12. Unauthorized access to holdings
  res = await apiFetch(`/users/${userId}/co-own/holdings`);
  pass = res.status === 401;
  logResult('Unauthorized holdings', `/users/${userId}/co-own/holdings`, '401', res.status, pass);

  // 13. Forbidden access (wrong user)
  res = await authFetch(`/users/other-user-id/co-own/holdings`);
  pass = res.status === 403;
  logResult('Forbidden holdings', `/users/other-user-id/co-own/holdings`, '403', res.status, pass);

  // 14. Sell units (must have holdings)
  res = await authFetch(`/co-own/assets/${assetId}/orders`, {
    method: 'POST',
    body: JSON.stringify({
      userId,
      side: 'sell',
      units: 1,
      orderType: 'market',
    }),
  });
  const sellPass = res.status === 200 && res.json?.ok === true && res.json?.order?.status === 'filled';
  const sellJurisdictionBlocked = res.status === 403 && res.json?.code === 'JURISDICTION_RULE_MISSING';
  const sellInsufficient = res.status === 409;
  pass = sellPass || sellJurisdictionBlocked || sellInsufficient;
  logResult('Sell units', `/co-own/assets/${assetId}/orders`, '200 filled or 403/409', `${res.status} | ok=${res.json?.ok} | status=${res.json?.order?.status} | code=${res.json?.code}`, pass);

  // 15. Holdings updated after sell
  res = await authFetch(`/users/${userId}/co-own/holdings`);
  const holdingAfterSell = res.json?.items?.find((h) => h.assetId === assetId);
  const expectedAfterSell = jurisdictionBlocked ? 0 : 2;
  pass = res.status === 200 && (jurisdictionBlocked ? !holdingAfterSell : holdingAfterSell?.unitsOwned === expectedAfterSell);
  logResult('Holdings after sell', `/users/${userId}/co-own/holdings`, `unitsOwned=${expectedAfterSell}`, `${res.status} | unitsOwned=${holdingAfterSell?.unitsOwned ?? 0}`, pass);

  // 16. Insufficient holdings for sell
  res = await authFetch(`/co-own/assets/${assetId}/orders`, {
    method: 'POST',
    body: JSON.stringify({
      userId,
      side: 'sell',
      units: 100,
      orderType: 'market',
    }),
  });
  pass = res.status === 409 || res.status === 400 || (res.status === 403 && res.json?.code === 'JURISDICTION_RULE_MISSING');
  logResult('Insufficient holdings sell', `/co-own/assets/${assetId}/orders`, '400/409 or 403 jurisdiction', `${res.status} | code=${res.json?.code}`, pass);

  // Summary
  console.log('\n=== Co-Own Smoke Test Summary ===');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed steps:');
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.step}: ${r.endpoint}`));
    process.exit(1);
  }
  console.log('\nCO_OWN_SMOKE_PASS');
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
