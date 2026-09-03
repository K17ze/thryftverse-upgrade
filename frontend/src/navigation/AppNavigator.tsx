import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainerRefContext } from '@react-navigation/native';
import type { NavigationState } from '@react-navigation/routers';
import { RootStackParamList, ROOT_STACK_ROUTES } from './types';
import { Radius } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../theme/ThemeContext';
import { isOnboardingComplete } from '../screens/OnboardingScreen';
import { isAgeVerified } from '../screens/AgeVerificationScreen';
import { InAppNotificationCenter } from '../components/notifications/InAppNotificationCenter';
import { CommandPalette } from '../components/CommandPalette';
import {
  registerRecentScreen,
  useCommandPaletteStore,
} from '../hooks/useCommandPalette';
import {
  loadNavigationState,
  saveNavigationState,
  clearNavigationState,
} from './navigationPersistence';

// Eager — initial routes needed immediately at startup.
// AuthLandingScreen is the initial route when unauthenticated;
// TabNavigator (MainTabs) is the initial route when authenticated.
import AuthLandingScreen from '../screens/AuthLandingScreen';
import TabNavigator from './TabNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

// native-stack: horizontal push is the default presentation.
// gestureEnabled keeps iOS swipe-back. No transitionSpec needed —
// native UINavigationController/Fragment handles transitions.
const pushScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
};

// native-stack: presentation: 'modal' maps to native modal presentation
// (slide-from-bottom on iOS, bottom-sheet-style on Android).
// gestureEnabled keeps swipe-to-dismiss. No transitionSpec needed.
const modalScreenOptions = {
  presentation: 'modal' as const,
  gestureEnabled: true,
};

// native-stack: transparentModal provides overlay automatically.
// cardStyle → contentStyle. animationEnabled: false → animation: 'none'.
const formSheetScreenOptions = {
  presentation: Platform.select({
    ios: 'formSheet' as const,
    android: 'modal' as const,
    default: 'modal' as const,
  }),
  gestureEnabled: true,
};

export default function AppNavigator() {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const biometricLoginPending = useStore((state) => state.biometricLoginPending);
  const storeOnboardingComplete = useStore((state) => state.hasCompletedOnboarding);
  // Onboarding is a first-run gate that sits ahead of auth. The persisted
  // store flag lets returning users skip the AsyncStorage round-trip; for
  // first-launch users we still confirm against AsyncStorage (the
  // authoritative source) before showing the onboarding screen.
  const [onboardingChecked, setOnboardingChecked] = React.useState(storeOnboardingComplete);
  const [needsOnboarding, setNeedsOnboarding] = React.useState(!storeOnboardingComplete);
  // Age verification gate — checked ahead of onboarding. Persisted in
  // SecureStore (see AgeVerificationScreen) so returning users skip it.
  const [ageCheckChecked, setAgeCheckChecked] = React.useState(false);
  const [needsAgeVerification, setNeedsAgeVerification] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    isAgeVerified().then((verified) => {
      if (mounted) {
        setNeedsAgeVerification(!verified);
        setAgeCheckChecked(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (storeOnboardingComplete) return; // store already says complete
    let mounted = true;
    isOnboardingComplete().then((complete) => {
      if (mounted) {
        setNeedsOnboarding(!complete);
        setOnboardingChecked(true);
      }
    });
    return () => { mounted = false; };
  }, [storeOnboardingComplete]);

  // Hooks must be called unconditionally — before any early return — to
  // satisfy the Rules of Hooks. All hooks below are called on every render
  // regardless of whether the age/onboarding checks have completed.
  const navigationContainerRef = React.useContext(NavigationContainerRefContext);
  const restoredRef = React.useRef(false);

  // First-launch users see the age gate, then onboarding, before auth.
  // Returning users go straight to the auth/main entry point.
  // When biometric login is enabled and a session was restored from
  // SecureStore, the user must pass Face ID / Touch ID before MainTabs.
  const initialRoute = needsAgeVerification
    ? 'AgeVerification'
    : needsOnboarding
      ? 'Onboarding'
      : isAuthenticated
        ? biometricLoginPending
          ? 'BiometricLogin'
          : 'MainTabs'
        : 'AuthLanding';

  React.useEffect(() => {
    if (!ageCheckChecked || !onboardingChecked) return;
    if (!navigationContainerRef) return;

    const restore = () => {
      if (restoredRef.current || !navigationContainerRef.isReady()) return;
      const savedState = loadNavigationState();
      if (
        savedState &&
        Array.isArray(savedState.routes) &&
        savedState.routes.length > 0
      ) {
        const savedRootName = savedState.routes[0]?.name;
        if (savedRootName === initialRoute) {
          navigationContainerRef.resetRoot(savedState);
        }
      }
      restoredRef.current = true;
    };

    restore();

    const readyUnsub = navigationContainerRef.addListener('ready', restore);
    const stateUnsub = navigationContainerRef.addListener('state', () => {
      if (navigationContainerRef.isReady()) {
        const state: NavigationState = navigationContainerRef.getRootState();
        saveNavigationState(state);
      }
    });

    return () => {
      readyUnsub?.();
      stateUnsub?.();
    };
  }, [navigationContainerRef, initialRoute, ageCheckChecked, onboardingChecked]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      clearNavigationState();
      restoredRef.current = false;
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (!__DEV__) return;

    const checkRoutes = () => {
      if (!navigationContainerRef?.isReady()) return;
      const state = navigationContainerRef.getRootState();
      const registeredNames = new Set<string>(state.routeNames);
      const missing = ROOT_STACK_ROUTES.filter(
        (route) => !registeredNames.has(route),
      );
      if (missing.length > 0) {
        console.warn(
          '[Navigation] RootStack routes declared in RootStackParamList but not registered as <Stack.Screen> in AppNavigator:',
          missing,
        );
      }
    };

    // Run immediately if the navigator is already ready, otherwise
    // wait for the 'ready' event before checking.
    checkRoutes();
    const readyUnsub = navigationContainerRef?.addListener('ready', checkRoutes);
    return () => {
      readyUnsub?.();
    };
  }, [navigationContainerRef]);

  if (!ageCheckChecked || !onboardingChecked) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
    <Stack.Navigator
      key={isAuthenticated ? 'authenticated' : 'anonymous'}
      initialRouteName={initialRoute}
      screenOptions={pushScreenOptions}
      screenListeners={{
        focus: (e) => {
          // Track recently visited screens for the command palette "Recent"
          // section. The native-stack navigator emits focus with the route
          // name; we persist a friendly title derived from the route name.
          const routeName = (e.target as string | undefined)?.split('-')[0];
          if (routeName) {
            const title = routeName
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (c) => c.toUpperCase())
              .trim();
            registerRecentScreen(routeName, title).catch(() => {
              // Best-effort — never block navigation.
            });
          }
        },
      }}
    >

      {/* ── Auth & Onboarding ── */}
      {/* Age gate — 18+ marketplace verification, first-launch only */}
      <Stack.Screen name="AgeVerification" getComponent={() => require('../screens/AgeVerificationScreen').default} options={{ headerShown: false, gestureEnabled: false }} />

      {/* General app onboarding — first-launch only */}
      <Stack.Screen name="Onboarding" getComponent={() => require('../screens/OnboardingScreen').default} />

      {/* Auth Flow */}
      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
      <Stack.Screen name="Login" getComponent={() => require('../screens/LoginScreen').default} />
      <Stack.Screen name="SignUp" getComponent={() => require('../screens/SignUpScreen').default} />
      <Stack.Screen name="BiometricLogin" getComponent={() => require('../screens/BiometricLoginScreen').default} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="ForgotPassword" getComponent={() => require('../screens/ForgotPasswordScreen').default} />
      <Stack.Screen name="ResetPassword" getComponent={() => require('../screens/ResetPasswordScreen').default} />
      <Stack.Screen name="Personalisation" getComponent={() => require('../screens/PersonalisationScreen').default} options={{ headerShown: false }} />

      {/* ── Main Tabs ── */}
      <Stack.Screen name="MainTabs" component={TabNavigator} />

      {/* ── Commerce ── */}
      <Stack.Screen name="ItemDetail" getComponent={() => require('../screens/ItemDetailScreen').default} />
      <Stack.Screen name="CategoryDetail" getComponent={() => require('../screens/CategoryDetailScreen').default} />
      <Stack.Screen name="Browse" getComponent={() => require('../screens/BrowseScreen').default} />
      <Stack.Screen name="Closet" getComponent={() => require('../screens/ClosetScreen').default} />
      <Stack.Screen name="CollectionDetail" getComponent={() => require('../screens/CollectionDetailScreen').default} />
      <Stack.Screen name="CategoryTree" getComponent={() => require('../screens/CategoryTreeScreen').default} />
      <Stack.Screen name="Filter" getComponent={() => require('../screens/FilterScreen').default} options={formSheetScreenOptions} />
      <Stack.Screen name="GlobalSearch" getComponent={() => require('../screens/GlobalSearchScreen').default} />
      <Stack.Screen name="NotificationsList" getComponent={() => require('../screens/NotificationsScreen').default} />

      {/* ── Creator Studio ── */}
      <Stack.Screen name="PosterViewer" getComponent={() => require('../screens/PosterViewerScreen').default} options={{ ...modalScreenOptions, headerShown: false }} />
      <Stack.Screen name="PosterStoryActivity" getComponent={() => require('../screens/PosterStoryActivityScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="PosterArchive" getComponent={() => require('../screens/PosterArchiveScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="PosterHighlightViewer" getComponent={() => require('../screens/PosterHighlightViewerScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CreatePosterHighlight" getComponent={() => require('../screens/CreatePosterHighlightScreen').default} options={modalScreenOptions} />

      {/* ── Auctions & Trading ── */}
      <Stack.Screen name="Sell" getComponent={() => require('../screens/SellScreen').default} options={modalScreenOptions} />
      {/* ── Catalogue Import ── (concierge importer flow) */}
      <Stack.Screen name="CatalogImportStart" getComponent={() => require('../screens/CatalogImportStartScreen').default} />
      <Stack.Screen name="CatalogImportConsent" getComponent={() => require('../screens/CatalogImportConsentScreen').default} />
      <Stack.Screen name="CatalogImportProgress" getComponent={() => require('../screens/CatalogImportProgressScreen').default} />
      <Stack.Screen name="CatalogImportReview" getComponent={() => require('../screens/CatalogImportReviewScreen').default} />
      <Stack.Screen name="CatalogImportItem" getComponent={() => require('../screens/CatalogImportItemScreen').default} />
      <Stack.Screen name="CatalogImportSummary" getComponent={() => require('../screens/CatalogImportSummaryScreen').default} />
      <Stack.Screen name="AuctionHome" getComponent={() => require('../screens/AuctionHomeScreen').default} />
      <Stack.Screen name="SellerAuctionCentre" getComponent={() => require('../screens/SellerAuctionCentreScreen').default} />
      <Stack.Screen name="CreateAuction" getComponent={() => require('../screens/CreateAuctionScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="AuctionDetail" getComponent={() => require('../screens/AuctionDetailScreen').default} />

      {/* ── Co-Own / Syndicate ── */}
      <Stack.Screen name="CreateCoOwn" getComponent={() => require('../screens/CreateSyndicateScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="MarketLedger" getComponent={() => require('../screens/MarketLedgerScreen').default} />
      <Stack.Screen name="CoOwnHub" getComponent={() => require('../screens/SyndicateHubScreen').default} />
      <Stack.Screen name="AssetDetail" getComponent={() => require('../screens/AssetDetailScreen').default} />
      <Stack.Screen name="AssetDueDiligence" getComponent={() => require('../screens/AssetDueDiligenceScreen').default} />
      <Stack.Screen name="Trade" getComponent={() => require('../screens/TradeScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="Portfolio" getComponent={() => require('../screens/PortfolioScreen').default} />
      <Stack.Screen name="MyBids" getComponent={() => require('../screens/MyBidsScreen').default} />
      <Stack.Screen name="MyListings" getComponent={() => require('../screens/MyListingsScreen').default} />
      <Stack.Screen name="InventoryManagement" getComponent={() => require('../screens/InventoryManagementScreen').default} />
      <Stack.Screen name="SellerAnalytics" getComponent={() => require('../screens/SellerAnalyticsScreen').default} />
      <Stack.Screen name="SellerHub" getComponent={() => require('../screens/SellerHubScreen').default} />
      <Stack.Screen name="CreatorAnalyticsDashboard" getComponent={() => require('../screens/CreatorAnalyticsDashboardScreen').default} />
      <Stack.Screen name="BundleBag" getComponent={() => require('../screens/BundleBagScreen').default} />
      <Stack.Screen name="VerificationResponse" getComponent={() => require('../screens/VerificationResponseScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CoOwnOrderHistory" getComponent={() => require('../screens/SyndicateOrderHistoryScreen').default} />
      <Stack.Screen name="AssetLeaderboard" getComponent={() => require('../screens/AssetLeaderboardScreen').default} />
      <Stack.Screen name="Buyout" getComponent={() => require('../screens/BuyoutScreen').default} />
      <Stack.Screen name="CorporateActionDetail" getComponent={() => require('../screens/CorporateActionDetailScreen').default} />
      <Stack.Screen name="DistributionHistory" getComponent={() => require('../screens/DistributionHistoryScreen').default} />
      <Stack.Screen name="CoOwnOnboarding" getComponent={() => require('../screens/SyndicateOnboardingScreen').default} options={modalScreenOptions} />

      {/* ── Chat & Messaging ── */}
      <Stack.Screen name="Chat" getComponent={() => require('../screens/ChatScreen').default} />
      <Stack.Screen name="Inbox" getComponent={() => require('../screens/InboxScreen').default} />
      <Stack.Screen name="CreateGroupChat" getComponent={() => require('../screens/CreateGroupChatScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="GroupChat" getComponent={() => require('../screens/GroupChatScreen').default} />
      <Stack.Screen name="GroupChatInfo" getComponent={() => require('../screens/GroupChatInfoScreen').default} />
      <Stack.Screen name="GroupMembers" getComponent={() => require('../screens/GroupMembersScreen').default} />
      <Stack.Screen name="GroupPermissions" getComponent={() => require('../screens/GroupPermissionsScreen').default} />
      <Stack.Screen name="GroupBotManagement" getComponent={() => require('../screens/GroupBotManagementScreen').default} />
      <Stack.Screen name="BotDirectory" getComponent={() => require('../screens/BotDirectoryScreen').default} />
      <Stack.Screen name="BotDetail" getComponent={() => require('../screens/BotDetailScreen').default} />
      <Stack.Screen name="CustomBots" getComponent={() => require('../screens/CustomBotsScreen').default} />
      <Stack.Screen name="BotBuilder" getComponent={() => require('../screens/BotBuilderScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="EditGroup" getComponent={() => require('../screens/EditGroupScreen').default} />

      {/* ── Social / Profile ── */}
      <Stack.Screen name="UserProfile" getComponent={() => require('../screens/UserProfileScreen').default} />
      <Stack.Screen name="ConnectionList" getComponent={() => require('../screens/ConnectionListScreen').default} />
      <Stack.Screen name="LookDetail" getComponent={() => require('../screens/LookDetailScreen').default} />

      {/* ── Settings & Account ── (security) */}
      <Stack.Screen name="AccountSecurity" getComponent={() => require('../screens/AccountSecurityScreen').default} options={pushScreenOptions} />
      <Stack.Screen name="AccountSecurityRecovery" getComponent={() => require('../screens/AccountSecurityRecoveryScreen').default} options={pushScreenOptions} />

      {/* ── Settings & Account ── (profile, preferences, privacy, verification) */}
      <Stack.Screen name="Settings" getComponent={() => require('../screens/SettingsScreen').default} />
      <Stack.Screen name="EditProfile" getComponent={() => require('../screens/EditProfileScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="AccountSettings" getComponent={() => require('../screens/AccountSettingsScreen').default} />
      <Stack.Screen name="AccountControl" getComponent={() => require('../screens/AccountControlScreen').default} />
      <Stack.Screen name="SavedAddresses" getComponent={() => require('../screens/SavedAddressesScreen').default} />
      <Stack.Screen name="Payments" getComponent={() => require('../screens/PaymentsScreen').default} />
      <Stack.Screen name="PushNotifications" getComponent={() => require('../screens/PushNotificationsScreen').default} />
      <Stack.Screen name="HelpSupport" getComponent={() => require('../screens/HelpSupportScreen').default} />
      <Stack.Screen name="ChangePassword" getComponent={() => require('../screens/ChangePasswordScreen').default} />
      <Stack.Screen name="TwoFactorSetup" getComponent={() => require('../screens/TwoFactorSetupScreen').default} />
      <Stack.Screen name="ChatSettings" getComponent={() => require('../screens/ChatSettingsScreen').default} />
      <Stack.Screen name="ActiveSessions" getComponent={() => require('../screens/ActiveSessionsScreen').default} />
      <Stack.Screen name="BlockedUsers" getComponent={() => require('../screens/BlockedUsersScreen').default} />
      <Stack.Screen name="PrivacySettings" getComponent={() => require('../screens/PrivacySettingsScreen').default} />
      <Stack.Screen name="About" getComponent={() => require('../screens/AboutScreen').default} />
      <Stack.Screen name="MutedConversations" getComponent={() => require('../screens/MutedConversationsScreen').default} />
      <Stack.Screen name="ArchivedConversations" getComponent={() => require('../screens/ArchivedConversationsScreen').default} />
      <Stack.Screen name="ManageQuickReplies" getComponent={() => require('../screens/ManageQuickRepliesScreen').default} />
      <Stack.Screen name="ConnectedAccounts" getComponent={() => require('../screens/ConnectedAccountsScreen').default} />
      <Stack.Screen name="EmailNotifications" getComponent={() => require('../screens/EmailNotificationsScreen').default} />
      <Stack.Screen name="AccessibilitySettings" getComponent={() => require('../screens/AccessibilitySettingsScreen').default} />
      <Stack.Screen name="DeleteAccount" getComponent={() => require('../screens/DeleteAccountScreen').default} />
      <Stack.Screen name="DataExport" getComponent={() => require('../screens/DataExportScreen').default} />
      <Stack.Screen name="Verification" getComponent={() => require('../screens/VerificationScreen').default} />
      <Stack.Screen name="VerificationStatus" getComponent={() => require('../screens/VerificationStatusScreen').default} />
      <Stack.Screen name="SellerVerification" getComponent={() => require('../screens/SellerVerificationScreen').default} />
      <Stack.Screen name="KYCVerification" getComponent={() => require('../screens/KYCVerificationScreen').default} />
      <Stack.Screen name="AIPreferences" getComponent={() => require('../screens/AIPreferencesScreen').default} />
      <Stack.Screen name="SustainabilityPreferences" getComponent={() => require('../screens/SustainabilityPreferencesScreen').default} />
      <Stack.Screen name="DataPrivacy" getComponent={() => require('../screens/DataPrivacyScreen').default} />
      <Stack.Screen name="NotificationPreferences" getComponent={() => require('../screens/NotificationPreferencesScreen').default} />
      <Stack.Screen name="AIAgentIntegration" getComponent={() => require('../screens/AIAgentIntegrationScreen').default} />
      <Stack.Screen name="AgentLedger" getComponent={() => require('../screens/AgentLedgerScreen').default} />

      {/* ── Wallet & Payments ── */}
      <Stack.Screen name="Wallet" getComponent={() => require('../screens/WalletScreen').default} />
      {/* Wallet V3 — focused money-movement destinations (spec 17) */}
      <Stack.Screen name="SellerEarnings" getComponent={() => require('../screens/SellerEarningsScreen').default} />
      <Stack.Screen name="WalletConvert" getComponent={() => require('../screens/WalletConvertScreen').default} />
      <Stack.Screen name="WalletHistory" getComponent={() => require('../screens/WalletHistoryScreen').default} />
      <Stack.Screen name="MyOrders" getComponent={() => require('../screens/MyOrdersScreen').default} />

      {/* ── Commerce ── (orders, offers, checkout, listings) */}
      {/* Phase 16 new screens */}
      <Stack.Screen name="MakeOffer" getComponent={() => require('../screens/MakeOfferScreen').default} options={formSheetScreenOptions} />
      <Stack.Screen name="Postage" getComponent={() => require('../screens/PostageScreen').default} />
      <Stack.Screen name="InviteFriends" getComponent={() => require('../screens/InviteFriendsScreen').default} />
      <Stack.Screen name="BalanceHistory" getComponent={() => require('../screens/BalanceHistoryScreen').default} />

      {/* Phase 17 new screens */}
      <Stack.Screen name="AddBankAccount" getComponent={() => require('../screens/AddBankAccountScreen').default} />

      {/* Phase 18 new screens */}
      <Stack.Screen name="OrderDetail" getComponent={() => require('../screens/OrderDetailScreen').default} />
      <Stack.Screen name="SellerFulfilment" getComponent={() => require('../screens/SellerFulfilmentScreen').default} />
      <Stack.Screen name="OrderReceipt" getComponent={() => require('../screens/OrderReceiptScreen').default} />

      {/* Phase 19 new screens */}
      <Stack.Screen name="Checkout" getComponent={() => require('../screens/CheckoutScreen').default} />
      <Stack.Screen name="AddressForm" getComponent={() => require('../screens/AddressFormScreen').default} />
      <Stack.Screen name="Success" getComponent={() => require('../screens/SuccessScreen').default} />
      <Stack.Screen name="ManageListing" getComponent={() => require('../screens/ManageListingScreen').default} />
      <Stack.Screen name="Withdraw" getComponent={() => require('../screens/WithdrawScreen').default} />

      {/* Phase 25 new screens */}
      <Stack.Screen name="ListingSuccess" getComponent={() => require('../screens/ListingSuccessScreen').default} />
      <Stack.Screen name="EditListing" getComponent={() => require('../screens/EditListingScreen').default} options={modalScreenOptions} />

      {/* Phase 28 new screens */}
      <Stack.Screen name="WriteReview" getComponent={() => require('../screens/WriteReviewScreen').default} options={formSheetScreenOptions} />

      {/* ── Support & Help ── (report) */}
      <Stack.Screen name="Report" getComponent={() => require('../screens/ReportScreen').default} options={modalScreenOptions} />

      {/* ── Support & Help ── (appeal — DSA Article 20 user-facing complaint) */}
      <Stack.Screen name="Appeal" getComponent={() => require('../screens/AppealScreen').default} />

      {/* ── Creator Studio ── (visual search, camera, looks, studio, outfits, explore) */}
      {/* Visual Search — full-screen camera viewfinder with its own header on results */}
      <Stack.Screen name="VisualSearch" getComponent={() => require('../screens/VisualSearchScreen').default} options={{ headerShown: false }} />

      {/* Explore / Creator screens */}
      <Stack.Screen name="CreatorStudio" getComponent={() => require('../creator').CreatorStudioScreen} options={modalScreenOptions} />
      <Stack.Screen name="CreatorDraftList" getComponent={() => require('../creator/CreatorDraftListScreen').CreatorDraftListScreen} options={modalScreenOptions} />
      <Stack.Screen name="OutfitBuilder" getComponent={() => require('../screens/OutfitBuilderScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CoOwnIssue" getComponent={() => require('../screens/CoOwnIssueScreen').default} options={modalScreenOptions} />

      {/* ── Chat & Messaging ── (conversations, messages, media) */}
      {/* VISUAL-15 — UI Architecture + Feature Depth */}
      <Stack.Screen name="ConversationInfo" getComponent={() => require('../screens/ConversationInfoScreen').default} />
      <Stack.Screen name="MessageRequests" getComponent={() => require('../screens/MessageRequestsScreen').default} />
      <Stack.Screen name="NewMessage" getComponent={() => require('../screens/NewMessageScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="SharedConversationMedia" getComponent={() => require('../screens/SharedConversationMediaScreen').default} />

      {/* ── Commerce ── (collections) */}
      <Stack.Screen name="ManageCollectionItems" getComponent={() => require('../screens/ManageCollectionItemsScreen').default} />
      <Stack.Screen name="CreateCollection" getComponent={() => require('../screens/CreateCollectionScreen').default} options={modalScreenOptions} />

      {/* ── Support & Help ── (order support, buyer protection) */}
      <Stack.Screen name="OrderSupport" getComponent={() => require('../screens/OrderSupportScreen').default} />
      <Stack.Screen name="BuyerProtection" getComponent={() => require('../screens/BuyerProtectionScreen').default} />

      {/* ── Co-Own / Syndicate ── (price alerts, tax, recurring orders) */}
      <Stack.Screen name="CoOwnPriceAlerts" getComponent={() => require('../screens/CoOwnPriceAlertsScreen').default} />
      <Stack.Screen name="CoOwnTaxDocuments" getComponent={() => require('../screens/CoOwnTaxDocumentsScreen').default} />
      <Stack.Screen name="CoOwnRecurringOrders" getComponent={() => require('../screens/CoOwnRecurringOrdersScreen').default} />

      {/* ── Chat & Messaging ── (media preview) */}
      <Stack.Screen name="ChatMediaPreview" getComponent={() => require('../screens/ChatMediaPreviewScreen').default} options={modalScreenOptions} />

      {/* ── Commerce ── (collection editing) */}
      {/* UI-18 — Reference-perfect product UX */}
      <Stack.Screen name="EditCollection" getComponent={() => require('../screens/EditCollectionScreen').default} options={modalScreenOptions} />

      {/* ── Support & Help ── (tickets, resolution centre, conversations) */}
      <Stack.Screen name="SupportTicketDetail" getComponent={() => require('../screens/SupportTicketDetailScreen').default} />
      <Stack.Screen name="ResolutionCentre" getComponent={() => require('../screens/ResolutionCentreScreen').default} />
      <Stack.Screen name="SupportConversation" getComponent={() => require('../screens/SupportConversationScreen').default} />
      <Stack.Screen name="SupportCaseDetail" getComponent={() => require('../screens/SupportCaseDetailScreen').default} />

      {/* ── Seller Tools ── (listing preview) */}
      {/* UI-19 — Sell / Co-own / Chat marketplace UX */}
      <Stack.Screen name="ListingPreview" getComponent={() => require('../screens/ListingPreviewScreen').default} options={modalScreenOptions} />

      {/* ── Auctions & Trading ── (trade confirm) */}
      <Stack.Screen name="TradeConfirm" getComponent={() => require('../screens/TradeConfirmScreen').default} options={modalScreenOptions} />

      {/* ── Live Shopping ── */}
      {/* Live shopping — Whatnot/Tilt-style live commerce */}
      <Stack.Screen name="LiveShopping" getComponent={() => require('../screens/LiveShoppingHomeScreen').default} />
      <Stack.Screen name="LiveStreamViewer" getComponent={() => require('../screens/LiveStreamViewerScreen').LiveStreamViewerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LiveStreamSeller" getComponent={() => require('../screens/LiveStreamSellerScreen').LiveStreamSellerScreen} options={{ headerShown: false }} />

      {/* ── Seller Tools ── (AI listing, bulk, inventory, KYC) */}
      <Stack.Screen name="AIPoweredListing" getComponent={() => require('../screens/AIPoweredListingScreen').default} options={modalScreenOptions} />

      {/* Pro seller tools */}
      <Stack.Screen name="BulkListing" getComponent={() => require('../screens/BulkListingScreen').default} options={modalScreenOptions} />

      {/* ── Discovery & Editorial ── (AI photo enhancement, moodboard editor) */}
      {/* AI photo enhancement */}
      <Stack.Screen name="AIPhotoEnhancement" getComponent={() => require('../screens/AIPhotoEnhancementScreen').default} options={modalScreenOptions} />

      {/* Moodboard editor — modal editor (home list is in the Home tab stack) */}
      <Stack.Screen name="MoodboardEditor" getComponent={() => require('../screens/MoodboardEditorScreen').default} options={modalScreenOptions} />

      {/* Galleria collection detail — accessible from HomeStack and GalleriaScreen */}
      <Stack.Screen name="GalleriaCollectionDetail" getComponent={() => require('../screens/GalleriaCollectionDetailScreen').default} />

      {/* ── Discovery & Editorial ── (galleria, algorithm, moodboards, explore, AI search) */}
      <Stack.Screen name="UnifiedDiscovery" getComponent={() => require('../screens/UnifiedDiscoveryScreen').default} options={{ headerShown: false }} />
      <Stack.Screen name="Galleria" getComponent={() => require('../screens/GalleriaScreen').default} />
      <Stack.Screen name="YourAlgorithm" getComponent={() => require('../screens/YourAlgorithmScreen').default} />
      <Stack.Screen name="ConversationalSearch" getComponent={() => require('../screens/ConversationalSearchScreen').default} />
      <Stack.Screen name="MoodboardHome" getComponent={() => require('../screens/MoodboardHomeScreen').default} />
      <Stack.Screen name="PulseFeed" getComponent={() => require('../screens/PulseFeedScreen').default} />
      <Stack.Screen name="ExploreCollection" getComponent={() => require('../screens/ExploreCollectionScreen').default} />
      <Stack.Screen name="StyleQuiz" getComponent={() => require('../screens/StyleQuizScreen').default} />
      <Stack.Screen name="SavedSearches" getComponent={() => require('../screens/SavedSearchesScreen').default} />

      {/* Diagnostic — dev only */}
      {__DEV__ && (
        <Stack.Screen name="RuntimeSmokeTest" getComponent={() => require('../screens/RuntimeSmokeTestScreen').default} />
      )}
    </Stack.Navigator>
    {/* Global in-app notification overlay — renders above all screens but
        below native modals (modals are presented by the OS above this view). */}
    <InAppNotificationCenter />
    {/* Command palette — global ⌘K-style search/navigation modal. Available
        everywhere via long-press on the Home search entry, the dev-only
        floating trigger below, or any other surface that calls
        useCommandPaletteStore().open(). Rendered at the root so it overlays
        every screen. */}
    <CommandPalette />
    {__DEV__ && <CommandPaletteTrigger />}
    </View>
  );
}

/**
 * Dev-only floating trigger for the command palette. A small, unobtrusive
 * chrome-receding button anchored to the bottom-right edge so the palette is
 * reachable from any screen during development without wiring up a per-screen
 * trigger. Hidden in production builds.
 */
function CommandPaletteTrigger() {
  const open = useCommandPaletteStore((s) => s.open);
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={open}
      hitSlop={12}
      style={[triggerStyles.fab, { backgroundColor: colors.overlay }]}
      accessibilityRole="button"
      accessibilityLabel="Open command palette"
      accessibilityHint="Opens the global command palette"
    >
      <Ionicons name="terminal-outline" size={22} color={colors.surface} />
    </Pressable>
  );
}

const triggerStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
