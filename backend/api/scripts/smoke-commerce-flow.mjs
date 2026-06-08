/**
 * Phase 7.2 — Commerce Backend Smoke Test
 *
 * Runs against a live backend API to verify end-to-end commerce flows.
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000 node scripts/smoke-commerce-flow.mjs
 *
 * Exit codes:
 *   0 = all steps passed
 *   1 = one or more steps failed
 */

const API_BASE_URL = process.env.API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

const TEST_EMAIL_BUYER = `smoke-buyer-${Date.now()}@thryftverse.test`;
const TEST_EMAIL_SELLER = `smoke-seller-${Date.now()}@thryftverse.test`;
const TEST_PASSWORD = 'SmokeTest123!';
const TEST_USERNAME_BUYER = `smokebuyer${Date.now()}`;
const TEST_USERNAME_SELLER = `smokeseller${Date.now()}`;

let buyerToken = null;
let sellerToken = null;
let buyerId = null;
let sellerId = null;
let listingId = null;
let orderId = null;
let intentId = null;
let addressId = null;
let paymentMethodId = null;

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

async function authedFetch(token, path, opts = {}) {
  return apiFetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function signupAndLogin(email, username, password) {
  // Try signup
  const signupRes = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
  });

  let userId = null;
  let token = null;

  if (signupRes.status === 200 || signupRes.status === 201) {
    userId = signupRes.json?.user?.id;
    token = signupRes.json?.accessToken;
  }

  // If user already exists, login instead
  if (!token && signupRes.status === 409) {
    const loginRes = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (loginRes.status === 200) {
      userId = loginRes.json?.user?.id;
      token = loginRes.json?.accessToken;
    }
  }

  return { userId, token };
}

// ───────────────────────────────────────────────────────────────
async function runSmoke() {
  console.log(`\n=== Commerce Smoke Test ===`);
  console.log(`API: ${API_BASE_URL}\n`);

  // 1. Health check
  let healthOk = false;
  try {
    const res = await apiFetch('/health');
    healthOk = res.status === 200 && res.json?.ok === true;
    logResult('Health check', 'GET /health', '200 + ok:true', `status=${res.status}, ok=${res.json?.ok}`, healthOk);
  } catch (err) {
    logResult('Health check', 'GET /health', '200 + ok:true', `Connection refused — backend not running at ${API_BASE_URL}`, false);
  }

  if (!healthOk) {
    console.log('\n*** ABORTED: Backend is not reachable. Start the API before running this smoke test. ***\n');
    printSummary();
    process.exit(1);
  }

  // 2. Sign up / login test users
  {
    const buyer = await signupAndLogin(TEST_EMAIL_BUYER, TEST_USERNAME_BUYER, TEST_PASSWORD);
    buyerId = buyer.userId;
    buyerToken = buyer.token;
    logResult('Buyer signup/login', 'POST /auth/signup|login', 'token returned', buyerToken ? 'token ok' : 'no token', Boolean(buyerToken));

    const seller = await signupAndLogin(TEST_EMAIL_SELLER, TEST_USERNAME_SELLER, TEST_PASSWORD);
    sellerId = seller.userId;
    sellerToken = seller.token;
    logResult('Seller signup/login', 'POST /auth/signup|login', 'token returned', sellerToken ? 'token ok' : 'no token', Boolean(sellerToken));
  }

  if (!buyerToken || !sellerToken) {
    console.log('\n*** ABORTED: could not obtain auth tokens ***\n');
    printSummary();
    process.exit(1);
  }

  // 3. Create listing as seller
  {
    const res = await authedFetch(sellerToken, '/listings', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke Test Hoodie',
        description: 'A test listing for commerce smoke test.',
        price: 25.0,
        currency: 'GBP',
        condition: 'Very good',
        size: 'M',
        category: 'Clothing',
        subcategory: 'Hoodies',
        images: [],
      }),
    });
    listingId = res.json?.listing?.id;
    const ok = res.status === 200 || res.status === 201;
    logResult('Create listing', 'POST /listings', '201 + listing.id', `status=${res.status}, id=${listingId ?? 'none'}`, ok);
  }

  if (!listingId) {
    console.log('\n*** ABORTED: could not create listing ***\n');
    printSummary();
    process.exit(1);
  }

  // 4. Create address for buyer
  {
    const res = await authedFetch(buyerToken, `/users/${buyerId}/addresses`, {
      method: 'POST',
      body: JSON.stringify({
        label: 'Home',
        line1: '123 Smoke Test St',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'GB',
        isDefault: true,
      }),
    });
    addressId = res.json?.address?.id ?? res.json?.id;
    const ok = res.status === 200 || res.status === 201;
    logResult('Create address', `POST /users/${buyerId}/addresses`, '201 + address id', `status=${res.status}, id=${addressId ?? 'none'}`, ok);
  }

  // 5. Create payment method for buyer
  {
    const res = await authedFetch(buyerToken, `/users/${buyerId}/payment-methods`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'card',
        provider: 'stripe',
        token: 'pm_test_smoke',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
        brand: 'visa',
        nickname: 'Test Card',
        isDefault: true,
      }),
    });
    paymentMethodId = res.json?.paymentMethod?.id ?? res.json?.id;
    const ok = res.status === 200 || res.status === 201;
    logResult('Create payment method', `POST /users/${buyerId}/payment-methods`, '201 + method id', `status=${res.status}, id=${paymentMethodId ?? 'none'}`, ok);
  }

  // 6. Create order
  {
    const res = await authedFetch(buyerToken, '/orders', {
      method: 'POST',
      body: JSON.stringify({
        buyerId,
        listingId,
        addressId: addressId ? Number(addressId) : undefined,
        paymentMethodId: paymentMethodId ? Number(paymentMethodId) : undefined,
      }),
    });
    orderId = res.json?.order?.id;
    const ok = (res.status === 200 || res.status === 201) && Boolean(orderId);
    logResult('Create order', 'POST /orders', '201 + order.id', `status=${res.status}, id=${orderId ?? 'none'}`, ok);
  }

  if (!orderId) {
    console.log('\n*** ABORTED: could not create order ***\n');
    printSummary();
    process.exit(1);
  }

  // 7. Payment intent flow
  {
    const createRes = await authedFetch(buyerToken, '/payments/intents', {
      method: 'POST',
      body: JSON.stringify({ channel: 'commerce', orderId }),
    });
    intentId = createRes.json?.intent?.id;
    const createOk = (createRes.status === 200 || createRes.status === 201) && Boolean(intentId);
    logResult('Create payment intent', 'POST /payments/intents', '201 + intent.id', `status=${createRes.status}, id=${intentId ?? 'none'}`, createOk);

    if (intentId) {
      // Confirm with simulate mode
      const confirmRes = await authedFetch(buyerToken, `/payments/intents/${intentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ simulateStatus: 'succeeded' }),
      });
      const confirmOk = confirmRes.status === 200 && (confirmRes.json?.intent?.status === 'succeeded' || confirmRes.json?.ok === true);
      logResult('Confirm payment intent', `POST /payments/intents/${intentId}/confirm`, '200 + succeeded', `status=${confirmRes.status}, status=${confirmRes.json?.intent?.status ?? 'n/a'}`, confirmOk);

      // Get intent status
      const getRes = await authedFetch(buyerToken, `/payments/intents/${intentId}`);
      const getOk = getRes.status === 200 && getRes.json?.intent?.id === intentId;
      logResult('Get payment intent', `GET /payments/intents/${intentId}`, '200 + intent', `status=${getRes.status}, id=${getRes.json?.intent?.id ?? 'none'}`, getOk);
    }
  }

  // 8. Order detail with enrichment
  {
    const res = await authedFetch(buyerToken, `/orders/${orderId}`);
    const hasBuyer = res.json?.order?.buyer && typeof res.json?.order?.buyer?.username === 'string';
    const hasSeller = res.json?.order?.seller && typeof res.json?.order?.seller?.username === 'string';
    const ok = res.status === 200 && hasBuyer && hasSeller;
    logResult('Order detail + enrichment', `GET /orders/${orderId}`, '200 + buyer/seller objects', `status=${res.status}, buyer=${hasBuyer}, seller=${hasSeller}`, ok);
  }

  // 9. Buyer orders list
  {
    const res = await authedFetch(buyerToken, `/users/${buyerId}/orders?role=buyer&limit=10`);
    const hasOrder = Array.isArray(res.json?.items) && res.json.items.some((o) => o.id === orderId);
    const ok = res.status === 200 && hasOrder;
    logResult('Buyer orders list', `GET /users/${buyerId}/orders`, '200 + contains order', `status=${res.status}, found=${hasOrder}`, ok);
  }

  // 10. Seller orders list
  {
    const res = await authedFetch(sellerToken, `/users/${sellerId}/orders?role=seller&limit=10`);
    const hasOrder = Array.isArray(res.json?.items) && res.json.items.some((o) => o.id === orderId);
    const ok = res.status === 200 && hasOrder;
    logResult('Seller orders list', `GET /users/${sellerId}/orders`, '200 + contains order', `status=${res.status}, found=${hasOrder}`, ok);
  }

  // Helper to create a listing and return its id
  async function createTestListing(title) {
    const res = await authedFetch(sellerToken, '/listings', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: 'Smoke test listing.',
        price: 25.0,
        currency: 'GBP',
        condition: 'Very good',
        size: 'M',
        category: 'Clothing',
        subcategory: 'Hoodies',
        images: [],
      }),
    });
    return res.json?.listing?.id ?? null;
  }

  // Helper to create an order and optionally pay it
  async function createAndPayOrder(listingIdToUse) {
    const res = await authedFetch(buyerToken, '/orders', {
      method: 'POST',
      body: JSON.stringify({ buyerId, listingId: listingIdToUse, addressId: addressId ? Number(addressId) : undefined }),
    });
    const oid = res.json?.order?.id;
    if (oid) {
      const payRes = await authedFetch(buyerToken, '/payments/intents', {
        method: 'POST',
        body: JSON.stringify({ channel: 'commerce', orderId: oid }),
      });
      const intentId = payRes.json?.intent?.id;
      if (intentId) {
        await authedFetch(buyerToken, `/payments/intents/${intentId}/confirm`, {
          method: 'POST',
          body: JSON.stringify({ simulateStatus: 'succeeded' }),
        });
      }
    }
    return oid;
  }

  // 11. Order actions — we need fresh listings+orders for each action to avoid state conflicts.
  let shipOrderId = null;
  let refundOrderId = null;

  // Ship-test: new listing + new order
  {
    const shipListingId = await createTestListing('Smoke Ship Hoodie');
    if (shipListingId) {
      shipOrderId = await createAndPayOrder(shipListingId);
    }
  }

  // Refund-test: new listing + new order
  {
    const refundListingId = await createTestListing('Smoke Refund Hoodie');
    if (refundListingId) {
      refundOrderId = await createAndPayOrder(refundListingId);
    }
  }

  // Cancel on original order (if still in created status — might already be paid)
  {
    const res = await authedFetch(buyerToken, `/orders/${orderId}/cancel`);
    // Cancel may fail if already paid/shipped — that's acceptable as long as it returns proper status
    const isProperResponse = res.status === 200 || res.status === 409 || res.status === 403;
    logResult('Cancel order', `POST /orders/${orderId}/cancel`, '200 or 409', `status=${res.status}, ok=${res.json?.ok}`, isProperResponse);
  }

  // Ship on shipOrderId
  if (shipOrderId) {
    const res = await authedFetch(sellerToken, `/orders/${shipOrderId}/ship`);
    const ok = res.status === 200 && res.json?.status === 'shipped';
    logResult('Ship order', `POST /orders/${shipOrderId}/ship`, '200 + shipped', `status=${res.status}, status=${res.json?.status ?? 'n/a'}`, ok);

    // Deliver on shipOrderId
    if (ok) {
      const delRes = await authedFetch(buyerToken, `/orders/${shipOrderId}/deliver`);
      const delOk = delRes.status === 200 && delRes.json?.status === 'delivered';
      logResult('Deliver order', `POST /orders/${shipOrderId}/deliver`, '200 + delivered', `status=${delRes.status}, status=${delRes.json?.status ?? 'n/a'}`, delOk);
    }
  }

  // Refund on refundOrderId
  if (refundOrderId) {
    const res = await authedFetch(buyerToken, `/orders/${refundOrderId}/refund`);
    const ok = res.status === 200 && res.json?.refunded === true;
    logResult('Refund order', `POST /orders/${refundOrderId}/refund`, '200 + refunded', `status=${res.status}, refunded=${res.json?.refunded ?? 'n/a'}`, ok);
  }

  // 12. Parcel events
  {
    const res = await authedFetch(buyerToken, `/orders/${orderId}/parcel/events`);
    const ok = res.status === 200 && Array.isArray(res.json?.items);
    logResult('Parcel events list', `GET /orders/${orderId}/parcel/events`, '200 + items array', `status=${res.status}, array=${Array.isArray(res.json?.items)}`, ok);
  }

  // 13. Wallet / ledger
  {
    const res = await authedFetch(buyerToken, `/wallets/${buyerId}/snapshot`);
    const ok = res.status === 200 && res.json?.ok === true && typeof res.json?.snapshot?.balanceGbp === 'number';
    logResult('Wallet snapshot', `GET /wallets/${buyerId}/snapshot`, '200 + snapshot.balanceGbp', `status=${res.status}, hasBalance=${typeof res.json?.snapshot?.balanceGbp === 'number'}`, ok);
  }

  {
    const res = await authedFetch(buyerToken, `/users/${buyerId}/transactions?limit=10&offset=0`);
    const ok = res.status === 200 && Array.isArray(res.json?.items);
    logResult('Transaction history', `GET /users/${buyerId}/transactions`, '200 + items array', `status=${res.status}, array=${Array.isArray(res.json?.items)}`, ok);
  }

  // 14. Payouts
  {
    const res = await authedFetch(sellerToken, `/users/${sellerId}/payout-accounts`);
    const ok = res.status === 200 && Array.isArray(res.json?.accounts);
    logResult('Payout accounts list', `GET /users/${sellerId}/payout-accounts`, '200 + accounts array', `status=${res.status}, array=${Array.isArray(res.json?.accounts)}`, ok);
  }

  // 15. Unauthorized checks
  {
    // Buyer trying to ship
    const res = await authedFetch(buyerToken, `/orders/${shipOrderId ?? orderId}/ship`);
    const shipUnauthorized = res.status === 403 || res.status === 401 || res.status === 404 || res.status === 409;
    logResult('Unauthorized ship', `POST /orders/{id}/ship (as buyer)`, '403/401/404/409', `status=${res.status}`, shipUnauthorized);
  }

  {
    // Seller trying to deliver
    const res = await authedFetch(sellerToken, `/orders/${shipOrderId ?? orderId}/deliver`);
    const deliverUnauthorized = res.status === 403 || res.status === 401 || res.status === 404 || res.status === 409;
    logResult('Unauthorized deliver', `POST /orders/{id}/deliver (as seller)`, '403/401/404/409', `status=${res.status}`, deliverUnauthorized);
  }

  {
    // Random user trying to fetch private order
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJyb2xlIjoidXNlciIsInNpZCI6InNlc190ZXN0IiwidHlwIjoiYWNjZXNzIn0.INVALID';
    const res = await authedFetch(fakeToken, `/orders/${orderId}`);
    const privateBlocked = res.status === 401 || res.status === 403;
    logResult('Unauthorized order fetch', `GET /orders/${orderId} (fake token)`, '401/403', `status=${res.status}`, privateBlocked);
  }

  {
    // Invalid user wallet snapshot
    const fakeToken2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJyb2xlIjoidXNlciIsInNpZCI6InNlc190ZXN0IiwidHlwIjoiYWNjZXNzIn0.INVALID';
    const res = await authedFetch(fakeToken2, `/wallets/${buyerId}/snapshot`);
    const walletBlocked = res.status === 401 || res.status === 403;
    logResult('Unauthorized wallet', `GET /wallets/{id}/snapshot (fake token)`, '401/403', `status=${res.status}`, walletBlocked);
  }

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('\n=== Commerce Smoke Test Results ===');
  console.log(`Total:  ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed steps:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.step} (${r.endpoint})`);
      console.log(`    Expected: ${r.expected}`);
      console.log(`    Actual:   ${r.actual}`);
    }
    console.log('\nCOMMERCE_SMOKE_FAIL');
    process.exit(1);
  } else {
    console.log('COMMERCE_SMOKE_PASS');
    process.exit(0);
  }
}

runSmoke().catch((err) => {
  console.error('Unhandled error in smoke test:', err);
  process.exit(1);
});
