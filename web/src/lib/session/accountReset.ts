'use client';

/**
 * Account-slice reset — the counterpart to `queryClient.clear()` for the
 * persisted Zustand layer. Every store listed here is account-owned truth
 * (saved lists, follows, boards, drafts, overlays); on a session-identity
 * change — login, logout, expiry, a different account resolving — they
 * must not survive into the next session. Device-level prefs (theme,
 * density, text size, onboarding, recently-viewed, locale) intentionally
 * stay.
 *
 * Called from SessionProvider next to `queryClient.clear()`; pure
 * `setState` writes, safe to call outside React.
 */

import { useStore } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import { useProfileEdit } from '@/lib/store/profileEdit';
import { useCollectionEdits } from '@/lib/store/collectionEdits';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useQuickReplies } from '@/lib/store/quickReplies';
import { useSavedSearches } from '@/lib/store/savedSearches';
import { usePosterArchive } from '@/lib/store/posterArchive';
import { useNotificationCursor } from '@/lib/store/notificationCursor';
import { useOutfits } from '@/lib/store/outfits';
import { useUserPaymentData } from '@/lib/store/userPaymentData';
import { useCoOwnVotes } from '@/lib/store/coownVotes';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useChatPrefs } from '@/lib/store/chatPrefs';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useShopRailPins } from '@/components/profile/shopRailData';
import { useChatDrafts } from '@/components/inbox/useChatDrafts';
import { useInboxSafety } from '@/components/inbox/inboxSafety';
import { useVerificationStore } from '@/components/verification/useVerificationStore';
import { usePayoutStore } from '@/components/wallet/withdraw/usePayoutAccounts';
import { useContactOverlay } from '@/components/settings/useAccountContact';
import { useCoOwnAlerts } from '@/components/coown/alertStore';
import { useFeedPrefs } from '@/lib/feedPrefs';
import { useAlgorithmPrefs } from '@/components/agents/useAlgorithmPrefs';
import { resetAuctionWatchlist } from '@/components/auctions/auctionWatchlist';
import { resetLiveReminders } from '@/components/live/liveReminders';
import { resetPostagePrefs } from '@/components/settings/usePostagePrefs';
import { SELL_DRAFT_STORAGE_KEY } from '@/lib/hooks/sell/useSellDraftPersistence';

/**
 * Wipe every persisted account-owned slice back to its empty state.
 * Slices re-seed from server truth (hydrate*) or stay empty until the new
 * identity writes them.
 */
export function resetAccountSlices(): void {
  // Saved lists / engagement — the sync flags reset too; the new
  // session's hydrate re-arms them.
  useStore.setState({
    wishlist: [],
    saved: [],
    bag: [],
    likedLooks: [],
    savedLooks: [],
    listingBumps: {},
    savedSyncError: null,
    savedListsStale: false,
  });
  useFollows.setState({ followingIds: [] });

  // Self overlays — profile edits, board edits, collab writes.
  useProfileEdit.setState({ overlay: {} });
  useCollectionEdits.setState({ boards: {} });
  useMoodboardEdits.setState({ boards: {}, syncIssues: {} });
  useMoodboardCollab.setState({ boards: {} });
  useBoardPrefs.setState({ boards: {}, recents: [], createdMoodboards: [] });
  useShopRailPins.setState({ pinnedIds: null });
  usePosterArchive.setState({
    removedStoryIds: [],
    archivedStoryIds: [],
    highlights: [],
  });
  useOutfits.setState({ outfits: [] });

  // Inbox + comms.
  useInboxPrefs.setState({ muted: {}, archived: {}, pinned: {}, requests: {} });
  useInboxSafety.setState({ blockedUserIds: [] });
  useChatDrafts.setState({ drafts: {} });
  useChatPrefs.setState({
    whoCanMessage: 'everyone',
    readReceipts: true,
    offersInChat: true,
    orderUpdatesInChat: true,
  });
  useQuickReplies.setState({ replies: [] });
  useNotificationCursor.setState({
    clearedIds: [],
    dismissedIds: [],
    sourceUnreadIds: [],
  });

  // Search, money, commerce overlays.
  useSavedSearches.setState({ searches: [], syncError: null, stale: true });
  useUserPaymentData.setState({
    extraAddresses: [],
    extraPaymentMethods: [],
    removedAddressIds: [],
    removedPaymentMethodIds: [],
    addressOverrides: {},
    defaultAddressId: null,
    defaultPaymentMethodId: null,
  });
  usePayoutStore.setState({
    extraAccounts: [],
    removedSeedIds: [],
    defaultOverride: null,
    sessionRequests: [],
  });
  useContactOverlay.setState({ phone: null });
  useCoOwnVotes.setState({ votes: {} });
  useCoOwnWatchlist.setState({ watchedIds: [] });
  useCoOwnAlerts.setState({ alerts: [] });
  useVerificationStore.setState({
    status: 'not_started',
    submittedAt: null,
    rejectionReason: null,
    record: null,
    dac7: null,
  });

  // Settings prefs — only the identity-bound fields reset (privacy /
  // moderation / security lifecycle). Display + consent prefs are
  // device-level choices; there's no server read to rehydrate them, so
  // wiping on re-login would silently lose them.
  useSettingsPrefs.setState({
    showCloset: true,
    showSaved: true,
    allowMessages: true,
    showActivity: true,
    blockedIds: [],
    restrictedIds: [],
    privateProfile: false,
    searchVisible: true,
    mutedIds: [],
    twoFactorEnabled: false,
    revokedSessionIds: [],
    unlinkedAccountIds: [],
    backupCodes: null,
    backupCodesGeneratedAt: null,
    passwordUpdatedAt: null,
    accountStatus: 'active',
    deactivatedAt: null,
    ageConfirmedAt: null,
  });

  // Feed tuning — hidden/downweighted ids and price ceilings are pushed to
  // /interactions in live mode (account-owned), so they must not bleed
  // into the next account's feed ranking.
  useFeedPrefs.setState({
    hiddenListingIds: [],
    downweightedKeys: [],
    notInterestedReasons: {},
    downweightedSizes: [],
    priceCeilings: [],
    dismissedModuleIds: [],
    moduleImpressions: {},
    moduleEngagements: {},
  });

  // Algorithm tuning — seller/account-level weights, not device display.
  useAlgorithmPrefs.setState({
    topics: [],
    brands: [],
    priceComfort: 120,
    discoveryDial: 45,
  });

  // localStorage-backed account sets (useSyncExternalStore readers) —
  // their module reset helpers clear cache + notify mounted subscribers.
  resetAuctionWatchlist();
  resetLiveReminders();
  resetPostagePrefs();
  // The in-progress sell draft is account work — account B must not be
  // offered account A's half-listed item as a resume banner.
  try {
    window.localStorage.removeItem(SELL_DRAFT_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing persisted to clear */
  }
}
