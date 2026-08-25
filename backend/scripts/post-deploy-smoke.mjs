/**
 * Post-Deployment Smoke Test — lightweight API availability probe.
 *
 * Designed to run in CI after a deployment to verify the API is healthy
 * and responding correctly. Uses native `fetch` (Node 18+).
 *
 * Tests:
 *   1. GET /health          → expects 200 with { ok: true }
 *   2. GET /auth/me         → expects 401 (no token provided)
 *   3. GET /listings        → expects 200 with items array
 *
 * Usage:
 *   BASE_URL=https://api-staging.thryftverse.com node post-deploy-smoke.mjs
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 */
const baseUrl = (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ expectedStatus?: number }} [opts]
 */
async function fetchWithRetry(url, init, opts = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (opts.expectedStatus !== undefined && response.status !== opts.expectedStatus) {
        // If we got a response but wrong status, no point retrying
        return response;
      }

      // If the server is still starting (502/503), retry
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.log(`  [retry ${attempt}/${MAX_RETRIES}] Server returned ${response.status}, waiting ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        console.log(`  [retry ${attempt}/${MAX_RETRIES}] Request failed: ${error instanceof Error ? error.message : String(error)}, waiting ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed after ${MAX_RETRIES} attempts: ${url}`);
}

let failures = 0;

function fail(message) {
  console.error(`  FAIL: ${message}`);
  failures += 1;
}

function pass(message) {
  console.log(`  PASS: ${message}`);
}

async function checkHealth() {
  console.log('[smoke] Health endpoint (/health)');
  try {
    const response = await fetchWithRetry(`${baseUrl}/health`, {}, { expectedStatus: 200 });
    const body = await response.json();

    if (response.status !== 200) {
      fail(`Expected status 200, got ${response.status}`);
      return;
    }

    if (body.ok !== true) {
      fail(`Expected { ok: true }, got ${JSON.stringify(body)}`);
      return;
    }

    pass(`Health endpoint returned 200 with ok=true`);
  } catch (error) {
    fail(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkAuthUnauthorized() {
  console.log('[smoke] Auth endpoint without token (/auth/me)');
  try {
    const response = await fetchWithRetry(`${baseUrl}/auth/me`, {
      headers: { authorization: '' },
    });

    if (response.status !== 401) {
      fail(`Expected status 401 (unauthorized), got ${response.status}`);
      return;
    }

    pass(`Auth endpoint correctly returned 401 without token`);
  } catch (error) {
    fail(`Auth check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkListings() {
  console.log('[smoke] Listings endpoint (/listings)');
  try {
    const response = await fetchWithRetry(`${baseUrl}/listings`, {}, { expectedStatus: 200 });

    if (response.status !== 200) {
      fail(`Expected status 200, got ${response.status}`);
      return;
    }

    const body = await response.json();

    if (!Array.isArray(body.items)) {
      fail(`Expected "items" array in response, got: ${JSON.stringify(body).slice(0, 200)}`);
      return;
    }

    pass(`Listings endpoint returned 200 with ${body.items.length} items`);
  } catch (error) {
    fail(`Listings check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log(`\nPost-deployment smoke test against: ${baseUrl}\n`);

  await checkHealth();
  await checkAuthUnauthorized();
  await checkListings();

  console.log('');
  if (failures > 0) {
    console.error(`\u2716 ${failures} smoke test(s) FAILED`);
    process.exit(1);
  }

  console.log('\u2714 All smoke tests passed');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
