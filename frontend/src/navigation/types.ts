import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  AuthLanding: undefined;
  Login: undefined;
  SignUp: undefined;
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  CategoryDetail: { categoryId: string };
  Browse: {
    categoryId: string;
    subcategoryId?: string;
    title: string;
    searchQuery?: string;
  };
  ItemDetail: { itemId: string };
  Closet: undefined;
  PosterViewer: { storyId: string; startFrameIndex?: number };
  CreatePoster: undefined;
  PosterStoryActivity: { storyId: string };
  PosterArchive: undefined;
  PosterHighlightEditor: { highlightId?: string };
  CreateAuction: { listingId?: string } | undefined;
  AuctionDetail: { auctionId: string };
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
  CoOwnHub: undefined;
  AssetDetail: { assetId: string };
  Trade: { assetId: string; side: 'buy' | 'sell' };
  Portfolio: undefined;
  CoOwnOrderHistory: undefined;
  AssetLeaderboard: undefined;
  Buyout: { assetId: string };
  CoOwnOnboarding: undefined;
  Chat: {
    conversationId: string;
    focusQuery?: string;
    partnerUserId?: string;
    itemId?: string;
  };
  CreateGroupChat: undefined;
  GroupBotDirectory: { conversationId: string };
  GroupChatInfo: { conversationId: string };
  GroupMembers: { conversationId: string };
  GroupBotManagement: { conversationId: string };
  BotDirectory: undefined;
  BotDetail: { botId: string; conversationId?: string };
  CustomBots: undefined;
  BotBuilder: { botId?: string };
  EditGroup: { conversationId: string };
  UserProfile: { userId: string; isMe?: boolean };
  // Profile sub-screens
  Balance: undefined;
  Wallet: undefined;
  MyOrders: undefined;
  Personalisation: undefined;
  Settings: undefined;
  EditProfile: undefined;
  AccountSettings: undefined;
  Payments: undefined;
  // Phase 16 new screens
  MakeOffer: { itemId: string; price: number; title: string };
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
      }
    | undefined;
  // Phase 27
  NotificationsList: undefined;
  // Phase 28
  ForgotPassword: undefined;
  VisualSearch: undefined;
  ChangePassword: undefined;
  TwoFactorSetup: undefined;
  WriteReview: { orderId: string };
  Report: { type: 'item' | 'user' };
  MyBids: undefined;
  MyListings: { type?: 'coown' | 'auction' | 'standard' } | undefined;
  // Explore / Creator screens
  CreateLook: undefined;
  CreatorStudio: {
    type: 'look' | 'poster';
    draftId?: string;
    templateId?: string;
    sourceDocumentId?: string;
  };
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
  // Phase 13 — Settings integrity
  ChatSettings: undefined;
  ActiveSessions: undefined;
  BlockedUsers: undefined;
  PrivacySettings: undefined;
  About: undefined;
  // VISUAL-15 — UI Architecture + Feature Depth
  ConversationInfo: { conversationId: string };
  MessageRequests: undefined;
  NewMessage:
    | { preselectedUserId?: string; preselectedDisplayName?: string }
    | undefined;
  SharedConversationMedia: { conversationId: string };
  ManageCollectionItems: { collectionId: string };
  CreateCollection: undefined;
  OrderSupport: { orderId: string };
  ChatMediaPreview: { mediaUri: string; mediaType?: 'image' | 'video'; senderLabel?: string; timestamp?: string; messageId?: string };
  // UI-18 — Reference-perfect product UX
  EditCollection: { collectionId: string };
  SupportTicketDetail: { ticketId: string };
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
    };
    origin?: 'sell' | 'edit';
  };
  TradeConfirm: {
    assetId: string;
    side: 'buy' | 'sell';
    quantity: number;
    totalValue: number;
    fee: number;
    netValue: number;
    orderMode: 'market' | 'limit';
    limitPriceGbp?: number;
  };
  // Diagnostic — dev only
  RuntimeSmokeTest: undefined;
};

export type TabParamList = {
  Home: undefined;
  TradeHub: undefined;
  Search: undefined;
  Sell: undefined;
  Inbox: undefined;
  Profile: undefined;
};