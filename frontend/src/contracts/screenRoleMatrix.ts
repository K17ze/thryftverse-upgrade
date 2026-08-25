/**
 * Screen Role Matrix — Phase 5 WP8/P5-18
 *
 * Canonical mapping of every screen to its visual role, layout family,
 * and surface budget. This contract ensures no single visual transform
 * is applied across multiple product roles.
 *
 * Usage: import this in screen headers or audit tooling to verify that
 * a screen's implementation matches its declared role.
 *
 * Roles (from Design.md + AGENTS.md §4):
 *   - mediaLed          — Home, product detail, creator canvas
 *   - denseUtilityList  — Settings, inbox, addresses, payment methods
 *   - transactionDecision — Checkout, bid, offer, Co-Own order, payout
 *   - evidence          — Receipts, due diligence, portfolio, documents
 *   - liveMarket        — Auction, Co-Own positions, wallet activity
 *   - creatorCanvas     — Camera, look editor, poster highlight
 *   - personalCollection — Collections, closet, saved items
 *
 * Layout families (from surfaceRadiusRules.ts):
 *   - mediaLed            — Media can meet edges; chrome overlays only
 *   - denseUtilityList    — Flat rows; section headings + whitespace
 *   - transactionDecision — Strong summary; one primary action; sticky dock
 */

import type { LayoutFamily } from '../theme/surfaceRadiusRules';

export type VisualRole =
  | 'mediaLed'
  | 'denseUtilityList'
  | 'transactionDecision'
  | 'evidence'
  | 'liveMarket'
  | 'creatorCanvas'
  | 'personalCollection';

export interface ScreenRoleEntry {
  /** Screen file name (without path). */
  screen: string;
  /** Primary visual role. */
  role: VisualRole;
  /** Layout family from surfaceRadiusRules. */
  layoutFamily: LayoutFamily;
  /** Maximum dominant non-media panels above the fold (default 1). */
  maxDominantPanelsAboveFold: number;
  /** Whether a sticky action dock is expected. */
  hasStickyActionDock: boolean;
  /** Whether media can meet screen edges. */
  mediaMeetsEdges: boolean;
  /** Whether tabular figures are required for numerics. */
  tabularFigures: boolean;
}

/**
 * The canonical screen → role mapping.
 *
 * Screens not listed here should be audited and added. A screen using
 * a role that doesn't match its entry here is a role-matrix violation.
 */
export const SCREEN_ROLE_MATRIX: ScreenRoleEntry[] = [
  // ── Discovery (mediaLed) ──
  { screen: 'HomeScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'BrowseScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'CategoryDetailScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'GlobalSearchScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'GalleriaScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },

  // ── Product detail (mediaLed + evidence) ──
  { screen: 'ItemDetailScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: true },
  { screen: 'AssetDetailScreen', role: 'evidence', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: true },
  { screen: 'AuctionDetailScreen', role: 'liveMarket', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: true },

  // ── Creator canvas ──
  { screen: 'CreatePosterHighlightScreen', role: 'creatorCanvas', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'PosterViewerScreen', role: 'creatorCanvas', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },

  // ── Transaction / decision ──
  { screen: 'CheckoutScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'MakeOfferScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'BuyoutScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'TradeConfirmScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'WithdrawScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'WalletConvertScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },

  // ── Evidence / documents ──
  { screen: 'OrderReceiptScreen', role: 'evidence', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'OrderDetailScreen', role: 'evidence', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'AssetDueDiligenceScreen', role: 'evidence', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'CoOwnTaxDocumentsScreen', role: 'evidence', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'PortfolioScreen', role: 'evidence', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },

  // ── Live market ──
  { screen: 'WalletScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'WalletActivityScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'BalanceHistoryScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'SellerEarningsScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'AuctionsScreen', role: 'liveMarket', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: true },
  { screen: 'AssetLeaderboardScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'MarketLedgerScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },

  // ── Personal collection ──
  { screen: 'ClosetScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'CollectionDetailScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'ExploreCollectionScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'MoodboardHomeScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },

  // ── Dense utility list (settings, inbox, management) ──
  { screen: 'InboxScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'MessageRequestsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'NotificationsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'ChatScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'GroupChatScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'SettingsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'AccountSettingsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'BlockedUsersScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'ManageQuickRepliesScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'AddressFormScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'AddBankAccountScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'ReportScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'ResolutionCentreScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },

  // ── Sell / listing management ──
  { screen: 'SellScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'EditListingScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'ManageListingScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'ListingPreviewScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: true },
  { screen: 'InventoryManagementScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },

  // ── Seller hub (liveMarket + denseUtilityList) ──
  { screen: 'SellerHubScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'SellerAnalyticsScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'SellerEarningsScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'SellerFulfilmentScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'SellerAuctionCentreScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'MyListingsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'MyOrdersScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'MyBidsScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },

  // ── Profile & social (personalCollection + denseUtilityList) ──
  { screen: 'MyProfileScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'UserProfileScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'EditProfileScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'FollowersScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'FollowingScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },

  // ── Group management (denseUtilityList) ──
  { screen: 'CreateGroupChatScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'GroupChatInfoScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'GroupMembersScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'EditGroupScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'NewMessageScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },

  // ── Notifications & preferences (denseUtilityList) ──
  { screen: 'NotificationPreferencesScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'PushNotificationsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'EmailNotificationsScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },

  // ── Trade & syndicate (transactionDecision + liveMarket) ──
  { screen: 'TradeHubScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'TradeScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'SyndicateHubScreen', role: 'liveMarket', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
  { screen: 'CreateSyndicateScreen', role: 'transactionDecision', layoutFamily: 'transactionDecision', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: false, tabularFigures: true },

  // ── Auth & onboarding (denseUtilityList) ──
  { screen: 'LoginScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'SignUpScreen', role: 'denseUtilityList', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: false },
  { screen: 'OnboardingScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'AuthLandingScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },

  // ── Look & poster detail (mediaLed) ──
  { screen: 'LookDetailScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 1, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'PosterArchiveScreen', role: 'personalCollection', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'PosterHighlightViewerScreen', role: 'creatorCanvas', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },

  // ── Live shopping (liveMarket + mediaLed) ──
  { screen: 'LiveShoppingHomeScreen', role: 'liveMarket', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: false, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'LiveStreamViewerScreen', role: 'mediaLed', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: false },
  { screen: 'LiveStreamSellerScreen', role: 'creatorCanvas', layoutFamily: 'mediaLed', maxDominantPanelsAboveFold: 0, hasStickyActionDock: true, mediaMeetsEdges: true, tabularFigures: false },

  // ── Creator analytics (evidence) ──
  { screen: 'CreatorAnalyticsDashboardScreen', role: 'evidence', layoutFamily: 'denseUtilityList', maxDominantPanelsAboveFold: 1, hasStickyActionDock: false, mediaMeetsEdges: false, tabularFigures: true },
];

/**
 * Look up the role entry for a screen by file name.
 */
export function getScreenRole(screenFileName: string): ScreenRoleEntry | undefined {
  return SCREEN_ROLE_MATRIX.find((entry) => entry.screen === screenFileName);
}

/**
 * Validate that a screen's implementation matches its declared role.
 * Returns violations as an array of strings (empty = no violations).
 *
 * This is a documentation-time audit tool, not a runtime check.
 */
export function auditScreenRole(
  screenFileName: string,
  observed: {
    dominantPanelCount: number;
    hasStickyDock: boolean;
    mediaMeetsEdges: boolean;
    usesTabularFigures: boolean;
  },
): string[] {
  const entry = getScreenRole(screenFileName);
  if (!entry) {
    return [`Screen "${screenFileName}" is not registered in SCREEN_ROLE_MATRIX`];
  }

  const violations: string[] = [];
  if (observed.dominantPanelCount > entry.maxDominantPanelsAboveFold) {
    violations.push(
      `Too many dominant panels: ${observed.dominantPanelCount} > ${entry.maxDominantPanelsAboveFold}`,
    );
  }
  if (entry.hasStickyActionDock && !observed.hasStickyDock) {
    violations.push('Missing required sticky action dock');
  }
  if (!entry.mediaMeetsEdges && observed.mediaMeetsEdges) {
    violations.push('Media should not meet edges for this role');
  }
  if (entry.tabularFigures && !observed.usesTabularFigures) {
    violations.push('Tabular figures required for numerics in this role');
  }
  return violations;
}
