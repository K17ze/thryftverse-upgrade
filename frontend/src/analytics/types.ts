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
 *   `push_notification_received`, `deep_link_opened`
 * - **Experiments**: `feature_flag_evaluated`
 * - **Sharing**: `share_initiated`, `share_completed`
 * - **Live shopping**: `live_stream_viewed`, `live_stream_joined`,
 *   `live_bid_placed`
 * - **Looks & moodboards**: `look_created`, `look_viewed`,
 *   `moodboard_created`, `collection_created`
 * - **Trust & safety**: `review_written`, `report_submitted`
 * - **Screen capture**: `screenshot_taken`
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
  | 'purchase_completed'
  | 'listing_created'
  | 'listing_published'
  | 'offer_submitted'
  | 'user_signed_up'
  | 'user_logged_in'
  | 'user_logged_out'
  | 'profile_viewed'
  | 'seller_dashboard_viewed'
  | 'follow_toggled'
  | 'message_sent'
  | 'voice_message_sent'
  | 'wallet_viewed'
  | 'withdrawal_initiated'
  | 'biometric_login_attempted'
  | 'biometric_login_success'
  | 'biometric_login_cancelled'
  | 'onboarding_completed'
  | 'age_verification_completed'
  | 'push_notification_tapped'
  | 'push_notification_received'
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
  | 'report_submitted'
  | 'screenshot_taken'
  | 'coown_trade_started'
  | 'coown_order_placed'
  | 'coown_order_filled'
  | 'coown_buyout_offered';

// ──────────────────────────────────────────────────────────────────────────
// Event properties — mapped type linking event names to property shapes.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Properties attached to a `screenshot_taken` event.
 *
 * - `screen` — the route name of the screen that was active when the
 *   screenshot was taken, or `'unknown'` when the navigator was not ready.
 *   Enables funnel analysis without recording PII.
 */
export interface ScreenshotTakenProperties {
  screen: string;
}

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

export interface ItemViewedProperties {
  listing_id: string;
  seller_id: string;
  price: number | null;
}

export interface ItemFavoritedProperties {
  listing_id: string;
  action: 'save' | 'unsave';
}

export interface ItemSharedProperties {
  listing_id: string;
  platform: string;
}

export interface SearchPerformedProperties {
  query: string;
  result_count: number;
}

export interface SearchResultTappedProperties {
  listing_id: string;
  query: string;
  position: number;
}

export interface FilterAppliedProperties {
  filter_name: string;
  filter_value: string | number | boolean;
}

export interface AuctionBidPlacedProperties {
  auction_id: string;
  bid_amount: number;
}

export interface AuctionViewedProperties {
  auction_id: string;
}

export interface OrderPlacedProperties {
  order_id: string;
  item_id: string;
  total: number;
}

export interface OrderCompletedProperties {
  order_id: string;
  total: number;
}

export interface CheckoutStartedProperties {
  item_id: string;
  total: number;
}

export interface CheckoutAbandonedProperties {
  item_id: string;
  stage: string;
}

export interface PurchaseCompletedProperties {
  item_id: string;
  total: number;
  payment_method: string;
}

export interface ListingCreatedProperties {
  category: string;
  price_range: 'low' | 'mid' | 'high' | 'premium';
}

export interface ListingPublishedProperties {
  listing_id: string;
}

export interface OfferSubmittedProperties {
  item_id: string;
  offer_amount: number;
}

export interface UserSignedUpProperties {
  method: 'google' | 'apple' | 'email';
}

export interface UserLoggedInProperties {
  method: 'google' | 'apple' | 'email' | 'passkey' | 'magic_link';
}

export interface UserLoggedOutProperties {
  method?: string;
}

export interface ProfileViewedProperties {
  user_id: string;
}

export interface SellerDashboardViewedProperties {}

export interface FollowToggledProperties {
  user_id: string;
  action: 'follow' | 'unfollow';
}

export interface MessageSentProperties {
  conversation_id: string;
  message_type: 'text' | 'image' | 'video';
}

export interface VoiceMessageSentProperties {
  conversation_id: string;
  duration_seconds: number;
}

export interface WalletViewedProperties {}

export interface WithdrawalInitiatedProperties {
  amount: number;
  currency: string;
}

export interface BiometricLoginAttemptedProperties {}

export interface BiometricLoginSuccessProperties {}

export interface BiometricLoginCancelledProperties {}

export interface OnboardingCompletedProperties {}

export interface AgeVerificationCompletedProperties {
  method: string;
}

export interface PushNotificationTappedProperties {
  notification_type: string | null;
  target_screen: string | null;
  action_id: string | null;
}

export interface PushNotificationReceivedProperties {
  notification_type: string | null;
}

export interface DeepLinkOpenedProperties {
  url: string;
  source: string | null;
}

export interface FeatureFlagEvaluatedProperties {
  flag_key: string;
  variant: string | boolean | undefined;
  enabled: boolean;
  reason: 'bootstrap' | 'network';
}

export interface ShareInitiatedProperties {
  platform: string;
  content_type: string;
}

export interface ShareCompletedProperties {
  platform: string;
  content_type: string;
  outcome: 'success' | 'cancelled' | 'error';
}

export interface LiveStreamViewedProperties {
  stream_id: string;
}

export interface LiveStreamJoinedProperties {
  stream_id: string;
}

export interface LiveBidPlacedProperties {
  stream_id: string;
  bid_amount: number;
}

export interface LookCreatedProperties {
  look_id: string;
}

export interface LookViewedProperties {
  look_id: string;
}

export interface MoodboardCreatedProperties {
  moodboard_id: string;
}

export interface CollectionCreatedProperties {
  collection_id: string;
}

export interface ReviewWrittenProperties {
  seller_id: string;
  rating: number;
}

export interface ReportSubmittedProperties {
  target_id: string;
  reason: string;
}

export interface CoOwnTradeStartedProperties {
  asset_id: string;
  side: 'buy' | 'sell';
}

export interface CoOwnOrderPlacedProperties {
  asset_id: string;
  side: 'buy' | 'sell';
  units: number;
  price_gbp: number;
}

export interface CoOwnOrderFilledProperties {
  asset_id: string;
  order_id: string;
  units: number;
  price_gbp: number;
}

export interface CoOwnBuyoutOfferedProperties {
  asset_id: string;
  offer_gbp: number;
}

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
  item_viewed: ItemViewedProperties;
  item_favorited: ItemFavoritedProperties;
  item_shared: ItemSharedProperties;
  search_performed: SearchPerformedProperties;
  search_result_tapped: SearchResultTappedProperties;
  filter_applied: FilterAppliedProperties;
  auction_bid_placed: AuctionBidPlacedProperties;
  auction_viewed: AuctionViewedProperties;
  order_placed: OrderPlacedProperties;
  order_completed: OrderCompletedProperties;
  checkout_started: CheckoutStartedProperties;
  checkout_abandoned: CheckoutAbandonedProperties;
  purchase_completed: PurchaseCompletedProperties;
  listing_created: ListingCreatedProperties;
  listing_published: ListingPublishedProperties;
  offer_submitted: OfferSubmittedProperties;
  user_signed_up: UserSignedUpProperties;
  user_logged_in: UserLoggedInProperties;
  user_logged_out: UserLoggedOutProperties;
  profile_viewed: ProfileViewedProperties;
  seller_dashboard_viewed: SellerDashboardViewedProperties;
  follow_toggled: FollowToggledProperties;
  message_sent: MessageSentProperties;
  voice_message_sent: VoiceMessageSentProperties;
  wallet_viewed: WalletViewedProperties;
  withdrawal_initiated: WithdrawalInitiatedProperties;
  biometric_login_attempted: BiometricLoginAttemptedProperties;
  biometric_login_success: BiometricLoginSuccessProperties;
  biometric_login_cancelled: BiometricLoginCancelledProperties;
  onboarding_completed: OnboardingCompletedProperties;
  age_verification_completed: AgeVerificationCompletedProperties;
  push_notification_tapped: PushNotificationTappedProperties;
  push_notification_received: PushNotificationReceivedProperties;
  deep_link_opened: DeepLinkOpenedProperties;
  feature_flag_evaluated: FeatureFlagEvaluatedProperties;
  share_initiated: ShareInitiatedProperties;
  share_completed: ShareCompletedProperties;
  live_stream_viewed: LiveStreamViewedProperties;
  live_stream_joined: LiveStreamJoinedProperties;
  live_bid_placed: LiveBidPlacedProperties;
  look_created: LookCreatedProperties;
  look_viewed: LookViewedProperties;
  moodboard_created: MoodboardCreatedProperties;
  collection_created: CollectionCreatedProperties;
  review_written: ReviewWrittenProperties;
  report_submitted: ReportSubmittedProperties;
  screenshot_taken: ScreenshotTakenProperties;
  coown_trade_started: CoOwnTradeStartedProperties;
  coown_order_placed: CoOwnOrderPlacedProperties;
  coown_order_filled: CoOwnOrderFilledProperties;
  coown_buyout_offered: CoOwnBuyoutOfferedProperties;
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
