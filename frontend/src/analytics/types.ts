/**
 * Analytics type definitions for ThryftVerse.
 *
 * This module is the single source of truth for event names, feature flag
 * keys, and the property shapes that accompany each event. Every analytics
 * call in the app should import types from here — never construct ad-hoc
 * event names or property objects.
 *
 * The `EventProperties` mapped type links each `EventName` to its specific
 * properties type, giving compile-time safety: `track('item_viewed', {...})`
 * will only accept properties that match the `item_viewed` shape.
 */

// ──────────────────────────────────────────────────────────────────────────
// Feature flag keys — every flag the app evaluates must be listed here.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Union of all feature flag keys used by ThryftVerse.
 *
 * Keeping this as an explicit union (rather than `string`) gives two
 * guarantees:
 * 1. `useFeatureFlag('typo_key')` is a compile error, not a silent false.
 * 2. Searching this type shows every flag the app depends on — useful for
 *    auditing flag usage before removing one from PostHog.
 *
 * To add a new flag, append it to this union. No other change is needed —
 * `useFeatureFlag`, `useFeatureFlagVariant`, and `useFeatureFlagPayload`
 * all accept `FeatureFlagKey` and will pick up the new key automatically.
 */
export type FeatureFlagKey =
  | 'new_home_feed'
  | 'live_shopping_enabled'
  | 'co_own_v2'
  | 'ai_listing_assist'
  | 'moodboard_beta'
  | 'conversational_search'
  | 'advanced_filters'
  | 'seller_analytics_v2';

// ──────────────────────────────────────────────────────────────────────────
// Screen view properties — shared by useScreenTracking and trackScreenChange.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Properties attached to every `screen_view` event.
 *
 * - `screen` — the route name of the screen the user navigated to.
 * - `previous_screen` — the route name the user came from, or `null` for
 *   the first screen of the session. Enables flow analysis
 *   ("what screen do users come from before checkout?").
 * - `params` — sanitised route params (PII stripped, only string/number
 *   values). See `useScreenTracking.ts` for the sanitisation logic.
 */
export interface ScreenViewProperties {
  screen: string;
  previous_screen: string | null;
  params: Record<string, string | number>;
}

// ──────────────────────────────────────────────────────────────────────────
// Event names — the full analytics event catalogue for the marketplace.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Union of all analytics event names captured by ThryftVerse.
 *
 * Events are grouped by surface:
 *
 * - **Navigation**: `screen_view`
 * - **Item engagement**: `item_viewed`, `item_favorited`, `item_shared`
 * - **Search & discovery**: `search_performed`, `search_result_tapped`,
 *   `filter_applied`
 * - **Auctions**: `auction_bid_placed`, `auction_viewed`
 * - **Commerce**: `order_placed`, `order_completed`, `checkout_started`,
 *   `checkout_abandoned`
 * - **Selling**: `listing_created`, `listing_published`
 * - **Account**: `user_signed_up`, `user_logged_in`, `user_logged_out`,
 *   `profile_viewed`, `follow_toggled`
 * - **Messaging**: `message_sent`, `voice_message_sent`
 * - **Wallet**: `wallet_viewed`, `withdrawal_initiated`
 * - **Security**: `biometric_login_attempted`, `biometric_login_success`
 * - **Onboarding**: `onboarding_completed`, `age_verification_completed`
 * - **Notifications & deep links**: `push_notification_tapped`,
 *   `deep_link_opened`
 * - **Experiments**: `feature_flag_evaluated`
 * - **Sharing**: `share_initiated`, `share_completed`
 * - **Live shopping**: `live_stream_viewed`, `live_stream_joined`,
 *   `live_bid_placed`
 * - **Looks & moodboards**: `look_created`, `look_viewed`,
 *   `moodboard_created`, `collection_created`
 * - **Trust & safety**: `review_written`, `report_submitted`
 *
 * To add a new event, append it to this union and optionally add a
 * specific properties type in `EventProperties` below.
 */
export type EventName =
  | 'screen_view'
  | 'item_viewed'
  | 'item_favorited'
  | 'item_shared'
  | 'search_performed'
  | 'search_result_tapped'
  | 'filter_applied'
  | 'auction_bid_placed'
  | 'auction_viewed'
  | 'order_placed'
  | 'order_completed'
  | 'checkout_started'
  | 'checkout_abandoned'
  | 'listing_created'
  | 'listing_published'
  | 'user_signed_up'
  | 'user_logged_in'
  | 'user_logged_out'
  | 'profile_viewed'
  | 'follow_toggled'
  | 'message_sent'
  | 'voice_message_sent'
  | 'wallet_viewed'
  | 'withdrawal_initiated'
  | 'biometric_login_attempted'
  | 'biometric_login_success'
  | 'onboarding_completed'
  | 'age_verification_completed'
  | 'push_notification_tapped'
  | 'deep_link_opened'
  | 'feature_flag_evaluated'
  | 'share_initiated'
  | 'share_completed'
  | 'live_stream_viewed'
  | 'live_stream_joined'
  | 'live_bid_placed'
  | 'look_created'
  | 'look_viewed'
  | 'moodboard_created'
  | 'collection_created'
  | 'review_written'
  | 'report_submitted';

// ──────────────────────────────────────────────────────────────────────────
// Event properties — mapped type linking event names to property shapes.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Base property value type for analytics events.
 *
 * Only JSON-serialisable primitives are allowed. Objects and arrays are
 * excluded to prevent accidental PII leakage through nested structures —
 * the same policy enforced by the route-param sanitiser in
 * `useScreenTracking.ts`.
 */
type EventPropertyValue = string | number | boolean | null | undefined;

/**
 * Default property bag for events that don't have a specific shape defined
 * in the `EventProperties` mapped type. This keeps tracking flexible —
 * new events can be captured without a type update — while still giving
 * compile-time safety for events that do have a known shape.
 */
type DefaultEventProperties = Record<string, EventPropertyValue>;

/**
 * Maps each `EventName` to the properties type that should accompany it.
 *
 * The mapped type pattern gives per-event type safety:
 * ```ts
 * track('screen_view', { screen: 'Home', previous_screen: null, params: {} });
 * //                                              ✅ correct shape
 * track('screen_view', { foo: 'bar' });
 * //                       ❌ Type error — missing required fields
 * ```
 *
 * Events not explicitly listed fall through to `DefaultEventProperties`,
 * which accepts any `Record<string, EventPropertyValue>`. To tighten an
 * event's properties, add a specific interface here and map it:
 *
 * ```ts
 * interface ItemViewedProperties {
 *   listing_id: string;
 *   seller_id: string;
 *   price: number;
 * }
 *
 * export type EventProperties = {
 *   screen_view: ScreenViewProperties;
 *   item_viewed: ItemViewedProperties;
 *   // ...other events fall through to the default
 * };
 * ```
 */
export type EventProperties = {
  screen_view: ScreenViewProperties;
};

// ──────────────────────────────────────────────────────────────────────────
// User identity — passed to identifyUser() on login.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Identifying information for a logged-in user.
 *
 * - `id` — the user's unique identifier (PostHog distinct ID). Required.
 * - `email` — used for person profile enrichment and cross-device
 *   identification. Optional to support users who signed up without email.
 * - `username` — display name, set as a person property for segmentation.
 * - `plan` — subscription tier (`'free'`, `'pro'`, `'business'`), used for
 *   cohort analysis and feature-gating dashboards.
 */
export interface UserIdentity {
  id: string;
  email?: string;
  username?: string;
  plan?: string;
}
