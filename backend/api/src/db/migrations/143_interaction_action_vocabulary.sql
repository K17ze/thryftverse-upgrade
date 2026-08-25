-- Migration 143: Expand interaction action vocabulary for marketplace recommender learning
--
-- The original interactions and recommendation_feedback tables (migrations
-- 001 and 002) constrained action to ('view', 'wishlist', 'purchase'). That
-- vocabulary is too narrow for a marketplace recommender: it cannot
-- distinguish a qualified detail view from a rapid skip, capture funnel
-- signals (add_to_basket, checkout_started, offer_started), or record
-- negative/explicit-feedback signals (not_interested, show_fewer,
-- report_content). Multi-behavior recommender research and the flagship
-- report (§2.2, §5.2) both require a richer action taxonomy so the learning
-- loop can weight engagement by intent strength.
--
-- The expanded vocabulary covers the full marketplace engagement spectrum:
--   view, wishlist, purchase               — original positive signals
--   qualified_detail_view, rapid_skip      — dwell-quality signals
--   save, unsave                           — collection state changes
--   share                                  — social amplification
--   follow_seller, unfollow_seller         — seller affinity
--   open_seller_profile                    — seller discovery intent
--   offer_started, offer_submitted         — negotiation funnel
--   message_seller_started                 — conversation intent
--   add_to_basket, checkout_started        — purchase funnel
--   not_interested, show_fewer             — explicit negative feedback
--   report_content                         — trust & safety signal
--
-- The inline CHECK constraints from migrations 001/002 were auto-named
-- {table}_action_check. Drop and re-add them with the expanded set.

ALTER TABLE interactions
  DROP CONSTRAINT IF EXISTS interactions_action_check;

ALTER TABLE interactions
  ADD CONSTRAINT interactions_action_check
  CHECK (action IN (
    'view', 'wishlist', 'purchase',
    'qualified_detail_view', 'rapid_skip',
    'save', 'unsave', 'share',
    'follow_seller', 'unfollow_seller', 'open_seller_profile',
    'offer_started', 'offer_submitted', 'message_seller_started',
    'add_to_basket', 'checkout_started',
    'not_interested', 'show_fewer', 'report_content'
  ));

ALTER TABLE recommendation_feedback
  DROP CONSTRAINT IF EXISTS recommendation_feedback_action_check;

ALTER TABLE recommendation_feedback
  ADD CONSTRAINT recommendation_feedback_action_check
  CHECK (action IN (
    'view', 'wishlist', 'purchase',
    'qualified_detail_view', 'rapid_skip',
    'save', 'unsave', 'share',
    'follow_seller', 'unfollow_seller', 'open_seller_profile',
    'offer_started', 'offer_submitted', 'message_seller_started',
    'add_to_basket', 'checkout_started',
    'not_interested', 'show_fewer', 'report_content'
  ));
