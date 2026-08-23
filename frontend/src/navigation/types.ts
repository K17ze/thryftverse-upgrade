import type { NavigatorScreenParams } from '@react-navigation/native';
import type {
  NativeStackScreenProps as RNNativeStackScreenProps,
  NativeStackNavigationProp as RNNativeStackNavigationProp,
} from '@react-navigation/native-stack';

// ---------------------------------------------------------------------------
// Navigator migration: @react-navigation/stack → @react-navigation/native-stack
// ---------------------------------------------------------------------------
// AppNavigator now uses createNativeStackNavigator. The navigator passes
// NativeStackNavigationProp to every screen at runtime.
//
// ~100 screen files still import StackScreenProps / StackNavigationProp from
// '@react-navigation/stack'. Those types are structurally similar but NOT
// identical to the native-stack equivalents. The @react-navigation/stack
// package remains installed so those imports continue to resolve.
//
// During the incremental migration, screens should switch their imports to
// the aliases below. See docs/NAVIGATOR_MIGRATION_PLAN.md for the full plan.
// ---------------------------------------------------------------------------

/** Drop-in replacement for StackScreenProps from @react-navigation/stack. */
export type NativeStackScreenProps<ParamList extends Record<string, any | undefined>, RouteName extends keyof ParamList = keyof ParamList> =
  RNNativeStackScreenProps<ParamList, RouteName>;

/** Drop-in replacement for StackNavigationProp from @react-navigation/stack. */
export type NativeStackNavigationProp<ParamList extends Record<string, any | undefined>, RouteName extends keyof ParamList = keyof ParamList> =
  RNNativeStackNavigationProp<ParamList, RouteName>;

// ---------------------------------------------------------------------------
// Creator initial media acquisition payload (P0.1)
// ---------------------------------------------------------------------------
// A typed, source-agnostic description of media acquired at the entry point
// (camera capture, ImagePicker multi-select, etc.) and passed into the
// CreatorStudio route. Every selected asset is preserved in deterministic
// order with its kind, dimensions and (for video) duration in milliseconds.
export type CreatorInitialMedia = {
  id: string;
  uri: string;
  kind: 'image' | 'video';
  width?: number;
  height?: number;
  /** Video duration in milliseconds (normalized at the boundary). */
  durationMs?: number;
  mimeType?: string;
  /**
   * Playback speed multiplier captured with the camera speed-mode selector.
   * Native speed control is supported via react-native-vision-camera's fps parameter.
   * The speed is applied at playback time by the timeline/export engine.
   * Values: 0.3 (slow), 1, 2, 3 (fast).
   * @default 1
   */
  speed?: number;
  /**
   * Green-screen metadata. When present, the clip was captured with a
   * background-replacement intent. Real-time chroma keying is supported
   * via vision-camera's Skia frame processors. The background image URI
   * and key parameters are preserved so the timeline can re-render the
   * composite.
   */
  greenScreen?: {
    backgroundUri: string;
    /** Key color as a hex string (e.g. '#00ff00' for green). */
    keyColor: string;
    /** Chroma key tolerance 0–1 (how far from the key color to mask). */
    tolerance: number;
    /** Edge feather 0–1 (softness of the mask boundary). */
    feather: number;
  };
  /**
   * Camera effect selected at capture time. Real-time color matrix filters
   * are supported via vision-camera's Skia frame processors. Values match the
   * CameraEffectId type: 'vintage', 'noir', 'vivid', 'warm', 'cool',
   * 'fade'. Absent when 'none' (no effect).
   */
  cameraEffect?: string;
};

// ---------------------------------------------------------------------------
// Creator acquisition result (Phase 2 — Poster vs Look semantic model)
// ---------------------------------------------------------------------------
// A typed, semantic description of what the user acquired at the entry point.
// Poster multi-selection creates pages (frames), not layers. Look
// multi-selection creates layers on one page (collage). Single media is the
// backward-compatible path for camera capture and legacy callers.
export type CreatorAcquisitionResult =
  | { mode: 'poster_frames'; media: CreatorInitialMedia[] }
  | { mode: 'look_layers'; media: CreatorInitialMedia[] }
  | { mode: 'single_media'; media: CreatorInitialMedia };

export type RootStackParamList = {
  // ── Auth & Onboarding ──
  // Age gate — shown before onboarding/auth on first launch (18+ marketplace).
  AgeVerification: undefined;
  Onboarding: undefined;
  AuthLanding: undefined;
  Login: undefined;
  SignUp: undefined;

  // ── Main Tabs ──
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;

  // ── Commerce ──
  CategoryDetail: { categoryId: string };
  Browse: {
    categoryId: string;
    subcategoryId?: string;
    title: string;
    searchQuery?: string;
  };
  ItemDetail: {
    itemId: string;
    /** Source feed section (e.g. 'for_you', 'following', 'browse', 'search'). */
    sectionKey?: string;
    /** Position of the item in the source feed (0-indexed). */
    position?: number;
    /** Algorithmic reason code for why the item was shown. */
    reasonCode?: string;
    /** Whether the item was personalised to the user. */
    personalised?: boolean;
  };
  Closet: undefined;

  // ── Creator Studio ──
  PosterViewer: { storyId: string; startFrameIndex?: number };
  CreatePoster: { mode?: 'poster' | 'look' } | undefined;
  PosterStoryActivity: { storyId: string };
  PosterArchive: undefined;
  PosterHighlightViewer: { highlightId: string };
  CreatePosterHighlight: { storyId?: string; frameIds?: string[] } | undefined;

  // ── Auctions & Trading ──
  AuctionHome: undefined;
  Auctions: undefined;
  SellerAuctionCentre: undefined;
  CreateAuction: { listingId?: string } | undefined;
  AuctionDetail: {
    auctionId: string;
    /** Auto-open the BidSheet on arrival (e.g. from an outbid notification) */
    openBidSheet?: boolean;
    /** Pre-fill the bid input with this amount (GBP) */
    initialBidAmount?: number;
  };

  // ── Co-Own / Syndicate ──
  CreateCoOwn:
    | {
        listingId?: string;
        totalUnits?: number;
        unitPriceDisplay?: number;
        offeringWindowHours?: number;
        authPhotos?: string[];
      }
    | undefined;
  MarketLedger: undefined;
  CoOwnHub: {
    initialSegment?: 'active' | 'new_issues' | 'watchlist';
  } | undefined;
  AssetDetail: { assetId: string };
  AssetDueDiligence: { assetId: string };
  Trade: { assetId: string; side: 'buy' | 'sell'; limitPrice?: number };
  Portfolio: undefined;
  CoOwnOrderHistory: undefined;
  AssetLeaderboard: undefined;
  Buyout: { assetId: string };
  CoOwnOnboarding: undefined;
  CorporateActionDetail: {
    assetId: string;
    actionType: string;
    dateLabel: string;
    effectLabel: string;
    amountLabel?: string;
    status: string;
    recordDateLabel?: string;
    paymentDateLabel?: string;
    actionId?: string;
  };
  DistributionHistory: { assetId?: string } | undefined;

  // ── Chat & Messaging ──
  Inbox: undefined;
  Chat: {
    conversationId: string;
    focusQuery?: string;
    partnerUserId?: string;
    itemId?: string;
    /** Offer metadata to attach when navigating from MakeOfferScreen */
    offerPayload?: {
      /** Server-authoritative offer id from POST /listings/:id/offers */
      offerId?: string;
      price: number;
      originalPrice: number;
      expiresAt: string;
      counterRound: number;
    };
  };
  CreateGroupChat: undefined;
  GroupChat: { groupId: string; groupName: string };
  GroupChatInfo: { conversationId: string };
  GroupMembers: { conversationId: string };
  GroupBotManagement: { conversationId: string };
  BotDirectory: undefined;
  BotDetail: { botId: string; conversationId?: string };
  CustomBots: undefined;
  BotBuilder: { botId?: string };
  EditGroup: { conversationId: string };

  // ── Social / Profile ──
  UserProfile: { userId: string };
  // Followers / following — full-screen people lists (spec 50)
  Followers: { userId: string };
  Following: { userId: string };
  // Unified followers/following list — mode determines which to show.
  ConnectionList: { userId: string; mode: 'followers' | 'following' };

  // ── Wallet & Payments ──
  Wallet: undefined;
  // Wallet V3 — focused money-movement destinations (spec 17)
  SellerEarnings: undefined;
  WalletConvert: undefined;
  WalletActivity: undefined;
  MyOrders: undefined;

  // ── Settings & Account ──
  Personalisation: undefined;
  Settings: undefined;
  EditProfile: { focus?: 'avatar' | 'cover' };
  AccountSettings: undefined;
  AccountControl: undefined;
  SavedAddresses: undefined;
  Payments: undefined;

  // ── Commerce ── (orders, offers, checkout, listings)
  // Phase 16 new screens
  MakeOffer: { itemId: string; price: number; title: string; counterOffer?: boolean; previousOffer?: number; counterRound?: number; parentOfferId?: string };
  PushNotifications: undefined;
  Postage: undefined;
  InviteFriends: undefined;
  BalanceHistory: undefined;
  // Phase 17 new screens
  AddBankAccount: undefined;
  HelpSupport: undefined;
  // Phase 18 new screens
  OrderDetail: { orderId: string };
  SellerFulfilment: { orderId: string };
  OrderReceipt: { orderId: string };
  // Phase 19 new screens
  Checkout: { itemId: string };
  AddressForm:
    | {
        mode: 'add' | 'edit';
        source?: 'postage' | 'checkout';
      }
    | undefined;
  Success: { orderId: string };
  ManageListing: { itemId: string };
  EditListing: { itemId: string };
  Withdraw: undefined;
  CategoryTree: { categoryPrefix: string };
  // Phase 24 new screens
  GlobalSearch: undefined;
  // Collections feature
  CollectionDetail: { collectionId: string };
  // Phase 25 new screens
  Filter:
    | {
        categoryId?: string;
        title?: string;
        subcategoryId?: string;
      }
    | undefined;
  ListingSuccess:
    | {
        listingId?: string;
        title?: string;
        price?: number;
        categoryId?: string;
        photoUri?: string;
        smartSellEnabled?: boolean;
      }
    | undefined;

  // ── Settings & Account ── (notifications, security)
  // Phase 27
  NotificationsList: undefined;
  // Phase 28
  ForgotPassword: undefined;
  ChangePassword: undefined;
  TwoFactorSetup: undefined;
  WriteReview: { orderId: string; initialRating?: number };

  // ── Support & Help ──
  Report: { type: 'item' | 'user'; targetId?: string };

  // ── Auctions & Trading ──
  MyBids: undefined;

  // ── Seller Tools ──
  MyListings: { type?: 'coown' | 'auction' | 'standard' } | undefined;
  SavedSearches: undefined;

  // ── Creator Studio ── (looks, camera, studio, outfits, explore)
  // Explore / Creator screens
  CreateLook: undefined;
  CreateCamera: { mode?: 'visual-search' | 'look' | 'poster' } | undefined;
  CreatorStudio: {
    type: 'look' | 'poster';
    draftId?: string;
    templateId?: string;
    sourceDocumentId?: string;
    sourceMode?: 'edit' | 'remix';
    /**
     * Backward-compatible single-asset entry point (camera capture, legacy
     * callers). Prefer `initialMedia` for multi-asset acquisition.
     */
    initialMediaUri?: string;
    /**
     * Typed multi-asset acquisition payload. When present, every asset is
     * seeded as a media layer in deterministic order, preserving kind,
     * dimensions and video duration.
     */
    initialMedia?: CreatorInitialMedia[];
    startBlank?: boolean;
    openTemplates?: boolean;
    /**
     * Signal to show the CreatorEntryScreen (camera/gallery) overlay on
     * open. Used by the Create tab action and the CreateCamera redirect so
     * the user lands in the in-studio capture surface instead of a blank
     * composer.
     */
    openEntry?: boolean;
  };
  VisualSearch: { initialImageUri?: string } | undefined;
  CreatorDraftList: undefined;
  CoOwnIssue: { assetId?: string };
  OutfitBuilder: undefined;
  // UI-22R.6B — Experience elevation
  LookDetail: { lookId: string };
  PulseFeed: undefined;
  ExploreCollection: {
    title: string;
    subtitle?: string;
    source:
      | { type: 'category'; categoryId: string }
      | { type: 'brand'; brand: string }
      | { type: 'price_drop' }
      | { type: 'newest' }
      | { type: 'saved_affinity' }
      | { type: 'auction' };
  };
  StyleQuiz: undefined;

  // ── Settings & Account ── (chat settings, sessions, privacy, about)
  // Phase 13 — Settings integrity
  ChatSettings: undefined;
  ActiveSessions: undefined;
  BlockedUsers: undefined;
  PrivacySettings: undefined;
  About: undefined;
  MutedConversations: undefined;
  ArchivedConversations: undefined;
  ManageQuickReplies: { role: 'seller' | 'buyer' };

  // ── Chat & Messaging ── (conversations, messages, media)
  // VISUAL-15 — UI Architecture + Feature Depth
  ConversationInfo: { conversationId: string };
  MessageRequests: undefined;
  NewMessage:
    | { preselectedUserId?: string; preselectedDisplayName?: string }
    | undefined;
  SharedConversationMedia: { conversationId: string };

  // ── Commerce ── (collections)
  ManageCollectionItems: { collectionId: string };
  CreateCollection: undefined;

  // ── Support & Help ── (order support, buyer protection)
  OrderSupport: { orderId: string; categoryId?: string; categoryLabel?: string };
  BuyerProtection: { orderId: string };

  // ── Settings & Account ── (connected accounts, accessibility, co-own prefs)
  ConnectedAccounts: undefined;
  EmailNotifications: undefined;
  AccessibilitySettings: undefined;

  // ── Co-Own / Syndicate ── (price alerts, tax, recurring orders)
  CoOwnPriceAlerts: undefined;
  CoOwnTaxDocuments: undefined;
  CoOwnRecurringOrders: undefined;

  // ── Chat & Messaging ── (media preview)
  ChatMediaPreview: { mediaUri: string; mediaType?: 'image' | 'video'; senderLabel?: string; timestamp?: string; messageId?: string };

  // ── Commerce ── (collection editing)
  // UI-18 — Reference-perfect product UX
  EditCollection: { collectionId: string };

  // ── Support & Help ── (tickets, resolution centre)
  SupportTicketDetail: { ticketId: string };
  ResolutionCentre: undefined;

  // ── Seller Tools ── (listing preview)
  // UI-19 — Sell / Co-own / Chat marketplace UX
  ListingPreview: {
    preview: {
      title?: string;
      price?: number;
      originalPrice?: number;
      brand?: string;
      condition?: string;
      category?: string;
      size?: string;
      description?: string;
      photos: string[];
      shippingMethod?: string;
      shippingPayer?: string;
      listingMode?: 'sell_now' | 'auction' | 'co_own';
    };
    origin?: 'sell' | 'edit';
  };
  TradeConfirm: {
    assetId: string;
    assetTitle?: string;
    assetImageUrl?: string | null;
    side: 'buy' | 'sell';
    quantity: number;
    totalValue: number;
    fee: number;
    netValue: number;
    orderMode: 'limit';
    ticketOrderType: 'protected_instant' | 'limit';
    limitPriceGbp: number;
    averageFillPriceGbp: number;
    worstPriceGbp: number;
    estimatedFilledUnits: number;
    estimatedRemainingUnits: number;
    reservationId: string;
    reservationExpiresAt: string;
    previewValidUntil: string;
    maxReserved1ze: number;
    marketDataTimestamp: string;
  };

  // ── Auctions & Trading ── (trade confirm)
  // Diagnostic — dev only
  RuntimeSmokeTest: undefined;

  // ── Seller Tools ── (sell, trade hub, seller hub, analytics, verification)
  Sell: undefined;
  TradeHub: { destination?: 'auction' | 'co_own' } | undefined;
  // GDPR — Account deletion & data export
  DeleteAccount: undefined;
  DataExport: undefined;
  // Trust & Verification
  Verification: undefined;
  VerificationStatus: undefined;
  // Seller analytics (entry via MyListings)
  SellerAnalytics: undefined;
  // Seller Hub — unified seller management dashboard
  SellerHub: undefined;
  // Creator analytics — creator-side performance insights (views, engagement, timeline)
  CreatorAnalyticsDashboard: undefined;
  BundleBag: { sellerId: string; sellerName?: string } | undefined;
  // Seller verification response — sellers view and respond to Co-Own verification demands
  SellerVerification: undefined;
  VerificationResponse: { assetId: string; demandId: number } | undefined;

  // ── Live Shopping ──
  // Live shopping — Whatnot/Tilt-style live commerce
  LiveShopping: undefined;
  // Live stream viewer — watch + bid + chat
  LiveStreamViewer: { sessionId: string };
  // Live stream seller — broadcast + manage lots
  LiveStreamSeller: { sessionId?: string };

  // ── Seller Tools ── (AI listing, bulk, inventory, KYC)
  AIPoweredListing: undefined;
  // Pro seller tools
  BulkListing: undefined;
  // Inventory management — full seller inventory dashboard
  InventoryManagement: undefined;
  // Full KYC verification flow — multi-step identity verification
  KYCVerification: undefined;

  // ── Discovery & Editorial ── (galleria, algorithm, moodboards, AI search)
  // Galleria — editorial discovery surface for Co-Own assets & curated collections
  Galleria: undefined;
  GalleriaCollectionDetail: { collectionId: string };
  // Algorithm transparency — "Your Algorithm" dashboard
  YourAlgorithm: undefined;
  // AI photo enhancement — Photoroom-equivalent editing surface
  AIPhotoEnhancement: { imageUri: string; itemId?: string };
  // Conversational AI search — natural language search
  ConversationalSearch: undefined;
  // Moodboard — user-generated editorial collage tools
  MoodboardHome: undefined;
  MoodboardEditor: { moodboardId?: string };

  // ── Settings & Account ── (AI prefs, sustainability, data privacy, notifications)
  // Settings sub-departments — 2026 settings enhancement
  AIPreferences: undefined;
  SustainabilityPreferences: undefined;
  DataPrivacy: undefined;
  NotificationPreferences: undefined;
  // AI provider API integration — bring-your-own-key for OpenAI / Anthropic / Gemini / custom
  AIAgentIntegration: undefined;
  // Agent activity ledger — transparent record of agent actions and approvals
  AgentActivity: undefined;
};

// ── Per-tab stack param lists ──
// Each tab wraps a native-stack navigator so tab switches preserve per-tab
// navigation history. Screens that are shared across tabs (ItemDetail, Chat,
// Checkout, etc.) remain in the root stack for cross-tab navigation.

export type HomeTabParamList = {
  Home: undefined;
  PulseFeed: undefined;
  ExploreCollection: RootStackParamList['ExploreCollection'];
  LookDetail: RootStackParamList['LookDetail'];
  Galleria: undefined;
  GalleriaCollectionDetail: RootStackParamList['GalleriaCollectionDetail'];
  MoodboardHome: undefined;
  YourAlgorithm: undefined;
  StyleQuiz: undefined;
  ConversationalSearch: undefined;
};

export type ExploreTabParamList = {
  Explore: undefined;
  GlobalSearch: undefined;
  CategoryDetail: RootStackParamList['CategoryDetail'];
  CategoryTree: RootStackParamList['CategoryTree'];
  Browse: RootStackParamList['Browse'];
  Filter: RootStackParamList['Filter'];
  SavedSearches: undefined;
  CollectionDetail: RootStackParamList['CollectionDetail'];
};

export type InboxTabParamList = {
  Inbox: undefined;
};

export type ProfileTabParamList = {
  Profile: undefined;
  EditProfile: RootStackParamList['EditProfile'];
  Settings: undefined;
  AccountSettings: undefined;
  AccountControl: undefined;
  DeleteAccount: undefined;
  DataExport: undefined;
  Personalisation: undefined;
  SavedAddresses: undefined;
  Payments: undefined;
  NotificationsList: undefined;
  PushNotifications: undefined;
  ChangePassword: undefined;
  TwoFactorSetup: undefined;
  HelpSupport: undefined;
  ConnectedAccounts: undefined;
  EmailNotifications: undefined;
  AccessibilitySettings: undefined;
  AIPreferences: undefined;
  SustainabilityPreferences: undefined;
  DataPrivacy: undefined;
  NotificationPreferences: undefined;
  AIAgentIntegration: undefined;
  AgentActivity: undefined;
  ChatSettings: undefined;
  ActiveSessions: undefined;
  BlockedUsers: undefined;
  PrivacySettings: undefined;
  About: undefined;
  MutedConversations: undefined;
  ArchivedConversations: undefined;
  ManageQuickReplies: RootStackParamList['ManageQuickReplies'];
  Closet: undefined;
  Verification: undefined;
  VerificationStatus: undefined;
  SellerVerification: undefined;
  KYCVerification: undefined;
};

// ── Main Tabs ──
export type TabParamList = {
  Home: NavigatorScreenParams<HomeTabParamList> | undefined;
  Explore: NavigatorScreenParams<ExploreTabParamList> | undefined;
  Create: undefined;
  Inbox: NavigatorScreenParams<InboxTabParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileTabParamList> | undefined;
};
