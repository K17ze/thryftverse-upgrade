import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePayoutProviderReference } from '../lib/payoutTransitionPolicy.js';

test('resolvePayoutProviderReference requires provider reference for provider webhook paid transitions', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'paid',
    transitionSource: 'provider_webhook',
    inputProviderPayoutRef: '  ',
    existingProviderPayoutRef: null,
  });

  assert.equal(resolution.requiresProviderReference, true);
  assert.equal(resolution.providerPayoutRef, null);
  assert.equal(resolution.isValid, false);
});

test('resolvePayoutProviderReference accepts provider reference for external paid transitions', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'paid',
    transitionSource: 'admin_review',
    inputProviderPayoutRef: ' wise_trx_123 ',
    existingProviderPayoutRef: null,
  });

  assert.equal(resolution.requiresProviderReference, true);
  assert.equal(resolution.providerPayoutRef, 'wise_trx_123');
  assert.equal(resolution.isValid, true);
});

test('resolvePayoutProviderReference rejects fabricated fallback references for manual paid transitions', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'paid',
    transitionSource: 'manual_status',
    inputProviderPayoutRef: null,
    existingProviderPayoutRef: null,
  });

  assert.equal(resolution.requiresProviderReference, true);
  assert.equal(resolution.providerPayoutRef, null);
  assert.equal(resolution.isValid, false);
});

test('resolvePayoutProviderReference keeps existing reference for non-paid transitions', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'processing',
    transitionSource: 'provider_webhook',
    inputProviderPayoutRef: null,
    existingProviderPayoutRef: '   wise_existing_1   ',
  });

  assert.equal(resolution.requiresProviderReference, false);
  assert.equal(resolution.providerPayoutRef, 'wise_existing_1');
  assert.equal(resolution.isValid, true);
});
