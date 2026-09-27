import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contract for the R52 surveillance baseline: the risk-decision
// taxonomy declares `coown.order` and `coown.transfer` event types, and the
// audit requires that co-own order placement and cancellation actually feed
// the advisory risk pipeline (immutable risk_events + rule-engine signals).
// A taxonomy slot nothing emits is surveillance theatre — this guard keeps
// the wiring honest without needing a live DB or Redis.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COOWN_SRC = readFileSync(path.join(SRC_DIR, 'routes', 'coOwn.ts'), 'utf8');
const INDEX_SRC = readFileSync(path.join(SRC_DIR, 'index.ts'), 'utf8');

describe('co-own surveillance wiring (R52)', () => {
  it('emits a coown.order risk evaluation on order placement', () => {
    // Order placement path must call evaluateRisk with the coown.order event.
    const placements = COOWN_SRC.match(/evaluateRisk\([\s\S]*?eventType:\s*'coown\.order'/g);
    assert.ok(
      placements && placements.length >= 1,
      "POST /co-own/assets/:assetId/orders must call evaluateRisk with eventType 'coown.order'",
    );
  });

  it('emits a coown.order risk evaluation on order cancel (place/cancel bursts)', () => {
    // The cancel route distinguishes itself via context.action = 'cancel' so
    // velocity rules can observe spoofing-like place/cancel patterns.
    assert.match(
      COOWN_SRC,
      /action:\s*'cancel'/,
      "cancel path must tag the risk event with action: 'cancel'",
    );
  });

  it('receives the risk pipeline dependencies at registration', () => {
    const registration = INDEX_SRC.match(
      /registerCoOwnRoutes\(\{[\s\S]*?\}\);/,
    );
    assert.ok(registration, 'registerCoOwnRoutes call not found in index.ts');
    for (const dep of ['redis', 'fraudShadowService', 'ipReputationProvider']) {
      assert.ok(
        registration[0].includes(dep),
        `registerCoOwnRoutes must receive ${dep} for surveillance wiring`,
      );
    }
  });
});
