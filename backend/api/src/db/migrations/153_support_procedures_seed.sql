-- 153: Seed initial deterministic support procedures
--
-- The support_procedures and support_policy_decisions tables were created in
-- migration 151. This migration seeds the three foundational deterministic
-- eligibility procedures the policy engine (support/policyEngine.ts) consults:
--
--   cancellation      — can a buyer request/complete an order cancellation?
--   return            — can a buyer request a return?
--   buyer_protection  — can a buyer file a buyer-protection claim?
--
-- Each procedure is published, audience 'buyer', and carries a
-- definition_json blob describing the deterministic rule inputs and result
-- codes. The policy engine reads the active version at evaluation time so
-- that re-publishing a new version changes behaviour without a code deploy.
--
-- Idempotent: ON CONFLICT (key, version) DO NOTHING.

-- ── Procedure: order cancellation eligibility ──
INSERT INTO support_procedures
  (id, key, version, jurisdiction, audience, risk_tier, definition_json, state, effective_from)
VALUES (
  'proc_cancellation_v1',
  'cancellation',
  1,
  NULL,
  'buyer',
  's1',
  jsonb_build_object(
    'subjectType', 'order',
    'description', 'Determines whether a buyer can request or complete cancellation of an order.',
    'inputs', jsonb_build_array(
      'order.status', 'order.shipped_at', 'order.delivered_at',
      'payment_intent.status', 'caller_role'
    ),
    'resultCodes', jsonb_build_array(
      'ELIGIBLE',
      'NOT_ELIGIBLE_SHIPPED',
      'NOT_ELIGIBLE_DELIVERED',
      'NOT_ELIGIBLE_ALREADY_CANCELLED',
      'NOT_ELIGIBLE_NOT_BUYER',
      'NOT_ELIGIBLE_ORDER_NOT_FOUND'
    ),
    'rules', jsonb_build_array(
      jsonb_build_object('if', jsonb_build_object('order.status', 'cancelled'), 'then', 'NOT_ELIGIBLE_ALREADY_CANCELLED'),
      jsonb_build_object('if', jsonb_build_object('order.status', 'delivered'), 'then', 'NOT_ELIGIBLE_DELIVERED'),
      jsonb_build_object('if', jsonb_build_object('order.status', 'shipped'), 'then', 'NOT_ELIGIBLE_SHIPPED'),
      jsonb_build_object('if', jsonb_build_object('order.status', jsonb_build_array('created','paid')), 'then', 'ELIGIBLE')
    )
  ),
  'published',
  NOW()
)
ON CONFLICT (key, version) DO NOTHING;

-- ── Procedure: order return eligibility ──
INSERT INTO support_procedures
  (id, key, version, jurisdiction, audience, risk_tier, definition_json, state, effective_from)
VALUES (
  'proc_return_v1',
  'return',
  1,
  NULL,
  'buyer',
  's2',
  jsonb_build_object(
    'subjectType', 'order',
    'description', 'Determines whether a buyer can request a return for a delivered order.',
    'inputs', jsonb_build_array(
      'order.status', 'order.delivered_at', 'return_window_days', 'caller_role'
    ),
    'resultCodes', jsonb_build_array(
      'ELIGIBLE_WITHIN_RETURN_WINDOW',
      'NOT_ELIGIBLE_NOT_DELIVERED',
      'NOT_ELIGIBLE_RETURN_WINDOW_EXPIRED',
      'NOT_ELIGIBLE_ALREADY_CANCELLED',
      'NOT_ELIGIBLE_NOT_BUYER',
      'NOT_ELIGIBLE_ORDER_NOT_FOUND'
    ),
    'rules', jsonb_build_array(
      jsonb_build_object('if', jsonb_build_object('order.status', 'cancelled'), 'then', 'NOT_ELIGIBLE_ALREADY_CANCELLED'),
      jsonb_build_object('if', jsonb_build_object('order.status', jsonb_build_array('created','paid','shipped')), 'then', 'NOT_ELIGIBLE_NOT_DELIVERED'),
      jsonb_build_object('if', jsonb_build_object('order.delivered_within_days', 'return_window_days'), 'then', 'ELIGIBLE_WITHIN_RETURN_WINDOW'),
      jsonb_build_object('if', jsonb_build_object('order.delivered_within_days', 'gt', 'return_window_days'), 'then', 'NOT_ELIGIBLE_RETURN_WINDOW_EXPIRED')
    ),
    'constants', jsonb_build_object('return_window_days', 14)
  ),
  'published',
  NOW()
)
ON CONFLICT (key, version) DO NOTHING;

-- ── Procedure: buyer protection claim eligibility ──
INSERT INTO support_procedures
  (id, key, version, jurisdiction, audience, risk_tier, definition_json, state, effective_from)
VALUES (
  'proc_buyer_protection_v1',
  'buyer_protection',
  1,
  NULL,
  'buyer',
  's2',
  jsonb_build_object(
    'subjectType', 'order',
    'description', 'Determines whether a buyer can file a buyer-protection claim (SNAD / non-delivery) for a delivered order.',
    'inputs', jsonb_build_array(
      'order.status', 'order.delivered_at', 'order.buyer_protection_fee_gbp',
      'protection_window_days', 'caller_role'
    ),
    'resultCodes', jsonb_build_array(
      'ELIGIBLE_WITHIN_PROTECTION_WINDOW',
      'NOT_ELIGIBLE_NOT_DELIVERED',
      'NOT_ELIGIBLE_PROTECTION_WINDOW_EXPIRED',
      'NOT_ELIGIBLE_NO_PROTECTION_FEE',
      'NOT_ELIGIBLE_ALREADY_CANCELLED',
      'NOT_ELIGIBLE_NOT_BUYER',
      'NOT_ELIGIBLE_ORDER_NOT_FOUND'
    ),
    'rules', jsonb_build_array(
      jsonb_build_object('if', jsonb_build_object('order.status', 'cancelled'), 'then', 'NOT_ELIGIBLE_ALREADY_CANCELLED'),
      jsonb_build_object('if', jsonb_build_object('order.status', jsonb_build_array('created','paid','shipped')), 'then', 'NOT_ELIGIBLE_NOT_DELIVERED'),
      jsonb_build_object('if', jsonb_build_object('order.buyer_protection_fee_gbp', 0), 'then', 'NOT_ELIGIBLE_NO_PROTECTION_FEE'),
      jsonb_build_object('if', jsonb_build_object('order.delivered_within_days', 'protection_window_days'), 'then', 'ELIGIBLE_WITHIN_PROTECTION_WINDOW'),
      jsonb_build_object('if', jsonb_build_object('order.delivered_within_days', 'gt', 'protection_window_days'), 'then', 'NOT_ELIGIBLE_PROTECTION_WINDOW_EXPIRED')
    ),
    'constants', jsonb_build_object('protection_window_days', 2)
  ),
  'published',
  NOW()
)
ON CONFLICT (key, version) DO NOTHING;

COMMENT ON TABLE support_procedures IS 'Versioned deterministic procedures with risk tiers and effective intervals. Seeded with cancellation, return and buyer_protection procedures in migration 153.';
