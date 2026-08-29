import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Poster } from '../data/posters';
import type { AuctionMarketItem, AuctionViewModel, CoOwnAsset } from '../data/tradeHub';
import type { ChatBot, Conversation, Message as ConversationMessage, ConversationBotDeployment } from '../domain';
import type { ListingCondition } from '../contracts/taxonomy';
import { MOCK_CHAT_BOTS, MOCK_CONVERSATIONS } from '../data/mockData';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';
import { makeStableId } from '../utils/createStableId';
import { setSentryUser } from '../platform/monitoring/sentry';
import { identifyUser, resetIdentity } from '../analytics';
import { appStorage } from '../storage/mmkv';
import { updateUserAccountPreferences, updateUserPostagePreferences, fetchPostagePreferences, updateUserPersonalisation, updateChatPrivacy } from '../services/accountApi';
import { addToCoOwnWatchlist, removeFromCoOwnWatchlist } from '../services/marketApi';
import {
  fetchSystemBotsFromApi,
  fetchCustomBotsFromApi,
  createCustomBotOnApi,
  updateCustomBotOnApi,
  deleteCustomBotOnApi,
  fetchConversationDeploymentsFromApi,
  publishBotFromApi,
  fetchBotVersionsFromApi,
  rollbackBotFromApi,
  fetchConnectionsFromApi,
  createConnectionFromApi,
  deleteConnectionFromApi,
  reverifyConnectionFromApi,
  fetchAgentRunsFromApi,
  cancelAgentRunFromApi,
  fetchPendingApprovalsFromApi,
  approveRequestFromApi,
  rejectRequestFromApi,
  runPlaygroundFromApi,
  type ProviderConnectionInfo,
  type AgentRunInfo,
  type ApprovalRequestInfo,
  type PlaygroundResult,
} from '../services/botsApi';
import {
  fetchChatBotsFromApi,
  fetchQuickRepliesFromApi,
  createQuickReplyOnApi,
  updateQuickReplyOnApi,
  deleteQuickReplyOnApi,
  muteConversationOnApi,
  unmuteConversationOnApi,
  archiveConversationOnApi,
  unarchiveConversationOnApi,
  acceptMessageRequestOnApi,
  declineMessageRequestOnApi,
  addMessageReactionOnApi,
  removeMessageReactionOnApi,
} from '../services/chatApi';
import { fetchJson } from '../lib/apiClient';
import { fetchMyProfile as fetchMyProfileFromApi } from '../services/profileApi';
import {
  createSupportTicket as createSupportTicketOnApi,
  listSupportTickets as listSupportTicketsFromApi,
  listSupportTicketsForOrder as listSupportTicketsForOrderFromApi,
  updateSupportTicketStatus as updateSupportTicketStatusOnApi,
} from '../services/supportApi';
import {
  createCollection as createCollectionOnApi,
  listCollections as listCollectionsFromApi,
  getCollection as getCollectionFromApi,
  addListingToCollection as addListingToCollectionOnApi,
  removeListingFromCollection as removeListingFromCollectionOnApi,
  updateCollection as updateCollectionOnApi,
  deleteCollectionOnApi,
} from '../services/collectionsApi';

export interface User {
  id: string;
  username: string;
  avatar: string | null;
  handle?: string;
  coverPhoto?: string | null;
  coverVideo?: string | null;
  bio?: string | null;
  location?: string | null;
  gender?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  displayName?: string | null;
  birthday?: string;
  role?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  rating?: number;
  reviewCount?: number;
  isVerified?: boolean;
  /** Identity/KYC verification — separate from email verification. */
  identityVerified?: boolean;
  /** Seller standards verification — separate from email/identity. */
  sellerVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Quick reply — a reusable message with a separate shortcut title.
 * The title is shown as the chip label; the message is inserted into the composer.
 */
export interface QuickReply {
  id: string;
  title: string;
  message: string;
}

interface ProfileMediaOverride {
  avatar: string | null;
  cover: string | null;
}

export interface ListingPublicationRecovery {
  clientPublicationId: string;
  mode: 'sell_now' | 'auction';
  stage:
    | 'validating'
    | 'uploading_media'
    | 'creating_listing'
    | 'attaching_media'
    | 'finalising'
    | 'completed'
    | 'failed_recoverable';
  listingId?: string;
  uploadedMediaByAssetId: Record<string, string>;
  uploadedFinalizationByAssetId?: Record<string, string>;
  attachedAssetIds: string[];
  lastError?: string;
}

interface DraftListing {
  categoryId?: string;
  subcategoryId?: string;
  brand?: string;
  size?: string;
  condition?: string;
  title?: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  photos?: string[];
  mediaDraftItems?: import('../utils/mediaUploadAsset').ListingMediaDraftItem[];
  tags?: string[];
  listingMode?: 'sell_now' | 'co_own' | 'auction';
  shippingMethod?: 'standard' | 'express' | null;
  shippingPayer?: 'buyer' | 'seller' | null;
  startingBid?: string;
  reservePrice?: string;
  auctionDurationHours?: number;
  coOwnEnabled?: boolean;
  shareCountInput?: string;
  sharePriceInput?: string;
  offeringWindowHours?: number;
  authPhotos?: string[];
  publicationRecovery?: ListingPublicationRecovery;
}

export interface UserLook {
  id: string;
  title: string;
  coverImage: string;
  items: { id: string; label: string; x: number; y: number }[];
  creator: { name: string; avatar?: string };
  likes: number;
  comments: number;
  createdAt: number;
}

interface CreateGroupConversationInput {
  title: string;
  memberIds: string[];
  creatorId?: string;
}

export type BrowseSortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low' | 'Most liked' | 'Ending soon';
type BrowseConditionOption = 'Any' | ListingCondition;

interface BrowseFilterState {
  query: string;
  sort: BrowseSortOption;
  brands: string[];
  sizes: string[];
  condition: BrowseConditionOption;
  /** Client-side filter: only show items with an estimated A/B sustainability grade. */
  sustainableOnly: boolean;
  /** Price range filter in GBP. null means no constraint on that bound. */
  priceMin: number | null;
  priceMax: number | null;
}

interface SavedSearch {
  id: string;
  query: string;
  filters: {
    brands: string[];
    sizes: string[];
    condition: BrowseConditionOption;
    sort: BrowseSortOption;
    minPrice?: number;
    maxPrice?: number;
    category?: string;
  };
  alertsEnabled: boolean;
  createdAt: string;
  lastCheckedAt?: string;
  lastMatchCount?: number;
}

export interface SupportTicket {
  id: string;
  orderId: string;
  topicId: string;
  topicLabel: string;
  details: string;
  status: 'open' | 'resolved' | 'closed';
  evidenceMediaUrls?: string[];
  createdAt: number;
  updatedAt: number;
}

// Global address format supporting all countries
interface SavedAddress {
  id?: number;
  name: string;
  // Address lines (Line 1, Line 2 for apartments/suites)
  streetAddress: string; // Primary street address
  apartment?: string;    // Apartment, suite, unit, floor, etc.
  // Location hierarchy
  city: string;        // City / Town / Village
  region?: string;      // State (US), Province (CA), County (UK), Prefecture (JP), etc.
  postalCode: string;  // ZIP (US), Postcode (UK), PIN (IN), etc.
  countryCode: string;   // ISO 3166-1 alpha-2 (e.g., 'US', 'GB', 'IN', 'JP')
  country: string;       // Display name (e.g., 'United States', 'United Kingdom')
  isDefault?: boolean;
}

interface SavedPaymentMethod {
  id?: number;
  type: 'card' | 'bank_account' | 'apple_pay' | 'google_pay';
  label: string;
  details?: string;
  isDefault?: boolean;
}

interface CoOwnComplianceProfile {
  countryCode: string;
  kycVerified: boolean;
  riskDisclosureAccepted: boolean;
  stableCoinWalletConnected: boolean;
  educationCompleted: boolean;
  dac7Completed?: boolean;
  dac7Tin?: string;
  dac7Country?: string;
}

type CoOwnEligibilityResult = {
  ok: boolean;
  message?: string;
};

type TradeActionResult = {
  ok: boolean;
  message?: string;
  deliveryTriggered?: boolean;
  deliveryListingId?: string;
};

interface AccountPreferences {
  holidayMode: boolean;
  privateProfile: boolean;
}

interface PaymentPreferences {
  useBalance: boolean;
}

interface PostagePreferences {
  carrierKey: string;
  freeShipping: boolean;
  bundleDiscount: boolean;
}

interface PersonalisationPreferences {
  genderFilter: string[];
  categoriesAndSizesPref: string;
  brandsPref: string;
  membersPref: string;
}

interface AuctionRuntimeState {
  currentBid: number;
  bidCount: number;
  lastBidderId?: string;
  winnerUserId?: string;
  closedAtMs?: number;
  closedReason?: 'buy-now' | 'expired';
  settled?: boolean;
  /**
   * Anti-sniping: when a bid is placed within the extension window (last 5
   * minutes), the auction end is extended. This stores the extended end
   * timestamp (ms since epoch) so the countdown logic can use it instead of
   * the original `endsAt`. Null/undefined means no extension has been applied.
   */
  extendedEndMs?: number;
}

interface CoOwnRuntimeState {
  availableUnits: number;
  holders: number;
  volume24hGBP: number;
  yourUnits: number;
  unitPriceGBP: number;
  unitPriceStable: number;
  marketMovePct24h: number;
  referencePriceGBP: number;
  avgEntryPriceGBP: number;
  realizedProfitGBP: number;
}

interface MarketLedgerEntry {
  id: string;
  timestamp: string;
  channel: 'auction' | 'co-own';
  action: 'bid' | 'win' | 'buy-units' | 'sell-units';
  referenceId: string;
  amountGBP: number;
  units?: number;
  note?: string;
}

const makeLedgerEntry = (
  entry: Omit<MarketLedgerEntry, 'id' | 'timestamp'>
): MarketLedgerEntry => ({
  ...entry,
  id: makeStableId('ml'),
  timestamp: new Date().toISOString(),
});

// Anti-sniping (pop-bidding) constants — when a bid is placed within the
// extension window of the auction end, the end time is extended to give
// other bidders a fair chance to respond. This is standard practice on
// eBay, Catawiki, and other flagship auction platforms.
const ANTI_SNIPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes before end
const ANTI_SNIPE_EXTENSION_MS = 5 * 60 * 1000; // extend by 5 minutes

// P0.12: Derive the per-user conversation state arrays (muted / archived /
// pending message requests) from the hydrated conversation objects. The
// backend now returns `isMuted`, `isArchived` and `requestStatus` on each
// conversation, so these arrays are projections of the canonical state
// rather than independently-maintained local lists.
function deriveConversationStateArrays(conversations: Conversation[]) {
  return {
    mutedConversationIds: conversations
      .filter((c) => c.isMuted === true)
      .map((c) => c.id),
    archivedConversationIds: conversations
      .filter((c) => c.isArchived === true)
      .map((c) => c.id),
    messageRequests: conversations
      .filter((c) => c.requestStatus === 'pending')
      .map((c) => c.id),
  };
}

async function persistLocalAuthSnapshot(
  currentUser: User | null,
  twoFactorEnabled: boolean
) {
  try {
    const {
      clearStoredAuthSnapshot,
      setStoredAuthSnapshot,
    } = await import('../preferences/authSnapshot');

    if (!currentUser) {
      await clearStoredAuthSnapshot();
      return;
    }

    await setStoredAuthSnapshot({
      user: currentUser,
      twoFactorEnabled,
    });
  } catch {
    // Best-effort persistence should not block local state updates.
  }
}

// Collection for organizing saved items (like Pinterest boards)
export interface Collection {
  id: string;
  name: string;
  description?: string | null;
  itemIds: string[];
  coverImage?: string;
  isPrivate?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Outfit {
  id: string;
  name: string;
  itemIds: string[];
  backgroundColor?: string;
  createdAt: number;
  updatedAt: number;
}

interface StoreState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUserProfile: (updates: Partial<User>) => void;
  fetchMyProfile: () => Promise<void>;
  /**
   * When true, the app has restored an auth snapshot from SecureStore but is
   * waiting for the user to pass biometric authentication before revealing the
   * main app. The BiometricLogin screen clears this flag on success; on
   * failure/cancel it calls logout() which also clears it.
   */
  biometricLoginPending: boolean;
  setBiometricLoginPending: (value: boolean) => void;

  // General app onboarding — first-launch gate.
  // The authoritative check lives in AsyncStorage (@thryftverse_onboarding_complete)
  // via OnboardingScreen.isOnboardingComplete; this flag mirrors it for in-app
  // access (e.g. Settings reset) and is persisted so returning users skip it.
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;

  // Global Interactions
  wishlist: string[]; // array of string item IDs
  toggleWishlist: (id: string) => void;
  isWishlisted: (id: string) => boolean;
  savedProducts: string[];
  toggleSavedProduct: (id: string) => void;
  isSavedProduct: (id: string) => boolean;
  // Collections (replaces simple saved)
  collections: Collection[];
  createCollection: (name: string, description?: string, isPrivate?: boolean) => string;
  createCollectionOnApi: (name: string, description?: string, isPrivate?: boolean) => Promise<string>;
  loadCollectionsFromApi: () => Promise<void>;
  deleteCollection: (id: string) => void;
  deleteCollectionOnApi: (id: string) => Promise<void>;
  renameCollection: (id: string, name: string) => void;
  reorderCollections: (fromIndex: number, toIndex: number) => void;
  updateCollectionOnApi: (id: string, fields: { name?: string; description?: string | null; isPrivate?: boolean }) => Promise<void>;
  addToCollection: (collectionId: string, itemId: string) => void;
  addToCollectionOnApi: (collectionId: string, itemId: string) => Promise<void>;
  removeFromCollection: (collectionId: string, itemId: string) => void;
  removeFromCollectionOnApi: (collectionId: string, itemId: string) => Promise<void>;
  isInCollection: (collectionId: string, itemId: string) => boolean;
  isItemSavedAnywhere: (itemId: string) => boolean;
  getItemCollections: (itemId: string) => Collection[];
  seenPosterIds: string[];
  markPosterSeen: (posterId: string) => void;
  hasSeenPoster: (posterId: string) => boolean;
  savedPosterStoryIds: string[];
  toggleSavedPosterStory: (storyId: string) => void;
  isSavedPosterStory: (storyId: string) => boolean;
  customPosters: Poster[];
  addPoster: (poster: Poster) => void;
  removePoster: (posterId: string) => void;
  customAuctions: AuctionMarketItem[];
  addAuction: (auction: AuctionMarketItem) => void;
  auctionRuntime: Record<string, AuctionRuntimeState>;
  placeAuctionBid: (auction: AuctionViewModel, bidderId: string, amount: number) => TradeActionResult;
  buyNowAuction: (auction: AuctionViewModel, buyerId: string) => TradeActionResult;
  settleExpiredAuctions: (auctions: AuctionViewModel[]) => void;
  customCoOwns: CoOwnAsset[];
  addCoOwn: (asset: CoOwnAsset) => void;
  coOwnRuntime: Record<string, CoOwnRuntimeState>;
  coOwnCompliance: CoOwnComplianceProfile;
  updateCoOwnCompliance: (updates: Partial<CoOwnComplianceProfile>) => void;
  checkCoOwnEligibility: (settlementMode?: 'ONEZE') => CoOwnEligibilityResult;
  buyCoOwnUnits: (asset: CoOwnAsset, buyerId: string, units: number) => TradeActionResult;
  sellCoOwnUnits: (asset: CoOwnAsset, sellerId: string, units: number) => TradeActionResult;
  marketLedger: MarketLedgerEntry[];

  // Co-Own asset watchlist
  coOwnWatchlist: string[];
  toggleCoOwnWatch: (assetId: string) => void;
  isCoOwnWatched: (assetId: string) => boolean;

  // Browse filters/search
  browseFilters: BrowseFilterState;
  updateBrowseFilters: (updates: Partial<BrowseFilterState>) => void;
  resetBrowseFilters: () => void;

  // Saved searches with alerts
  savedSearches: SavedSearch[];
  addSavedSearch: (search: Omit<SavedSearch, 'id' | 'createdAt'>) => void;
  removeSavedSearch: (id: string) => void;
  toggleSavedSearchAlerts: (id: string) => void;
  updateSavedSearchMeta: (id: string, updates: Partial<Pick<SavedSearch, 'lastCheckedAt' | 'lastMatchCount'>>) => void;
  markAllSavedSearchesSeen: () => void;

  // Checkout state
  savedAddress: SavedAddress | null;
  saveAddress: (address: SavedAddress) => void;
  clearSavedAddress: () => void;
  savedPaymentMethod: SavedPaymentMethod | null;
  savePaymentMethod: (paymentMethod: SavedPaymentMethod) => void;
  clearSavedPaymentMethod: () => void;

  // Account security
  twoFactorEnabled: boolean;
  setTwoFactorEnabled: (enabled: boolean) => void;

  // Settings preferences
  accountPreferences: AccountPreferences;
  updateAccountPreferences: (updates: Partial<AccountPreferences>) => void;
  paymentPreferences: PaymentPreferences;
  updatePaymentPreferences: (updates: Partial<PaymentPreferences>) => void;
  postagePreferences: PostagePreferences;
  updatePostagePreferences: (updates: Partial<PostagePreferences>) => void;
  hydratePostagePreferences: () => Promise<void>;
  personalisationPreferences: PersonalisationPreferences;
  updatePersonalisationPreferences: (updates: Partial<PersonalisationPreferences>) => void;

  // Notifications
  notificationCount: number;
  setNotificationCount: (count: number) => void;

  // Selling Draft
  sellDraft: DraftListing;
  updateSellDraft: (updates: Partial<DraftListing>) => void;
  clearSellDraft: () => void;

  // Conversations Inbox
  conversations: Conversation[];
  conversationsLoaded: boolean;
  markConversationsLoaded: () => void;
  availableChatBots: ChatBot[];
  upsertConversation: (conversation: Conversation) => void;
  markConversationRead: (id: string) => void;
  toggleConversationUnread: (id: string) => void;
  archiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  toggleConversationPinned: (id: string) => void;
  createGroupConversation: (input: CreateGroupConversationInput) => string;
  deployBotToConversation: (conversationId: string, botId: string) => void;
  undeployBotFromConversation: (conversationId: string, botId: string) => void;
  appendConversationMessage: (conversationId: string, message: ConversationMessage) => void;
  replaceConversationMessages: (conversationId: string, messages: ConversationMessage[]) => void;
  setConversationDraft: (conversationId: string, draft: string) => void;
  addMessageReaction: (conversationId: string, messageId: string, reaction: string) => void;
  removeMessageReaction: (conversationId: string, messageId: string, reaction: string) => void;
  // Chat settings / privacy
  blockedUsers: string[];
  toggleBlockedUser: (userId: string) => void;
  isBlockedUser: (userId: string) => boolean;
  mutedConversationIds: string[];
  toggleMutedConversation: (id: string) => Promise<void>;
  isMutedConversation: (id: string) => boolean;
  readReceiptsEnabled: boolean;
  setReadReceiptsEnabled: (v: boolean) => void;
  allowMessagesFrom: 'everyone' | 'following' | 'nobody';
  setAllowMessagesFrom: (v: 'everyone' | 'following' | 'nobody') => void;
  archivedConversationIds: string[];
  toggleArchivedConversation: (id: string) => Promise<void>;
  isArchivedConversation: (id: string) => boolean;
  // Message requests
  messageRequests: string[]; // conversationIds that are pending requests
  acceptMessageRequest: (id: string) => Promise<void>;
  declineMessageRequest: (id: string) => Promise<void>;
  isMessageRequest: (id: string) => boolean;
  // Support tickets
  supportTickets: SupportTicket[];
  createSupportTicket: (ticket: Omit<SupportTicket, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => string;
  createSupportTicketOnApi: (ticket: Omit<SupportTicket, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  loadSupportTicketsFromApi: () => Promise<void>;
  loadSupportTicketsForOrderFromApi: (orderId: string) => Promise<void>;
  updateSupportTicketStatus: (id: string, status: SupportTicket['status']) => Promise<void>;
  getSupportTicketsForOrder: (orderId: string) => SupportTicket[];
  // Marketplace chat settings
  offersInChatEnabled: boolean;
  setOffersInChatEnabled: (v: boolean) => void;
  orderUpdatesInChatEnabled: boolean;
  setOrderUpdatesInChatEnabled: (v: boolean) => void;
  // Quick replies (persisted to API, locally editable)
  sellerQuickReplies: QuickReply[];
  addSellerQuickReply: (reply: QuickReply) => void;
  updateSellerQuickReply: (index: number, reply: QuickReply) => void;
  removeSellerQuickReply: (index: number) => void;
  buyerQuickReplies: QuickReply[];
  addBuyerQuickReply: (reply: QuickReply) => void;
  updateBuyerQuickReply: (index: number, reply: QuickReply) => void;
  removeBuyerQuickReply: (index: number) => void;
  loadQuickRepliesFromApi: () => Promise<void>;
  addQuickReplyOnApi: (role: 'buyer' | 'seller', title: string, message: string) => Promise<QuickReply>;
  updateQuickReplyOnApi: (role: 'buyer' | 'seller', index: number, title: string, message: string) => Promise<void>;
  removeQuickReplyOnApi: (role: 'buyer' | 'seller', index: number) => Promise<void>;
  // Enabled bots (global)
  enabledBotIds: string[];
  toggleEnabledBot: (botId: string) => void;
  isBotEnabled: (botId: string) => boolean;
  // Custom user bots (backend-backed)
  customBots: ChatBot[];
  createCustomBot: (bot: Omit<ChatBot, 'id' | 'type' | 'creatorId'>) => Promise<string>;
  updateCustomBot: (botId: string, updates: Partial<ChatBot>) => Promise<void>;
  deleteCustomBot: (botId: string) => Promise<void>;
  loadBotsFromApi: () => Promise<void>;
  // Server-backed provider connections
  providerConnections: ProviderConnectionInfo[];
  loadProviderConnections: () => Promise<void>;
  createProviderConnection: (input: {
    provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
    apiKey: string;
    label?: string;
    baseUrl?: string;
  }) => Promise<void>;
  deleteProviderConnection: (connectionId: string) => Promise<string[]>;
  reverifyProviderConnection: (connectionId: string) => Promise<void>;
  // Agent runs (real server-backed execution records)
  agentRuns: AgentRunInfo[];
  loadAgentRuns: (params?: { conversationId?: string; botId?: string; status?: string; limit?: number }) => Promise<void>;
  cancelAgentRun: (runId: string) => Promise<void>;
  // Playground
  playgroundResult: PlaygroundResult | null;
  playgroundLoading: boolean;
  runPlayground: (botId: string, message: string, conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<void>;
  clearPlayground: () => void;
  // Pending approval requests
  pendingApprovals: ApprovalRequestInfo[];
  loadPendingApprovals: () => Promise<void>;
  approveRequest: (approvalId: string, editedArguments?: Record<string, unknown>) => Promise<void>;
  rejectRequest: (approvalId: string) => Promise<void>;
  // Agent versions
  botVersions: Record<string, Array<{
    id: string;
    versionNumber: number;
    publisherId: string;
    configChecksum: string;
    permissionsChecksum: string;
    publishNotes: string | null;
    createdAt: string;
  }>>;
  publishBot: (botId: string, publishNotes?: string) => Promise<{ versionId: string; versionNumber: number }>;
  loadBotVersions: (botId: string) => Promise<void>;
  rollbackBot: (botId: string, versionId: string) => Promise<void>;
  // Conversation bot deployments (real backend state)
  conversationDeployments: Record<string, ConversationBotDeployment[]>;
  loadConversationDeployments: (conversationId: string) => Promise<void>;
  clearConversationDeployments: (conversationId: string) => void;

  userLooks: UserLook[];
  /** Internal: IDs of looks the current user has liked. */
  __likedLooks?: string[];
  addUserLook: (look: Omit<UserLook, 'id' | 'createdAt'>) => string;
  removeUserLook: (id: string) => void;
  toggleUserLookLike: (lookId: string) => void;
  isUserLookLiked: (lookId: string) => boolean;

  // Profile Uploads
  userAvatar: string | null;
  userCover: string | null;
  profileMediaOverrides: Record<string, ProfileMediaOverride>;
  hydrateProfileMediaOverrides: (overrides: Record<string, ProfileMediaOverride>) => void;
  setProfileMediaOverride: (userId: string, updates: Partial<ProfileMediaOverride>) => void;
  updateUserAvatar: (uri: string) => void;
  updateUserCover: (uri: string) => void;

  // Outfits — user-created styling arrangements from closet items
  outfits: Outfit[];
  addOutfit: (outfit: Outfit) => void;
  removeOutfit: (id: string) => void;

  // Create action sheet
  createSheetVisible: boolean;
  setCreateSheetVisible: (visible: boolean) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
  currentUser: null, // Note: For a real app, load this from secure storage initially
  isAuthenticated: false,
  biometricLoginPending: false,
  setBiometricLoginPending: (value) => set({ biometricLoginPending: value }),
  hasCompletedOnboarding: false,
  setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
  login: (user) => {
    set({ currentUser: user, isAuthenticated: true });
    persistLocalAuthSnapshot(user, get().twoFactorEnabled);
    // Attach Sentry user context for crash attribution. Only authenticated
    // users receive PII context; non-authenticated users stay unset.
    setSentryUser({
      id: user.id,
      email: user.email ?? undefined,
      username: user.username,
    });
    identifyUser({
      id: user.id,
      email: user.email ?? undefined,
      username: user.username,
    });
  },
  logout: () => {
    set({ currentUser: null, isAuthenticated: false, twoFactorEnabled: false, biometricLoginPending: false });
    persistLocalAuthSnapshot(null, false);
    // Scrub Sentry user context on logout so subsequent crashes are anonymous.
    setSentryUser(null);
    resetIdentity();
  },
  updateUserProfile: (updates) =>
    set((state) => {
      const updatedUser = state.currentUser ? { ...state.currentUser, ...updates } : null;
      return { currentUser: updatedUser };
    }),
  fetchMyProfile: async () => {
    try {
      const profile = await fetchMyProfileFromApi();
      set((state) => ({
        currentUser: state.currentUser
          ? {
              ...state.currentUser,
              username: profile.username,
              displayName: profile.displayName,
              bio: profile.bio,
              location: profile.location,
              website: profile.website,
              phone: profile.phone,
              avatar: profile.avatar,
              coverPhoto: profile.coverPhoto,
              coverVideo: profile.coverVideo,
              email: profile.email,
              role: profile.role,
              emailVerified: profile.emailVerified,
              twoFactorEnabled: profile.twoFactorEnabled,
              identityVerified: profile.identityVerified,
              sellerVerified: profile.sellerVerified,
              createdAt: profile.createdAt,
              updatedAt: profile.updatedAt,
            }
          : null,
        userAvatar: profile.avatar ?? null,
        userCover: profile.coverPhoto ?? null,
      }));
    } catch {
      // Silently fail; profile will remain as cached or null.
    }
  },

  wishlist: [],
  toggleWishlist: (id) =>
    set((state) => {
      const isFav = state.wishlist.includes(id);
      return {
        wishlist: isFav
          ? state.wishlist.filter((fid) => fid !== id)
          : [...state.wishlist, id],
      };
    }),
  isWishlisted: (id) => get().wishlist.includes(id),
  savedProducts: [],
  toggleSavedProduct: (id) =>
    set((state) => {
      const isSaved = state.savedProducts.includes(id);
      return {
        savedProducts: isSaved
          ? state.savedProducts.filter((savedId) => savedId !== id)
          : [...state.savedProducts, id],
      };
    }),
  isSavedProduct: (id) => get().savedProducts.includes(id),
  collections: [],
  createCollection: (name, description, isPrivate) => {
    const id = makeStableId('collection', 9);
    const now = Date.now();
    set((state) => ({
      collections: [
        ...state.collections,
        { id, name, description, isPrivate, itemIds: [], createdAt: now, updatedAt: now },
      ],
    }));
    return id;
  },
  createCollectionOnApi: async (name, description, isPrivate) => {
    const apiCollection = await createCollectionOnApi(name, description, isPrivate);
    set((state) => ({
      collections: [
        ...state.collections,
        {
          id: apiCollection.id,
          name: apiCollection.name,
          description: apiCollection.description ?? undefined,
          isPrivate: apiCollection.isPrivate,
          itemIds: apiCollection.itemIds,
          createdAt: new Date(apiCollection.createdAt).getTime(),
          updatedAt: new Date(apiCollection.updatedAt).getTime(),
        },
      ],
    }));
    return apiCollection.id;
  },
  loadCollectionsFromApi: async () => {
    const apiCollections = await listCollectionsFromApi();
    set(() => ({
      collections: apiCollections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? undefined,
        isPrivate: c.isPrivate,
        itemIds: c.itemIds,
        createdAt: new Date(c.createdAt).getTime(),
        updatedAt: new Date(c.updatedAt).getTime(),
      })),
    }));
  },
  deleteCollection: (id) =>
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
    })),
  renameCollection: (id, name) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, name, updatedAt: Date.now() } : c
      ),
    })),
  reorderCollections: (fromIndex, toIndex) =>
    set((state) => {
      const next = [...state.collections];
      const [moved] = next.splice(fromIndex, 1);
      if (moved) next.splice(toIndex, 0, moved);
      return { collections: next };
    }),
  updateCollectionOnApi: async (id, fields) => {
    await updateCollectionOnApi(id, fields);
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id
          ? { ...c, ...fields, updatedAt: Date.now() }
          : c
      ),
    }));
  },
  deleteCollectionOnApi: async (id) => {
    await deleteCollectionOnApi(id);
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
    }));
  },
  addToCollection: (collectionId, itemId) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId && !(c.itemIds?.includes(itemId) ?? false)
          ? { ...c, itemIds: [...(c.itemIds ?? []), itemId], updatedAt: Date.now() }
          : c
      ),
    })),
  addToCollectionOnApi: async (collectionId, itemId) => {
    await addListingToCollectionOnApi(collectionId, itemId);
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId && !(c.itemIds?.includes(itemId) ?? false)
          ? { ...c, itemIds: [...(c.itemIds ?? []), itemId], updatedAt: Date.now() }
          : c
      ),
    }));
  },
  removeFromCollection: (collectionId, itemId) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? { ...c, itemIds: (c.itemIds ?? []).filter((id) => id !== itemId), updatedAt: Date.now() }
          : c
      ),
    })),
  removeFromCollectionOnApi: async (collectionId, itemId) => {
    await removeListingFromCollectionOnApi(collectionId, itemId);
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? { ...c, itemIds: (c.itemIds ?? []).filter((id) => id !== itemId), updatedAt: Date.now() }
          : c
      ),
    }));
  },
  isInCollection: (collectionId, itemId) =>
    get().collections.find((c) => c.id === collectionId)?.itemIds?.includes(itemId) ?? false,
  isItemSavedAnywhere: (itemId) =>
    get().savedProducts.includes(itemId) || get().collections.some((c) => c.itemIds?.includes(itemId) ?? false),
  getItemCollections: (itemId) =>
    get().collections.filter((c) => c.itemIds?.includes(itemId) ?? false),
  seenPosterIds: [],
  markPosterSeen: (posterId) =>
    set((state) => {
      if (state.seenPosterIds.includes(posterId)) {
        return state;
      }

      return {
        seenPosterIds: [...state.seenPosterIds, posterId],
      };
    }),
  hasSeenPoster: (posterId) => get().seenPosterIds.includes(posterId),
  savedPosterStoryIds: [],
  toggleSavedPosterStory: (storyId) =>
    set((state) => {
      const isSaved = state.savedPosterStoryIds.includes(storyId);
      return {
        savedPosterStoryIds: isSaved
          ? state.savedPosterStoryIds.filter((id) => id !== storyId)
          : [...state.savedPosterStoryIds, storyId],
      };
    }),
  isSavedPosterStory: (storyId) => get().savedPosterStoryIds.includes(storyId),
  customPosters: [],
  addPoster: (poster) =>
    set((state) => ({
      customPosters: [poster, ...state.customPosters],
    })),
  removePoster: (posterId) =>
    set((state) => ({
      customPosters: state.customPosters.filter((poster) => poster.id !== posterId),
    })),
  customAuctions: [],
  addAuction: (auction) =>
    set((state) => ({
      customAuctions: [auction, ...state.customAuctions],
    })),
  auctionRuntime: {},
  placeAuctionBid: (auction, bidderId, amount) => {
    if (auction.lifecycle !== 'live' || auction.msToEnd <= 0) {
      return { ok: false, message: 'Auction is not live' };
    }

    const state = get();
    const runtime = state.auctionRuntime[auction.id];

    if (runtime?.closedAtMs) {
      return { ok: false, message: 'Auction already closed' };
    }

    const currentBid = runtime?.currentBid ?? auction.currentBid;
    if (amount <= currentBid) {
      return { ok: false, message: 'Bid must be above current bid' };
    }

    // Anti-sniping: if the bid is placed within the extension window of the
    // auction end, extend the end time so other bidders can respond. The
    // effective end time accounts for any previous extensions.
    const now = Date.now();
    const originalEndMs = new Date(auction.endsAt).getTime();
    const effectiveEndMs = runtime?.extendedEndMs ?? originalEndMs;
    const msToEnd = effectiveEndMs - now;
    let extendedEndMs = runtime?.extendedEndMs;
    if (msToEnd <= ANTI_SNIPE_WINDOW_MS) {
      extendedEndMs = Math.max(effectiveEndMs, now) + ANTI_SNIPE_EXTENSION_MS;
    }

    const nextRuntime: AuctionRuntimeState = {
      currentBid: amount,
      bidCount: (runtime?.bidCount ?? auction.bidCount) + 1,
      lastBidderId: bidderId,
      winnerUserId: runtime?.winnerUserId,
      settled: false,
      extendedEndMs,
    };

    set({
      auctionRuntime: {
        ...state.auctionRuntime,
        [auction.id]: nextRuntime,
      },
      marketLedger: [
        makeLedgerEntry({
          channel: 'auction',
          action: 'bid',
          referenceId: auction.id,
          amountGBP: amount,
          note: `Bid placed by ${bidderId}`,
        }),
        ...state.marketLedger,
      ],
    });

    return { ok: true, message: 'Bid placed' };
  },
  buyNowAuction: (auction, buyerId) => {
    if (!auction.buyNowPrice) {
      return { ok: false, message: 'Buy now not available' };
    }

    const state = get();
    const runtime = state.auctionRuntime[auction.id];

    if (runtime?.closedAtMs || auction.lifecycle === 'ended') {
      return { ok: false, message: 'Auction already closed' };
    }

    const closeTs = Date.now();
    const nextRuntime: AuctionRuntimeState = {
      currentBid: auction.buyNowPrice,
      bidCount: runtime?.bidCount ?? auction.bidCount,
      lastBidderId: buyerId,
      winnerUserId: buyerId,
      closedAtMs: closeTs,
      closedReason: 'buy-now',
      settled: true,
    };

    set({
      auctionRuntime: {
        ...state.auctionRuntime,
        [auction.id]: nextRuntime,
      },
      marketLedger: [
        makeLedgerEntry({
          channel: 'auction',
          action: 'win',
          referenceId: auction.id,
          amountGBP: auction.buyNowPrice,
          note: `Buy now by ${buyerId}`,
        }),
        ...state.marketLedger,
      ],
    });

    return { ok: true, message: 'Buy now completed' };
  },
  settleExpiredAuctions: (auctions) =>
    set((state) => {
      let changed = false;
      const nextRuntime = { ...state.auctionRuntime };
      const nextLedger = [...state.marketLedger];

      for (const auction of auctions) {
        if (auction.lifecycle !== 'ended') {
          continue;
        }

        const runtime = nextRuntime[auction.id];
        if (!runtime || runtime.settled) {
          continue;
        }

        changed = true;
        const winnerUserId = runtime.winnerUserId ?? runtime.lastBidderId;

        nextRuntime[auction.id] = {
          ...runtime,
          winnerUserId,
          closedAtMs: runtime.closedAtMs ?? Date.now(),
          closedReason: runtime.closedReason ?? 'expired',
          settled: true,
        };

        if (winnerUserId) {
          nextLedger.unshift(
            makeLedgerEntry({
              channel: 'auction',
              action: 'win',
              referenceId: auction.id,
              amountGBP: runtime.currentBid,
              note: `Auction settled for ${winnerUserId}`,
            })
          );
        }
      }

      if (!changed) {
        return state;
      }

      return {
        auctionRuntime: nextRuntime,
        marketLedger: nextLedger,
      };
    }),
  customCoOwns: [],
  addCoOwn: (asset) =>
    set((state) => ({
      customCoOwns: [asset, ...state.customCoOwns],
    })),
  coOwnRuntime: {},
  coOwnCompliance: {
    countryCode: 'GB',
    kycVerified: false,
    riskDisclosureAccepted: false,
    stableCoinWalletConnected: false,
    educationCompleted: false,
    dac7Completed: false,
    dac7Tin: undefined,
    dac7Country: undefined,
  },
  updateCoOwnCompliance: (updates) =>
    set((state) => ({
      coOwnCompliance: {
        ...state.coOwnCompliance,
        ...updates,
      },
    })),
  checkCoOwnEligibility: (_settlementMode = 'ONEZE') => {
    return { ok: true };
  },
  buyCoOwnUnits: (asset, buyerId, units) => {
    if (!asset.isOpen) {
      return { ok: false, message: 'Pool currently closed' };
    }

    const requestedUnits = Math.floor(units);
    if (!Number.isFinite(requestedUnits) || requestedUnits <= 0) {
      return { ok: false, message: 'Units must be at least 1' };
    }

    const state = get();
    const runtime = state.coOwnRuntime[asset.id] ?? {
      availableUnits: asset.availableUnits,
      holders: asset.holders,
      volume24hGBP: asset.volume24hGBP,
      yourUnits: asset.yourUnits,
      unitPriceGBP: asset.unitPriceGBP,
      unitPriceStable: asset.unitPriceStable,
      marketMovePct24h: asset.marketMovePct24h,
      referencePriceGBP: asset.unitPriceGBP,
      avgEntryPriceGBP: asset.avgEntryPriceGBP ?? asset.unitPriceGBP,
      realizedProfitGBP: asset.realizedProfitGBP ?? 0,
    };

    if (runtime.availableUnits < requestedUnits) {
      return { ok: false, message: 'Not enough units available' };
    }

    const totalUnits = Math.max(1, asset.totalUnits);
    const executionPriceGBP = runtime.unitPriceGBP;
    const executionPriceStable = runtime.unitPriceStable;
    const totalSpend = requestedUnits * executionPriceGBP;
    const nextYourUnits = runtime.yourUnits + requestedUnits;
    const nextAvgEntry =
      nextYourUnits > 0
        ? (runtime.avgEntryPriceGBP * runtime.yourUnits + executionPriceGBP * requestedUnits) / nextYourUnits
        : executionPriceGBP;

    const impactPct = Math.min(0.15, (requestedUnits / totalUnits) * 0.14);
    const nextUnitPriceGBP = Number((runtime.unitPriceGBP * (1 + impactPct)).toFixed(2));
    const stableRate = runtime.unitPriceGBP > 0
      ? runtime.unitPriceStable / runtime.unitPriceGBP
      : executionPriceStable / Math.max(executionPriceGBP, 0.01);
    const nextUnitPriceStable = Number((nextUnitPriceGBP * stableRate).toFixed(2));
    const referencePrice = Math.max(0.01, runtime.referencePriceGBP);
    const nextMarketMovePct24h = Number(
      (((nextUnitPriceGBP - referencePrice) / referencePrice) * 100).toFixed(1)
    );

    const nextRuntime: CoOwnRuntimeState = {
      availableUnits: runtime.availableUnits - requestedUnits,
      holders: runtime.yourUnits > 0 ? runtime.holders : runtime.holders + 1,
      volume24hGBP: runtime.volume24hGBP + totalSpend,
      yourUnits: nextYourUnits,
      unitPriceGBP: nextUnitPriceGBP,
      unitPriceStable: nextUnitPriceStable,
      marketMovePct24h: nextMarketMovePct24h,
      referencePriceGBP: referencePrice,
      avgEntryPriceGBP: nextAvgEntry,
      realizedProfitGBP: runtime.realizedProfitGBP,
    };
    const deliveryTriggered = nextRuntime.availableUnits === 0 && nextYourUnits >= totalUnits;

    set({
      coOwnRuntime: {
        ...state.coOwnRuntime,
        [asset.id]: nextRuntime,
      },
      marketLedger: [
        makeLedgerEntry({
          channel: 'co-own',
          action: 'buy-units',
          referenceId: asset.id,
          amountGBP: totalSpend,
          units: requestedUnits,
          note: `${buyerId} bought at £${executionPriceGBP.toFixed(2)} per unit`,
        }),
        ...state.marketLedger,
      ],
    });

    return {
      ok: true,
      message: deliveryTriggered
        ? `Purchased ${requestedUnits} unit${requestedUnits === 1 ? '' : 's'} · You now own 100% and delivery has been initiated`
        : `Purchased ${requestedUnits} unit${requestedUnits === 1 ? '' : 's'}`,
      deliveryTriggered,
      deliveryListingId: deliveryTriggered ? asset.listingId : undefined,
    };
  },
  sellCoOwnUnits: (asset, sellerId, units) => {
    if (!asset.isOpen) {
      return { ok: false, message: 'Pool currently closed' };
    }

    const eligibility = get().checkCoOwnEligibility(asset.settlementMode);
    if (!eligibility.ok) {
      return { ok: false, message: eligibility.message };
    }

    const requestedUnits = Math.floor(units);
    if (!Number.isFinite(requestedUnits) || requestedUnits <= 0) {
      return { ok: false, message: 'Units must be at least 1' };
    }

    const state = get();
    const runtime = state.coOwnRuntime[asset.id] ?? {
      availableUnits: asset.availableUnits,
      holders: asset.holders,
      volume24hGBP: asset.volume24hGBP,
      yourUnits: asset.yourUnits,
      unitPriceGBP: asset.unitPriceGBP,
      unitPriceStable: asset.unitPriceStable,
      marketMovePct24h: asset.marketMovePct24h,
      referencePriceGBP: asset.unitPriceGBP,
      avgEntryPriceGBP: asset.avgEntryPriceGBP ?? asset.unitPriceGBP,
      realizedProfitGBP: asset.realizedProfitGBP ?? 0,
    };

    if (runtime.yourUnits < requestedUnits) {
      return { ok: false, message: 'Not enough units in holdings' };
    }

    const totalUnits = Math.max(1, asset.totalUnits);
    const executionPriceGBP = runtime.unitPriceGBP;
    const totalReceive = requestedUnits * executionPriceGBP;
    const realizedDelta = (executionPriceGBP - runtime.avgEntryPriceGBP) * requestedUnits;

    const nextYourUnits = runtime.yourUnits - requestedUnits;
    const impactPct = Math.min(0.12, (requestedUnits / totalUnits) * 0.12);
    const nextUnitPriceGBP = Number(Math.max(0.05, runtime.unitPriceGBP * (1 - impactPct)).toFixed(2));
    const stableRate = runtime.unitPriceGBP > 0
      ? runtime.unitPriceStable / runtime.unitPriceGBP
      : asset.unitPriceStable / Math.max(asset.unitPriceGBP, 0.01);
    const nextUnitPriceStable = Number((nextUnitPriceGBP * stableRate).toFixed(2));
    const referencePrice = Math.max(0.01, runtime.referencePriceGBP);
    const nextMarketMovePct24h = Number(
      (((nextUnitPriceGBP - referencePrice) / referencePrice) * 100).toFixed(1)
    );

    const nextRuntime: CoOwnRuntimeState = {
      availableUnits: runtime.availableUnits + requestedUnits,
      holders: nextYourUnits === 0 ? Math.max(0, runtime.holders - 1) : runtime.holders,
      volume24hGBP: runtime.volume24hGBP + totalReceive,
      yourUnits: nextYourUnits,
      unitPriceGBP: nextUnitPriceGBP,
      unitPriceStable: nextUnitPriceStable,
      marketMovePct24h: nextMarketMovePct24h,
      referencePriceGBP: referencePrice,
      avgEntryPriceGBP: nextYourUnits > 0 ? runtime.avgEntryPriceGBP : nextUnitPriceGBP,
      realizedProfitGBP: runtime.realizedProfitGBP + realizedDelta,
    };

    set({
      coOwnRuntime: {
        ...state.coOwnRuntime,
        [asset.id]: nextRuntime,
      },
      marketLedger: [
        makeLedgerEntry({
          channel: 'co-own',
          action: 'sell-units',
          referenceId: asset.id,
          amountGBP: totalReceive,
          units: requestedUnits,
          note: `${sellerId} sold at £${executionPriceGBP.toFixed(2)} · realized £${realizedDelta.toFixed(2)}`,
        }),
        ...state.marketLedger,
      ],
    });

    return {
      ok: true,
      message: `Sold ${requestedUnits} unit${requestedUnits === 1 ? '' : 's'} · realized £${realizedDelta.toFixed(2)}`,
    };
  },
  marketLedger: [],

  // Co-Own asset watchlist
  coOwnWatchlist: [],
  toggleCoOwnWatch: (assetId) =>
    set((state) => {
      const isWatched = state.coOwnWatchlist.includes(assetId);
      // Fire-and-forget backend sync
      if (isWatched) {
        void removeFromCoOwnWatchlist(assetId);
      } else {
        void addToCoOwnWatchlist(assetId);
      }
      return {
        coOwnWatchlist: isWatched
          ? state.coOwnWatchlist.filter((id) => id !== assetId)
          : [...state.coOwnWatchlist, assetId],
      };
    }),
  isCoOwnWatched: (assetId) => get().coOwnWatchlist.includes(assetId),

  browseFilters: {
    query: '',
    sort: 'Recommended',
    brands: [],
    sizes: [],
    condition: 'Any',
    sustainableOnly: false,
    priceMin: null,
    priceMax: null,
  },
  updateBrowseFilters: (updates) =>
    set((state) => ({
      browseFilters: {
        ...state.browseFilters,
        ...updates,
      },
    })),
  resetBrowseFilters: () =>
    set({
      browseFilters: {
        query: '',
        sort: 'Recommended',
        brands: [],
        sizes: [],
        condition: 'Any',
        sustainableOnly: false,
        priceMin: null,
        priceMax: null,
      },
    }),

  // Saved searches
  savedSearches: [],
  addSavedSearch: (search) =>
    set((state) => {
      // Deduplicate by query string — if same query exists, update it instead
      const normalized = search.query.trim().toLowerCase();
      const existing = state.savedSearches.find(
        (s) => s.query.trim().toLowerCase() === normalized
      );
      if (existing) {
        return {
          savedSearches: state.savedSearches.map((s) =>
            s.id === existing.id
              ? { ...s, ...search, id: existing.id, createdAt: existing.createdAt }
              : s
          ),
        };
      }
      const newSearch: SavedSearch = {
        ...search,
        id: makeStableId('saved_search'),
        createdAt: new Date().toISOString(),
      };
      return { savedSearches: [newSearch, ...state.savedSearches] };
    }),
  removeSavedSearch: (id) =>
    set((state) => ({
      savedSearches: state.savedSearches.filter((s) => s.id !== id),
    })),
  toggleSavedSearchAlerts: (id) =>
    set((state) => ({
      savedSearches: state.savedSearches.map((s) =>
        s.id === id ? { ...s, alertsEnabled: !s.alertsEnabled } : s
      ),
    })),
  updateSavedSearchMeta: (id, updates) =>
    set((state) => ({
      savedSearches: state.savedSearches.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  markAllSavedSearchesSeen: () =>
    set((state) => {
      const now = new Date().toISOString();
      return {
        savedSearches: state.savedSearches.map((s) => ({
          ...s,
          lastCheckedAt: now,
          lastMatchCount: 0,
        })),
      };
    }),

  savedAddress: null,
  saveAddress: (address) => set({ savedAddress: address }),
  clearSavedAddress: () => set({ savedAddress: null }),
  savedPaymentMethod: null,
  savePaymentMethod: (paymentMethod) => set({ savedPaymentMethod: paymentMethod }),
  clearSavedPaymentMethod: () => set({ savedPaymentMethod: null }),

  twoFactorEnabled: false,
  setTwoFactorEnabled: (enabled) => {
    set({ twoFactorEnabled: enabled });
    persistLocalAuthSnapshot(get().currentUser, enabled);
  },

  accountPreferences: { holidayMode: false, privateProfile: false },
  updateAccountPreferences: (updates) => {
    set((state) => ({
      accountPreferences: { ...state.accountPreferences, ...updates },
    }));
    void updateUserAccountPreferences(updates);
  },

  paymentPreferences: { useBalance: true },
  updatePaymentPreferences: (updates) =>
    set((state) => ({
      paymentPreferences: { ...state.paymentPreferences, ...updates },
    })),

  postagePreferences: { carrierKey: 'evri', freeShipping: false, bundleDiscount: true },
  updatePostagePreferences: (updates) => {
    const prev = get().postagePreferences;
    set((state) => ({
      postagePreferences: { ...state.postagePreferences, ...updates },
    }));
    void updateUserPostagePreferences(updates).catch(() => {
      // Rollback on failure — restore previous state so UI stays truthful
      set({ postagePreferences: prev });
    });
  },
  hydratePostagePreferences: async () => {
    try {
      const postage = await fetchPostagePreferences();
      set({ postagePreferences: postage });
    } catch {
      // Silently keep cached/local defaults
    }
  },

  personalisationPreferences: {
    genderFilter: ['Women', 'Men'],
    categoriesAndSizesPref: 'Balanced',
    brandsPref: 'Any',
    membersPref: 'Everyone',
  },
  updatePersonalisationPreferences: (updates) => {
    set((state) => ({
      personalisationPreferences: { ...state.personalisationPreferences, ...updates },
    }));
    void updateUserPersonalisation(updates);
  },

  notificationCount: ENABLE_RUNTIME_MOCKS ? 3 : 0,
  setNotificationCount: (count) => set({ notificationCount: count }),

  sellDraft: {},
  updateSellDraft: (updates) =>
    set((state) => ({ sellDraft: { ...state.sellDraft, ...updates } })),
  clearSellDraft: () => set({ sellDraft: {} }),

  conversations: ENABLE_RUNTIME_MOCKS ? MOCK_CONVERSATIONS : [],
  conversationsLoaded: ENABLE_RUNTIME_MOCKS,
  markConversationsLoaded: () => set({ conversationsLoaded: true }),
  availableChatBots: ENABLE_RUNTIME_MOCKS ? MOCK_CHAT_BOTS : [],
  upsertConversation: (conversation) =>
    set((state) => {
      const existing = state.conversations.find((item) => item.id === conversation.id);
      let nextConversations: Conversation[];
      if (!existing) {
        nextConversations = [conversation, ...state.conversations];
      } else {
        const mergedConversation: Conversation = {
          ...existing,
          ...conversation,
          participantIds: conversation.participantIds ?? existing.participantIds,
          botIds: conversation.botIds ?? existing.botIds,
          messages: conversation.messages.length ? conversation.messages : existing.messages,
        };
        nextConversations = [
          mergedConversation,
          ...state.conversations.filter((item) => item.id !== conversation.id),
        ];
      }

      // P0.12: Re-derive the muted/archived/request arrays from the hydrated
      // conversation fields so they stay in sync with server state.
      return {
        conversations: nextConversations,
        ...deriveConversationStateArrays(nextConversations),
      };
    }),
  markConversationRead: (id) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, unread: false, markedUnread: false } : c
      ),
    }));
    // P0.7: Fire-and-forget read-receipt to the backend. Don't block the UI
    // and don't surface errors — the next sync reconciles authoritative state.
    void fetchJson<{ ok: true }>(
      '/chat/conversations/' + encodeURIComponent(id) + '/read',
      { method: 'POST' }
    ).catch(() => {
      /* best-effort: ignore — next sync reconciles */
    });
  },
  toggleConversationUnread: (id) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, unread: !c.unread } : c
      ),
    })),
  archiveConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    })),
  deleteConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      // Clean up auxiliary per-conversation state so deleted conversations
      // don't linger in the muted/archived/request lists and inflate badges.
      mutedConversationIds: state.mutedConversationIds.filter((mid) => mid !== id),
      archivedConversationIds: state.archivedConversationIds.filter((aid) => aid !== id),
      messageRequests: state.messageRequests.filter((rid) => rid !== id),
    })),
  toggleConversationPinned: (id) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, isPinned: !c.isPinned } : c
      ),
    })),
  setConversationDraft: (conversationId, draft) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, draftText: draft || undefined } : c
      ),
    })),
  createGroupConversation: ({ title, memberIds, creatorId }) => {
    const creator = creatorId ?? get().currentUser?.id ?? 'me';
    const uniqueMemberIds = [...new Set([creator, ...memberIds])].filter((id) => id.trim().length > 0);
    const groupTitle = title.trim() || 'New Group';
    const conversationId = makeStableId('g');

    const createdMessage: ConversationMessage = {
      id: `msg_${Date.now()}`,
      senderId: 'system',
      isSystem: true,
      systemTitle: 'Group created',
      text: `${groupTitle} was created.`,
      timestamp: 'just now',
      type: 'system',
      sender: 'system',
    };

    const nextConversation: Conversation = {
      id: conversationId,
      type: 'group',
      title: groupTitle,
      ownerId: creator,
      participantIds: uniqueMemberIds,
      botIds: [],
      lastMessage: createdMessage.text ?? 'Group created',
      lastMessageTime: createdMessage.timestamp,
      unread: false,
      messages: [createdMessage],
    };

    set((state) => ({
      conversations: [nextConversation, ...state.conversations],
    }));

    return conversationId;
  },
  deployBotToConversation: (conversationId, botId) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || conversation.type !== 'group') {
          return conversation;
        }

        const existingBotIds = conversation.botIds ?? [];
        if (existingBotIds.includes(botId)) {
          return conversation;
        }

        const allBots = [...state.availableChatBots, ...state.customBots];
        const bot = allBots.find((item) => item.id === botId);
        const deployedText = bot
          ? `${bot.name} deployed. Try ${bot.commandHint}`
          : 'An agent was connected to this group.';

        const deployedMessage: ConversationMessage = {
          id: makeStableId('msg'),
          senderId: 'system',
          isSystem: true,
          systemTitle: 'Agent deployed',
          text: deployedText,
          timestamp: 'just now',
          type: 'system',
          sender: 'system',
        };

        return {
          ...conversation,
          botIds: [...existingBotIds, botId],
          lastMessage: deployedMessage.text ?? conversation.lastMessage,
          lastMessageTime: deployedMessage.timestamp,
          messages: [...conversation.messages, deployedMessage],
        };
      }),
    })),
  undeployBotFromConversation: (conversationId, botId) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || conversation.type !== 'group') {
          return conversation;
        }

        const nextBotIds = (conversation.botIds ?? []).filter((id) => id !== botId);
        if (nextBotIds.length === (conversation.botIds ?? []).length) {
          return conversation;
        }

        const allBots = [...state.availableChatBots, ...state.customBots];
        const bot = allBots.find((item) => item.id === botId);
        const removedText = bot
          ? `${bot.name} removed from the group.`
          : 'An agent was removed from this group.';

        const removedMessage: ConversationMessage = {
          id: makeStableId('msg'),
          senderId: 'system',
          isSystem: true,
          systemTitle: 'Agent removed',
          text: removedText,
          timestamp: 'just now',
          type: 'system',
          sender: 'system',
        };

        return {
          ...conversation,
          botIds: nextBotIds,
          lastMessage: removedMessage.text ?? conversation.lastMessage,
          lastMessageTime: removedMessage.timestamp,
          messages: [...conversation.messages, removedMessage],
        };
      }),
    })),
  appendConversationMessage: (conversationId, message) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const nextLastMessage = message.text
          ?? (message.mediaType === 'image' ? '📷 Photo' : message.mediaType === 'video' ? '🎥 Video' : undefined)
          ?? message.systemTitle
          ?? (message.offerPrice ? `Offer ${message.offerPrice}` : 'New message');

        return {
          ...conversation,
          lastMessage: nextLastMessage,
          lastMessageTime: message.timestamp,
          messages: [...conversation.messages, message],
        };
      }),
    })),
  replaceConversationMessages: (conversationId, messages) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        if (!messages.length) {
          return conversation;
        }

        const latestMessage = messages[messages.length - 1];
        const nextLastMessage = latestMessage.text
          ?? latestMessage.systemTitle
          ?? (latestMessage.offerPrice ? `Offer ${latestMessage.offerPrice}` : conversation.lastMessage);

        return {
          ...conversation,
          messages,
          lastMessage: nextLastMessage,
          lastMessageTime: latestMessage.timestamp,
        };
      }),
    })),
  blockedUsers: [],
  toggleBlockedUser: (userId) =>
    set((state) => {
      const isBlocked = state.blockedUsers.includes(userId);
      return {
        blockedUsers: isBlocked
          ? state.blockedUsers.filter((id) => id !== userId)
          : [...state.blockedUsers, userId],
      };
    }),
  isBlockedUser: (userId) => get().blockedUsers.includes(userId),
  mutedConversationIds: [],
  toggleMutedConversation: (id) => {
    const wasMuted = get().mutedConversationIds.includes(id);
    // Optimistic update — flip local state immediately for snappy UX. Also
    // mirror the flag onto the conversation object so the derived arrays
    // (P0.12) stay consistent with the local toggle.
    set((state) => ({
      mutedConversationIds: wasMuted
        ? state.mutedConversationIds.filter((mid) => mid !== id)
        : [...state.mutedConversationIds, id],
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, isMuted: !wasMuted } : c
      ),
    }));
    return (wasMuted ? unmuteConversationOnApi(id) : muteConversationOnApi(id)).catch(
      (error) => {
        // Rollback on failure so the UI tells the truth (§11).
        set((state) => ({
          mutedConversationIds: wasMuted
            ? [...state.mutedConversationIds, id]
            : state.mutedConversationIds.filter((mid) => mid !== id),
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, isMuted: wasMuted } : c
          ),
        }));
        throw error;
      }
    );
  },
  isMutedConversation: (id) => get().mutedConversationIds.includes(id),
  readReceiptsEnabled: true,
  setReadReceiptsEnabled: (v) => {
    const previous = get().readReceiptsEnabled;
    set({ readReceiptsEnabled: v });
    void updateChatPrivacy({ readReceiptsEnabled: v }).catch(() => {
      // Revert optimistic state so the UI tells the truth (§11): the setting
      // did not persist server-side. The toggle will visually snap back.
      set({ readReceiptsEnabled: previous });
    });
  },
  allowMessagesFrom: 'everyone',
  setAllowMessagesFrom: (v) => {
    const previous = get().allowMessagesFrom;
    set({ allowMessagesFrom: v });
    void updateChatPrivacy({ allowMessagesFrom: v }).catch(() => {
      // Revert optimistic state so the UI tells the truth (§11).
      set({ allowMessagesFrom: previous });
    });
  },
  archivedConversationIds: [],
  toggleArchivedConversation: (id) => {
    const wasArchived = get().archivedConversationIds.includes(id);
    // Optimistic update — flip local state immediately for snappy UX. Also
    // mirror the flag onto the conversation object so the derived arrays
    // (P0.12) stay consistent with the local toggle.
    set((state) => ({
      archivedConversationIds: wasArchived
        ? state.archivedConversationIds.filter((aid) => aid !== id)
        : [...state.archivedConversationIds, id],
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, isArchived: !wasArchived } : c
      ),
    }));
    return (wasArchived ? unarchiveConversationOnApi(id) : archiveConversationOnApi(id)).catch(
      (error) => {
        // Rollback on failure so the UI tells the truth (§11).
        set((state) => ({
          archivedConversationIds: wasArchived
            ? [...state.archivedConversationIds, id]
            : state.archivedConversationIds.filter((aid) => aid !== id),
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, isArchived: wasArchived } : c
          ),
        }));
        throw error;
      }
    );
  },
  isArchivedConversation: (id) => get().archivedConversationIds.includes(id),
  messageRequests: [],
  acceptMessageRequest: (id) => {
    const wasRequest = get().messageRequests.includes(id);
    // Optimistic update — remove from the pending requests list immediately.
    // Also mirror the status onto the conversation object so the derived
    // arrays (P0.12) stay consistent.
    if (wasRequest) {
      set((state) => ({
        messageRequests: state.messageRequests.filter((rid) => rid !== id),
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, requestStatus: 'accepted' } : c
        ),
      }));
    }
    return acceptMessageRequestOnApi(id).catch((error) => {
      // Rollback on failure so the UI tells the truth (§11).
      if (wasRequest) {
        set((state) => ({
          messageRequests: [...state.messageRequests, id],
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, requestStatus: 'pending' } : c
          ),
        }));
      }
      throw error;
    });
  },
  declineMessageRequest: (id) => {
    const wasRequest = get().messageRequests.includes(id);
    const previousConversation = get().conversations.find((c) => c.id === id) ?? null;
    // Optimistic update — drop the request and the conversation immediately.
    set((state) => ({
      messageRequests: state.messageRequests.filter((rid) => rid !== id),
      conversations: state.conversations.filter((c) => c.id !== id),
    }));
    return declineMessageRequestOnApi(id).catch((error) => {
      // Rollback on failure so the UI tells the truth (§11).
      set((state) => ({
        messageRequests: wasRequest ? [...state.messageRequests, id] : state.messageRequests,
        conversations: previousConversation
          ? [previousConversation, ...state.conversations]
          : state.conversations,
      }));
      throw error;
    });
  },
  isMessageRequest: (id) => get().messageRequests.includes(id),
  offersInChatEnabled: true,
  setOffersInChatEnabled: (v) => {
    const previous = get().offersInChatEnabled;
    set({ offersInChatEnabled: v });
    void updateChatPrivacy({ offersInChatEnabled: v }).catch(() => {
      set({ offersInChatEnabled: previous });
    });
  },
  orderUpdatesInChatEnabled: true,
  setOrderUpdatesInChatEnabled: (v) => {
    const previous = get().orderUpdatesInChatEnabled;
    set({ orderUpdatesInChatEnabled: v });
    void updateChatPrivacy({ orderUpdatesInChatEnabled: v }).catch(() => {
      set({ orderUpdatesInChatEnabled: previous });
    });
  },
  sellerQuickReplies: [
    { id: 'qr-s-1', title: 'Still available', message: 'Yes, still available!' },
    { id: 'qr-s-2', title: 'Ship today', message: 'I can ship this today if you want to go ahead.' },
    { id: 'qr-s-3', title: 'Thanks', message: 'Thanks for your interest! What would you like to know?' },
    { id: 'qr-s-4', title: 'Quick sale', message: 'I can do a small discount for a quick sale.' },
  ],
  addSellerQuickReply: (reply) => set((state) => ({
    sellerQuickReplies: [...state.sellerQuickReplies, reply],
  })),
  updateSellerQuickReply: (index, reply) => set((state) => ({
    sellerQuickReplies: state.sellerQuickReplies.map((r, i) => i === index ? reply : r),
  })),
  removeSellerQuickReply: (index) => set((state) => ({
    sellerQuickReplies: state.sellerQuickReplies.filter((_, i) => i !== index),
  })),
  buyerQuickReplies: [
    { id: 'qr-b-1', title: 'Still available?', message: 'Hi, is this still available?' },
    { id: 'qr-b-2', title: 'Make offer', message: 'Would you consider an offer on this?' },
    { id: 'qr-b-3', title: 'More photos', message: 'Can I see more photos?' },
    { id: 'qr-b-4', title: 'Best price', message: 'What\'s your best price?' },
  ],
  addBuyerQuickReply: (reply) => set((state) => ({
    buyerQuickReplies: [...state.buyerQuickReplies, reply],
  })),
  updateBuyerQuickReply: (index, reply) => set((state) => ({
    buyerQuickReplies: state.buyerQuickReplies.map((r, i) => i === index ? reply : r),
  })),
  removeBuyerQuickReply: (index) => set((state) => ({
    buyerQuickReplies: state.buyerQuickReplies.filter((_, i) => i !== index),
  })),
  loadQuickRepliesFromApi: async () => {
    try {
      const apiReplies = await fetchQuickRepliesFromApi();
      const sellerReplies: QuickReply[] = [];
      const buyerReplies: QuickReply[] = [];
      for (const r of apiReplies) {
        const reply: QuickReply = { id: r.id, title: r.title, message: r.body };
        if (r.role === 'seller') sellerReplies.push(reply);
        else buyerReplies.push(reply);
      }
      set({
        sellerQuickReplies: sellerReplies.length ? sellerReplies : get().sellerQuickReplies,
        buyerQuickReplies: buyerReplies.length ? buyerReplies : get().buyerQuickReplies,
      });
    } catch {
      // Silently keep local defaults if the API is unavailable.
    }
  },
  addQuickReplyOnApi: async (role, title, message) => {
    const created = await createQuickReplyOnApi({ role, title, body: message });
    const reply: QuickReply = { id: created.id, title: created.title, message: created.body };
    if (role === 'seller') {
      get().addSellerQuickReply(reply);
    } else {
      get().addBuyerQuickReply(reply);
    }
    return reply;
  },
  updateQuickReplyOnApi: async (role, index, title, message) => {
    const replies = role === 'seller' ? get().sellerQuickReplies : get().buyerQuickReplies;
    const existing = replies[index];
    if (!existing) throw new Error('Quick reply not found');
    await updateQuickReplyOnApi(existing.id, { title, body: message });
    const reply: QuickReply = { ...existing, title, message };
    if (role === 'seller') {
      get().updateSellerQuickReply(index, reply);
    } else {
      get().updateBuyerQuickReply(index, reply);
    }
  },
  removeQuickReplyOnApi: async (role, index) => {
    const replies = role === 'seller' ? get().sellerQuickReplies : get().buyerQuickReplies;
    const existing = replies[index];
    if (!existing) throw new Error('Quick reply not found');
    await deleteQuickReplyOnApi(existing.id);
    if (role === 'seller') {
      get().removeSellerQuickReply(index);
    } else {
      get().removeBuyerQuickReply(index);
    }
  },
  supportTickets: [],
  createSupportTicket: (ticket) => {
    const id = makeStableId('ticket', 9);
    const now = Date.now();
    set((state) => ({
      supportTickets: [
        ...state.supportTickets,
        { ...ticket, id, status: 'open', createdAt: now, updatedAt: now },
      ],
    }));
    return id;
  },
  createSupportTicketOnApi: async (ticket) => {
    const apiTicket = await createSupportTicketOnApi(
      ticket.orderId,
      ticket.topicId,
      ticket.topicLabel,
      ticket.details,
      ticket.evidenceMediaUrls
    );
    set((state) => ({
      supportTickets: [
        ...state.supportTickets,
        {
          ...ticket,
          id: apiTicket.id,
          status: apiTicket.status as SupportTicket['status'],
          evidenceMediaUrls: apiTicket.evidenceMediaUrls,
          createdAt: new Date(apiTicket.createdAt).getTime(),
          updatedAt: new Date(apiTicket.updatedAt).getTime(),
        },
      ],
    }));
    return apiTicket.id;
  },
  loadSupportTicketsFromApi: async () => {
    const tickets = await listSupportTicketsFromApi();
    set(() => ({
      supportTickets: tickets.map((t) => ({
        id: t.id,
        orderId: t.orderId,
        topicId: t.topicId,
        topicLabel: t.topicLabel,
        details: t.details,
        status: t.status as SupportTicket['status'],
        evidenceMediaUrls: t.evidenceMediaUrls,
        createdAt: new Date(t.createdAt).getTime(),
        updatedAt: new Date(t.updatedAt).getTime(),
      })),
    }));
  },
  loadSupportTicketsForOrderFromApi: async (orderId) => {
    const tickets = await listSupportTicketsForOrderFromApi(orderId);
    set((state) => {
      const existingOther = state.supportTickets.filter((t) => t.orderId !== orderId);
      const incoming = tickets.map((t) => ({
        id: t.id,
        orderId: t.orderId,
        topicId: t.topicId,
        topicLabel: t.topicLabel,
        details: t.details,
        status: t.status as SupportTicket['status'],
        evidenceMediaUrls: t.evidenceMediaUrls,
        createdAt: new Date(t.createdAt).getTime(),
        updatedAt: new Date(t.updatedAt).getTime(),
      }));
      return { supportTickets: [...existingOther, ...incoming] };
    });
  },
  updateSupportTicketStatus: async (id, status) => {
    await updateSupportTicketStatusOnApi(id, status);
    set((state) => ({
      supportTickets: state.supportTickets.map((t) =>
        t.id === id ? { ...t, status, updatedAt: Date.now() } : t
      ),
    }));
  },
  getSupportTicketsForOrder: (orderId) =>
    get().supportTickets.filter((t) => t.orderId === orderId),
  enabledBotIds: [],
  toggleEnabledBot: (botId) =>
    set((state) => {
      const isEnabled = state.enabledBotIds.includes(botId);
      return {
        enabledBotIds: isEnabled
          ? state.enabledBotIds.filter((id) => id !== botId)
          : [...state.enabledBotIds, botId],
      };
    }),
  isBotEnabled: (botId) => get().enabledBotIds.includes(botId),

  customBots: [],
  createCustomBot: async (bot) => {
    const result = await createCustomBotOnApi({
      name: bot.name,
      slug: bot.slug,
      description: bot.description,
      commandHint: bot.commandHint,
      category: bot.category,
      permissions: bot.permissions,
      icon: bot.icon,
      isDraft: bot.isDraft,
      agentConfig: bot.agentConfig,
    });

    const newBot: ChatBot = {
      ...bot,
      id: result.id,
      type: 'custom',
      creatorId: get().currentUser?.id ?? 'me',
      ownerId: get().currentUser?.id ?? 'me',
      status: result.status as ChatBot['status'],
      runtimeMode: result.runtimeMode,
    };

    set((state) => ({
      customBots: [...state.customBots, newBot],
      enabledBotIds: [...state.enabledBotIds, result.id],
    }));

    return result.id;
  },
  updateCustomBot: async (botId, updates) => {
    await updateCustomBotOnApi(botId, {
      name: updates.name,
      description: updates.description,
      commandHint: updates.commandHint,
      category: updates.category,
      permissions: updates.permissions,
      icon: updates.icon,
      isDraft: updates.isDraft,
      status: updates.status,
      runtimeMode: updates.runtimeMode,
      agentConfig: updates.agentConfig,
    });

    set((state) => ({
      customBots: state.customBots.map((b) =>
        b.id === botId && b.type === 'custom' ? { ...b, ...updates } : b
      ),
    }));
  },
  deleteCustomBot: async (botId) => {
    await deleteCustomBotOnApi(botId);

    set((state) => ({
      customBots: state.customBots.filter((b) => b.id !== botId),
      enabledBotIds: state.enabledBotIds.filter((id) => id !== botId),
      conversations: state.conversations.map((c) =>
        c.botIds?.includes(botId)
          ? { ...c, botIds: c.botIds.filter((id) => id !== botId) }
          : c
      ),
    }));
  },
  loadBotsFromApi: async () => {
    try {
      const [systemBots, customBots] = await Promise.all([
        fetchChatBotsFromApi(),
        fetchCustomBotsFromApi(),
      ]);

      set(() => ({
        availableChatBots: systemBots,
        customBots,
      }));
    } catch {
      // If API fails, keep existing persisted state as fallback
    }
  },
  providerConnections: [],
  loadProviderConnections: async () => {
    try {
      const connections = await fetchConnectionsFromApi();
      set({ providerConnections: connections });
    } catch {
      // Non-fatal
    }
  },
  createProviderConnection: async (input) => {
    const result = await createConnectionFromApi(input);
    set((state) => ({
      providerConnections: [...state.providerConnections, result.connection],
    }));
  },
  deleteProviderConnection: async (connectionId) => {
    const result = await deleteConnectionFromApi(connectionId);
    set((state) => ({
      providerConnections: state.providerConnections.filter((c) => c.id !== connectionId),
    }));
    return result.affectedAgents;
  },
  reverifyProviderConnection: async (connectionId) => {
    const result = await reverifyConnectionFromApi(connectionId);
    set((state) => ({
      providerConnections: state.providerConnections.map((c) =>
        c.id === connectionId ? result.connection : c
      ),
    }));
  },
  agentRuns: [],
  loadAgentRuns: async (params) => {
    try {
      const runs = await fetchAgentRunsFromApi(params);
      set({ agentRuns: runs });
    } catch {
      // Non-fatal
    }
  },
  cancelAgentRun: async (runId) => {
    await cancelAgentRunFromApi(runId);
    set((state) => ({
      agentRuns: state.agentRuns.map((r) =>
        r.id === runId ? { ...r, status: 'cancelled' as const } : r
      ),
    }));
  },
  playgroundResult: null,
  playgroundLoading: false,
  runPlayground: async (botId, message, conversationContext) => {
    set({ playgroundLoading: true });
    try {
      const result = await runPlaygroundFromApi(botId, message, conversationContext);
      set({ playgroundResult: result, playgroundLoading: false });
    } catch (error) {
      set({ playgroundLoading: false });
      throw error;
    }
  },
  clearPlayground: () => {
    set({ playgroundResult: null });
  },
  pendingApprovals: [],
  loadPendingApprovals: async () => {
    try {
      const approvals = await fetchPendingApprovalsFromApi();
      set({ pendingApprovals: approvals });
    } catch {
      // Non-fatal
    }
  },
  approveRequest: async (approvalId, editedArguments) => {
    await approveRequestFromApi(approvalId, editedArguments);
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter((a) => a.id !== approvalId),
    }));
  },
  rejectRequest: async (approvalId) => {
    await rejectRequestFromApi(approvalId);
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter((a) => a.id !== approvalId),
    }));
  },
  botVersions: {},
  publishBot: async (botId, publishNotes) => {
    const result = await publishBotFromApi(botId, publishNotes);
    // Update the bot's draft status in the store
    set((state) => ({
      customBots: state.customBots.map((b) =>
        b.id === botId ? { ...b, isDraft: false } : b
      ),
    }));
    // Reload versions
    await get().loadBotVersions(botId);
    return { versionId: result.versionId, versionNumber: result.versionNumber };
  },
  loadBotVersions: async (botId) => {
    try {
      const versions = await fetchBotVersionsFromApi(botId);
      set((state) => ({
        botVersions: {
          ...state.botVersions,
          [botId]: versions,
        },
      }));
    } catch {
      // Non-fatal
    }
  },
  rollbackBot: async (botId, versionId) => {
    await rollbackBotFromApi(botId, versionId);
    // Reload the bot and its versions
    await get().loadBotsFromApi();
    await get().loadBotVersions(botId);
  },
  conversationDeployments: {},
  loadConversationDeployments: async (conversationId) => {
    try {
      const deployments = await fetchConversationDeploymentsFromApi(conversationId);
      set((state) => ({
        conversationDeployments: {
          ...state.conversationDeployments,
          [conversationId]: deployments,
        },
      }));
    } catch {
      // Non-fatal — keep existing state
    }
  },
  clearConversationDeployments: (conversationId) => {
    set((state) => {
      const next = { ...state.conversationDeployments };
      delete next[conversationId];
      return { conversationDeployments: next };
    });
  },

  addMessageReaction: (conversationId, messageId, reaction) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          messages: conversation.messages.map((msg) => {
            if (msg.id !== messageId) return msg;
            const reactions = msg.reactions ? [...msg.reactions] : [];
            const existing = reactions.find((r) => r.emoji === reaction);
            const currentUserId = state.currentUser?.id ?? 'me';
            if (existing) {
              if (!existing.userIds.includes(currentUserId)) {
                existing.userIds.push(currentUserId);
              }
            } else {
              reactions.push({ emoji: reaction, userIds: [currentUserId] });
            }
            return { ...msg, reactions };
          }),
        };
      }),
    }));
    // P0.9: Persist the reaction to the backend. Fire-and-forget — on error
    // we log but do NOT roll back the optimistic mutation; the next sync
    // reconciles authoritative state.
    void addMessageReactionOnApi(conversationId, messageId, reaction).catch((error) => {
      console.warn('[store] addMessageReaction API failed', { conversationId, messageId, reaction, error });
    });
  },
  removeMessageReaction: (conversationId, messageId, reaction) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          messages: conversation.messages.map((msg) => {
            if (msg.id !== messageId || !msg.reactions) return msg;
            const currentUserId = state.currentUser?.id ?? 'me';
            return {
              ...msg,
              reactions: msg.reactions
                .map((r) =>
                  r.emoji === reaction
                    ? { ...r, userIds: r.userIds.filter((id) => id !== currentUserId) }
                    : r
                )
                .filter((r) => r.userIds.length > 0),
            };
          }),
        };
      }),
    }));
    // P0.9: Persist the removal to the backend. Fire-and-forget — on error
    // we log but do NOT roll back the optimistic mutation; the next sync
    // reconciles authoritative state.
    void removeMessageReactionOnApi(conversationId, messageId, reaction).catch((error) => {
      console.warn('[store] removeMessageReaction API failed', { conversationId, messageId, reaction, error });
    });
  },

  userAvatar: null,
  userCover: null,
  profileMediaOverrides: {},
  hydrateProfileMediaOverrides: (overrides) =>
    set({
      profileMediaOverrides: overrides,
    }),
  setProfileMediaOverride: (userId, updates) =>
    set((state) => {
      const normalizedUserId = userId.trim();
      if (!normalizedUserId) {
        return state;
      }

      const existing = state.profileMediaOverrides[normalizedUserId] ?? {
        avatar: null,
        cover: null,
      };

      return {
        profileMediaOverrides: {
          ...state.profileMediaOverrides,
          [normalizedUserId]: {
            ...existing,
            ...updates,
          },
        },
      };
    }),
  updateUserAvatar: (uri) =>
    set((state) => {
      const userId = state.currentUser?.id;
      if (!userId) {
        return { userAvatar: uri };
      }
      const nextOverrides = { ...state.profileMediaOverrides };
      const existing = nextOverrides[userId] ?? { avatar: null, cover: null };
      nextOverrides[userId] = { ...existing, avatar: uri };
      return {
        userAvatar: uri,
        profileMediaOverrides: nextOverrides,
      };
    }),

  userLooks: [],
  addUserLook: (look) => {
    const id = makeStableId('look');
    const now = Date.now();
    set((state) => ({
      userLooks: [{ ...look, id, createdAt: now }, ...state.userLooks],
    }));
    return id;
  },
  removeUserLook: (id) =>
    set((state) => ({
      userLooks: state.userLooks.filter((l) => l.id !== id),
    })),
  toggleUserLookLike: (lookId) =>
    set((state) => {
      const likedSet = new Set<string>(state.__likedLooks ?? []);
      if (likedSet.has(lookId)) {
        likedSet.delete(lookId);
      } else {
        likedSet.add(lookId);
      }
      return { __likedLooks: Array.from(likedSet) };
    }),
  isUserLookLiked: (lookId) => {
    const likedSet = new Set<string>(get().__likedLooks ?? []);
    return likedSet.has(lookId);
  },

  updateUserCover: (uri) =>
    set((state) => {
      const userId = state.currentUser?.id;
      if (!userId) {
        return { userCover: uri };
      }
      const nextOverrides = { ...state.profileMediaOverrides };
      const existing = nextOverrides[userId] ?? { avatar: null, cover: null };
      nextOverrides[userId] = { ...existing, cover: uri };
      return {
        userCover: uri,
        profileMediaOverrides: nextOverrides,
      };
    }),

  outfits: [],
  addOutfit: (outfit) =>
    set((state) => ({
      outfits: [outfit, ...state.outfits],
    })),
  removeOutfit: (id) =>
    set((state) => ({
      outfits: state.outfits.filter((o) => o.id !== id),
    })),

  createSheetVisible: false,
  setCreateSheetVisible: (visible) => set({ createSheetVisible: visible }),
}),
    {
      name: 'thryftverse-store',
      storage: createJSONStorage(() => ({
        getItem: (name: string): string | null => {
          const raw = appStorage.getString(name);
          return raw === undefined ? null : raw;
        },
        setItem: (name: string, value: string): void => {
          appStorage.set(name, value);
        },
        removeItem: (name: string): void => {
          appStorage.remove(name);
        },
      })),
      version: 4,
      migrate: (persistedState, version) => {
        let state = { ...(persistedState as Partial<StoreState>) };
        if (version < 2 && ENABLE_RUNTIME_MOCKS && state.conversations) {
          state = {
            ...state,
            conversations: state.conversations.map((conversation) => {
              if (conversation.participantProfiles?.length) return conversation;
              const canonicalMock = MOCK_CONVERSATIONS.find((item) => item.id === conversation.id);
              return canonicalMock?.participantProfiles?.length
                ? { ...conversation, participantProfiles: canonicalMock.participantProfiles }
                : conversation;
            }),
          };
        }
        if (version < 3) {
          delete state.savedPaymentMethod;
        }
        // v4: migrate quick replies from string[] to QuickReply[]
        if (version < 4) {
          const migrateReplies = (replies: unknown): QuickReply[] => {
            if (!Array.isArray(replies)) return [];
            return replies.map((item, i) => {
              if (typeof item === 'string') {
                return { id: `qr-migrated-${i}-${Date.now()}`, title: item.slice(0, 30), message: item };
              }
              return item as QuickReply;
            });
          };
          state = {
            ...state,
            sellerQuickReplies: migrateReplies(state.sellerQuickReplies),
            buyerQuickReplies: migrateReplies(state.buyerQuickReplies),
          };
        }
        return state;
      },
      partialize: (state) => ({
        // Only persist user-critical data, not transient UI state
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        wishlist: state.wishlist,
        savedProducts: state.savedProducts,
        collections: state.collections,
        seenPosterIds: state.seenPosterIds,
        savedPosterStoryIds: state.savedPosterStoryIds,
        customPosters: state.customPosters,
        conversations: state.conversations,
        savedSearches: state.savedSearches,
        savedAddress: state.savedAddress,
        // Provider-backed payment methods are rehydrated after authentication.
        // Persisting this projection could resurrect a detached legacy card.
        twoFactorEnabled: state.twoFactorEnabled,
        notificationCount: state.notificationCount,
        userAvatar: state.userAvatar,
        userCover: state.userCover,
        profileMediaOverrides: state.profileMediaOverrides,
        sellDraft: state.sellDraft,
        accountPreferences: state.accountPreferences,
        paymentPreferences: state.paymentPreferences,
        postagePreferences: state.postagePreferences,
        personalisationPreferences: state.personalisationPreferences,
        blockedUsers: state.blockedUsers,
        mutedConversationIds: state.mutedConversationIds,
        readReceiptsEnabled: state.readReceiptsEnabled,
        allowMessagesFrom: state.allowMessagesFrom,
        archivedConversationIds: state.archivedConversationIds,
        messageRequests: state.messageRequests,
        offersInChatEnabled: state.offersInChatEnabled,
        orderUpdatesInChatEnabled: state.orderUpdatesInChatEnabled,
        sellerQuickReplies: state.sellerQuickReplies,
        buyerQuickReplies: state.buyerQuickReplies,
        enabledBotIds: state.enabledBotIds,
        customBots: state.customBots,
        supportTickets: state.supportTickets,
        outfits: state.outfits,
      }),
    },
  ),
);

/**
 * Guest mode selector — returns true when the user is not authenticated
 * (no currentUser and isAuthenticated is false). Used by the tab navigator,
 * HomeScreen, SellScreen, and other surfaces to gate account-bound actions
 * behind the soft signup wall while allowing browse-only access.
 */
export function useIsGuest(): boolean {
  return useStore((s) => !s.currentUser && !s.isAuthenticated);
}
