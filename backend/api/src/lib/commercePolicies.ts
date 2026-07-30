/**
 * Versioned commerce policy registry.
 *
 * Financially meaningful API limits belong here instead of being repeated
 * across route handlers. Database constraints remain the final invariant and
 * integration tests verify that their values match this registry.
 */
export const COMMERCE_POLICY_VERSION = '2026-07-28.1';

export const COOWN_POLICY = Object.freeze({
  version: COMMERCE_POLICY_VERSION,
  maxIssuanceUnits: 20,
  maxOrderUnits: 20,
  maxBuyoutUnits: 20,
});

