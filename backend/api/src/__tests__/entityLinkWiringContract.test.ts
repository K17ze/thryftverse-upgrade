import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contract for R82: the entity_links graph (migration 155, FR-06) was
// dead code — schema and helpers existed but recordEntityLink had zero
// callers. These guards assert the write paths actually call it:
//   - auth signup/login → account↔device (shares_device) + account↔IP
//     (shares_ip, IP tokenised as an `address` node)
//   - payment-method save → account↔payment_instrument
//   - payout-account save → account↔payout_destination
// Every call site must be fail-open so a graph-write failure can never break
// the mutation that emitted it.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SRC = readFileSync(path.join(SRC_DIR, 'routes', 'auth.ts'), 'utf8');
const INDEX_SRC = readFileSync(path.join(SRC_DIR, 'index.ts'), 'utf8');
const STRIPE_PM_SRC = readFileSync(
  path.join(SRC_DIR, 'lib', 'stripePaymentMethods.ts'),
  'utf8',
);
const MIGRATION_SRC = readFileSync(
  path.join(SRC_DIR, 'db', 'migrations', '155_risk_decision_system.sql'),
  'utf8',
);

describe('entity-link graph wiring (R82)', () => {
  it('auth signup and login record account↔device and account↔IP links', () => {
    // The helper must emit both link types the fraud pipeline clusters on.
    assert.match(AUTH_SRC, /linkType:\s*'shares_device'/, 'auth.ts must emit shares_device links');
    assert.match(AUTH_SRC, /linkType:\s*'shares_ip'/, 'auth.ts must emit shares_ip links');

    // Both auth write paths must invoke the recorder.
    assert.match(AUTH_SRC, /linkSource:\s*'signup'/, 'signup path must tag links with linkSource signup');
    assert.match(AUTH_SRC, /linkSource:\s*'login'/, 'login path must tag links with linkSource login');

    // The device ref must reuse the fraud engine's request-environment
    // fingerprint so Redis and Postgres clustering agree.
    assert.match(
      AUTH_SRC,
      /generateDeviceFingerprint\(/,
      'auth.ts must derive the device node from generateDeviceFingerprint',
    );

    // Fail-open: link writes must be caught and logged, never thrown.
    assert.match(
      AUTH_SRC,
      /recordEntityLink\(db, link\)\.catch\(/,
      'auth entity links must be fail-open (.catch on recordEntityLink)',
    );
  });

  it('payment-method saves record account↔payment_instrument links', () => {
    // Live path: Stripe projection sync (v2 payment methods) records the
    // provider card fingerprint — stable across customers, never raw PAN.
    assert.match(
      STRIPE_PM_SRC,
      /recordEntityLink\(input\.db,[\s\S]*?linkType:\s*'shares_payment_instrument'/,
      'stripePaymentMethods sync must record shares_payment_instrument links',
    );
    assert.match(
      STRIPE_PM_SRC,
      /method\.card\.fingerprint/,
      'payment-instrument node ref must prefer the provider card fingerprint',
    );

    // Legacy route (retained migration-era path) must also record on save.
    const legacyRoute = INDEX_SRC.match(
      /app\.post\('\/users\/:userId\/payment-methods'[\s\S]*?\n\}\);/,
    );
    assert.ok(legacyRoute, 'POST /users/:userId/payment-methods not found in index.ts');
    assert.match(
      legacyRoute[0],
      /linkType:\s*'shares_payment_instrument'/,
      'legacy payment-method save must record shares_payment_instrument',
    );
    assert.match(
      legacyRoute[0],
      /\.catch\(/,
      'legacy payment-method entity link must be fail-open',
    );
  });

  it('payout-account saves record account↔payout_destination links', () => {
    const payoutRoute = INDEX_SRC.match(
      /app\.post\('\/users\/:userId\/payout-accounts'[\s\S]*?\n\}\);/,
    );
    assert.ok(payoutRoute, 'POST /users/:userId/payout-accounts not found in index.ts');
    assert.match(
      payoutRoute[0],
      /linkType:\s*'shares_payout_destination'/,
      'payout-account save must record shares_payout_destination',
    );
    assert.match(
      payoutRoute[0],
      /nodeBType:\s*'payout_destination'/,
      'payout link must target a payout_destination node',
    );
    assert.match(
      payoutRoute[0],
      /linkSource:\s*'payout'/,
      'payout link must use linkSource payout',
    );
    assert.match(
      payoutRoute[0],
      /\.catch\(/,
      'payout entity link must be fail-open',
    );
  });

  it('every linkSource used is allowed by the entity_links CHECK constraint', () => {
    const constraint = MIGRATION_SRC.match(
      /link_source TEXT NOT NULL CHECK \(link_source IN \(([^)]+)\)\)/,
    );
    assert.ok(constraint, 'link_source CHECK constraint not found in migration 155');
    for (const source of ["'signup'", "'login'", "'transaction'", "'payout'"]) {
      assert.ok(
        constraint[1].includes(source),
        `link_source ${source} is not allowed by the entity_links schema`,
      );
    }
  });
});
