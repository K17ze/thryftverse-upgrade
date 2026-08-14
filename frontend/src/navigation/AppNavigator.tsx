import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useStore } from '../store/useStore';
import { isOnboardingComplete } from '../screens/OnboardingScreen';
import { isAgeVerified } from '../screens/AgeVerificationScreen';
import { InAppNotificationCenter } from '../components/notifications/InAppNotificationCenter';
import { CommandPalette } from '../components/CommandPalette';
import {
  registerRecentScreen,
  useCommandPaletteStore,
} from '../hooks/useCommandPalette';

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
const transparentSheetScreenOptions = {
  presentation: 'transparentModal' as const,
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
  gestureEnabled: false,
  animation: 'none' as const,
};

export default function AppNavigator() {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
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

  if (!ageCheckChecked || !onboardingChecked) {
    return null;
  }

  // First-launch users see the age gate, then onboarding, before auth.
  // Returning users go straight to the auth/main entry point.
  const initialRoute = needsAgeVerification
    ? 'AgeVerification'
    : needsOnboarding
      ? 'Onboarding'
      : isAuthenticated
        ? 'MainTabs'
        : 'AuthLanding';

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

      {/* Age gate — 18+ marketplace verification, first-launch only */}
      <Stack.Screen name="AgeVerification" getComponent={() => require('../screens/AgeVerificationScreen').default} options={{ headerShown: false, gestureEnabled: false }} />

      {/* General app onboarding — first-launch only */}
      <Stack.Screen name="Onboarding" getComponent={() => require('../screens/OnboardingScreen').default} />

      {/* Auth Flow */}
      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
      <Stack.Screen name="Login" getComponent={() => require('../screens/LoginScreen').default} />
      <Stack.Screen name="SignUp" getComponent={() => require('../screens/SignUpScreen').default} />
      <Stack.Screen name="ForgotPassword" getComponent={() => require('../screens/ForgotPasswordScreen').default} />

      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="CategoryDetail" getComponent={() => require('../screens/CategoryDetailScreen').default} />
      <Stack.Screen name="Browse" getComponent={() => require('../screens/BrowseScreen').default} />
      <Stack.Screen name="ItemDetail" getComponent={() => require('../screens/ItemDetailScreen').default} />
      <Stack.Screen name="Closet" getComponent={() => require('../screens/ClosetScreen').default} />
      <Stack.Screen name="CollectionDetail" getComponent={() => require('../screens/CollectionDetailScreen').default} />
      <Stack.Screen name="PosterViewer" getComponent={() => require('../screens/PosterViewerScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CreatePoster" getComponent={() => require('../screens/CreatePosterRedirect').CreatePosterRedirect} options={modalScreenOptions} />
      <Stack.Screen name="PosterStoryActivity" getComponent={() => require('../screens/PosterStoryActivityScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="PosterArchive" getComponent={() => require('../screens/PosterArchiveScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="PosterHighlightViewer" getComponent={() => require('../screens/PosterHighlightViewerScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CreatePosterHighlight" getComponent={() => require('../screens/CreatePosterHighlightScreen').default} options={modalScreenOptions} />

      <Stack.Screen name="Sell" getComponent={() => require('../screens/SellScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="TradeHub" getComponent={() => require('../screens/TradeHubScreen').default} />
      <Stack.Screen name="Verification" getComponent={() => require('../screens/VerificationScreen').default} />
      <Stack.Screen name="KYCVerification" getComponent={() => require('../screens/KYCVerificationScreen').default} />
      <Stack.Screen name="AuctionHome" getComponent={() => require('../screens/AuctionHomeScreen').default} />
      <Stack.Screen name="Auctions" getComponent={() => require('../screens/AuctionsScreen').default} />
      <Stack.Screen name="SellerAuctionCentre" getComponent={() => require('../screens/SellerAuctionCentreScreen').default} />
      <Stack.Screen name="CreateAuction" getComponent={() => require('../screens/CreateAuctionScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="AuctionDetail" getComponent={() => require('../screens/AuctionDetailScreen').default} />
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
      <Stack.Screen name="CreatorAnalyticsDashboard" getComponent={() => require('../screens/CreatorAnalyticsDashboardScreen').default} />
      <Stack.Screen name="BundleBag" getComponent={() => require('../screens/BundleBagScreen').default} />
      <Stack.Screen name="SellerVerification" getComponent={() => require('../screens/SellerVerificationScreen').default} />
      <Stack.Screen name="VerificationResponse" getComponent={() => require('../screens/VerificationResponseScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CoOwnOrderHistory" getComponent={() => require('../screens/SyndicateOrderHistoryScreen').default} />
      <Stack.Screen name="AssetLeaderboard" getComponent={() => require('../screens/AssetLeaderboardScreen').default} />
      <Stack.Screen name="Buyout" getComponent={() => require('../screens/BuyoutScreen').default} />
      <Stack.Screen name="CorporateActionDetail" getComponent={() => require('../screens/CorporateActionDetailScreen').default} />
      <Stack.Screen name="DistributionHistory" getComponent={() => require('../screens/DistributionHistoryScreen').default} />
      <Stack.Screen name="CoOwnOnboarding" getComponent={() => require('../screens/SyndicateOnboardingScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="Chat" getComponent={() => require('../screens/ChatScreen').default} />
      <Stack.Screen name="CreateGroupChat" getComponent={() => require('../screens/CreateGroupChatScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="GroupChat" getComponent={() => require('../screens/GroupChatScreen').default} />
      <Stack.Screen name="GroupChatInfo" getComponent={() => require('../screens/GroupChatInfoScreen').default} />
      <Stack.Screen name="GroupMembers" getComponent={() => require('../screens/GroupMembersScreen').default} />
      <Stack.Screen name="GroupBotManagement" getComponent={() => require('../screens/GroupBotManagementScreen').default} />
      <Stack.Screen name="BotDirectory" getComponent={() => require('../screens/BotDirectoryScreen').default} />
      <Stack.Screen name="BotDetail" getComponent={() => require('../screens/BotDetailScreen').default} />
      <Stack.Screen name="CustomBots" getComponent={() => require('../screens/CustomBotsScreen').default} />
      <Stack.Screen name="BotBuilder" getComponent={() => require('../screens/BotBuilderScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="EditGroup" getComponent={() => require('../screens/EditGroupScreen').default} />
      <Stack.Screen name="UserProfile" getComponent={() => require('../screens/UserProfileScreen').default} />
      <Stack.Screen name="Wallet" getComponent={() => require('../screens/WalletScreen').default} />
      {/* Wallet V3 — focused money-movement destinations (spec 17) */}
      <Stack.Screen name="SellerEarnings" getComponent={() => require('../screens/SellerEarningsScreen').default} />
      <Stack.Screen name="WalletActivity" getComponent={() => require('../screens/WalletActivityScreen').default} />
      <Stack.Screen name="MyOrders" getComponent={() => require('../screens/MyOrdersScreen').default} />
      <Stack.Screen name="Personalisation" getComponent={() => require('../screens/PersonalisationScreen').default} />
      <Stack.Screen name="Settings" getComponent={() => require('../screens/SettingsScreen').default} />
      <Stack.Screen name="EditProfile" getComponent={() => require('../screens/EditProfileScreen').default} />
      <Stack.Screen name="AccountSettings" getComponent={() => require('../screens/AccountSettingsScreen').default} />
      <Stack.Screen name="AccountControl" getComponent={() => require('../screens/AccountControlScreen').default} />
      <Stack.Screen name="DeleteAccount" getComponent={() => require('../screens/DeleteAccountScreen').default} />
      <Stack.Screen name="DataExport" getComponent={() => require('../screens/DataExportScreen').default} />
      <Stack.Screen name="SavedAddresses" getComponent={() => require('../screens/SavedAddressesScreen').default} />
      <Stack.Screen name="Payments" getComponent={() => require('../screens/PaymentsScreen').default} />

      {/* Phase 16 new screens */}
      <Stack.Screen name="MakeOffer" getComponent={() => require('../screens/MakeOfferScreen').default} />
      <Stack.Screen name="PushNotifications" getComponent={() => require('../screens/PushNotificationsScreen').default} />
      <Stack.Screen name="Postage" getComponent={() => require('../screens/PostageScreen').default} />
      <Stack.Screen name="InviteFriends" getComponent={() => require('../screens/InviteFriendsScreen').default} />
      <Stack.Screen name="BalanceHistory" getComponent={() => require('../screens/BalanceHistoryScreen').default} />

      {/* Phase 17 new screens */}
      <Stack.Screen name="AddBankAccount" getComponent={() => require('../screens/AddBankAccountScreen').default} />
      <Stack.Screen name="HelpSupport" getComponent={() => require('../screens/HelpSupportScreen').default} />

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
      <Stack.Screen name="CategoryTree" getComponent={() => require('../screens/CategoryTreeScreen').default} />

      {/* Phase 24 new screens */}
      <Stack.Screen name="GlobalSearch" getComponent={() => require('../screens/GlobalSearchScreen').default} />

      {/* Phase 25 new screens */}
      <Stack.Screen name="Filter" getComponent={() => require('../screens/FilterScreen').default} options={transparentSheetScreenOptions} />
      <Stack.Screen name="ListingSuccess" getComponent={() => require('../screens/ListingSuccessScreen').default} />
      <Stack.Screen name="EditListing" getComponent={() => require('../screens/EditListingScreen').default} options={modalScreenOptions} />

      {/* Phase 27 new screens */}
      <Stack.Screen name="NotificationsList" getComponent={() => require('../screens/NotificationsScreen').default} />

      {/* Phase 28 new screens */}
      <Stack.Screen name="ChangePassword" getComponent={() => require('../screens/ChangePasswordScreen').default} />
      <Stack.Screen name="TwoFactorSetup" getComponent={() => require('../screens/TwoFactorSetupScreen').default} />
      <Stack.Screen name="WriteReview" getComponent={() => require('../screens/WriteReviewScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="Report" getComponent={() => require('../screens/ReportScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="SavedSearches" getComponent={() => require('../screens/SavedSearchesScreen').default} />

      {/* Visual Search — full-screen camera viewfinder with its own header on results */}
      <Stack.Screen name="VisualSearch" getComponent={() => require('../screens/VisualSearchScreen').default} options={{ headerShown: false }} />

      {/* Unified camera-first create screen — replaces the Create tab action sheet */}
      <Stack.Screen name="CreateCamera" getComponent={() => require('../screens/CreateCameraScreen').default} options={modalScreenOptions} />

      {/* Explore / Creator screens */}
      <Stack.Screen name="CreateLook" getComponent={() => require('../screens/CreateLookRedirect').CreateLookRedirect} options={modalScreenOptions} />
      <Stack.Screen name="CreatorStudio" getComponent={() => require('../creator').CreatorStudioScreen} options={modalScreenOptions} />
      <Stack.Screen name="CreatorDraftList" getComponent={() => require('../creator/CreatorDraftListScreen').CreatorDraftListScreen} options={modalScreenOptions} />
      <Stack.Screen name="OutfitBuilder" getComponent={() => require('../screens/OutfitBuilderScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="CoOwnIssue" getComponent={() => require('../screens/CoOwnIssueScreen').default} options={modalScreenOptions} />
      {/* UI-22R.6B — Experience elevation */}
      <Stack.Screen name="LookDetail" getComponent={() => require('../screens/LookDetailScreen').default} />
      <Stack.Screen name="PulseFeed" getComponent={() => require('../screens/PulseFeedScreen').default} />
      <Stack.Screen name="ExploreCollection" getComponent={() => require('../screens/ExploreCollectionScreen').default} />
      <Stack.Screen name="StyleQuiz" getComponent={() => require('../screens/StyleQuizScreen').default} options={modalScreenOptions} />

      {/* Phase 13 — Settings integrity */}
      <Stack.Screen name="ChatSettings" getComponent={() => require('../screens/ChatSettingsScreen').default} />
      <Stack.Screen name="ActiveSessions" getComponent={() => require('../screens/ActiveSessionsScreen').default} />
      <Stack.Screen name="BlockedUsers" getComponent={() => require('../screens/BlockedUsersScreen').default} />
      <Stack.Screen name="PrivacySettings" getComponent={() => require('../screens/PrivacySettingsScreen').default} />
      <Stack.Screen name="About" getComponent={() => require('../screens/AboutScreen').default} />
      <Stack.Screen name="MutedConversations" getComponent={() => require('../screens/MutedConversationsScreen').default} />
      <Stack.Screen name="ArchivedConversations" getComponent={() => require('../screens/ArchivedConversationsScreen').default} />
      <Stack.Screen name="ManageQuickReplies" getComponent={() => require('../screens/ManageQuickRepliesScreen').default} />

      {/* VISUAL-15 — UI Architecture + Feature Depth */}
      <Stack.Screen name="ConversationInfo" getComponent={() => require('../screens/ConversationInfoScreen').default} />
      <Stack.Screen name="MessageRequests" getComponent={() => require('../screens/MessageRequestsScreen').default} />
      <Stack.Screen name="NewMessage" getComponent={() => require('../screens/NewMessageScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="SharedConversationMedia" getComponent={() => require('../screens/SharedConversationMediaScreen').default} />
      <Stack.Screen name="ManageCollectionItems" getComponent={() => require('../screens/ManageCollectionItemsScreen').default} />
      <Stack.Screen name="CreateCollection" getComponent={() => require('../screens/CreateCollectionScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="OrderSupport" getComponent={() => require('../screens/OrderSupportScreen').default} />
      <Stack.Screen name="BuyerProtection" getComponent={() => require('../screens/BuyerProtectionScreen').default} />
      <Stack.Screen name="ConnectedAccounts" getComponent={() => require('../screens/ConnectedAccountsScreen').default} />
      <Stack.Screen name="EmailNotifications" getComponent={() => require('../screens/EmailNotificationsScreen').default} />
      <Stack.Screen name="AccessibilitySettings" getComponent={() => require('../screens/AccessibilitySettingsScreen').default} />
      <Stack.Screen name="CoOwnPriceAlerts" getComponent={() => require('../screens/CoOwnPriceAlertsScreen').default} />
      <Stack.Screen name="CoOwnTaxDocuments" getComponent={() => require('../screens/CoOwnTaxDocumentsScreen').default} />
      <Stack.Screen name="CoOwnRecurringOrders" getComponent={() => require('../screens/CoOwnRecurringOrdersScreen').default} />
      <Stack.Screen name="ChatMediaPreview" getComponent={() => require('../screens/ChatMediaPreviewScreen').default} options={modalScreenOptions} />
      {/* UI-18 — Reference-perfect product UX */}
      <Stack.Screen name="EditCollection" getComponent={() => require('../screens/EditCollectionScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="SupportTicketDetail" getComponent={() => require('../screens/SupportTicketDetailScreen').default} />
      <Stack.Screen name="ResolutionCentre" getComponent={() => require('../screens/ResolutionCentreScreen').default} />
      {/* UI-19 — Sell / Co-own / Chat marketplace UX */}
      <Stack.Screen name="ListingPreview" getComponent={() => require('../screens/ListingPreviewScreen').default} options={modalScreenOptions} />
      <Stack.Screen name="TradeConfirm" getComponent={() => require('../screens/TradeConfirmScreen').default} options={modalScreenOptions} />

      {/* Verification status dashboard */}
      <Stack.Screen name="VerificationStatus" getComponent={() => require('../screens/VerificationStatusScreen').default} />

      {/* Live shopping — Whatnot/Tilt-style live commerce */}
      <Stack.Screen name="LiveShopping" getComponent={() => require('../screens/LiveShoppingHomeScreen').default} />
      <Stack.Screen name="LiveStreamViewer" getComponent={() => require('../screens/LiveStreamViewerScreen').LiveStreamViewerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LiveStreamSeller" getComponent={() => require('../screens/LiveStreamSellerScreen').LiveStreamSellerScreen} options={{ headerShown: false }} />

      <Stack.Screen name="AIPoweredListing" getComponent={() => require('../screens/AIPoweredListingScreen').default} options={modalScreenOptions} />

      {/* Pro seller tools */}
      <Stack.Screen name="BulkListing" getComponent={() => require('../screens/BulkListingScreen').default} options={modalScreenOptions} />

      {/* Galleria — editorial discovery surface for Co-Own assets & curated collections */}
      <Stack.Screen name="Galleria" getComponent={() => require('../screens/GalleriaScreen').default} />
      <Stack.Screen name="GalleriaCollectionDetail" getComponent={() => require('../screens/GalleriaCollectionDetailScreen').default} />

      {/* Algorithm transparency — "Your Algorithm" dashboard */}
      <Stack.Screen name="YourAlgorithm" getComponent={() => require('../screens/YourAlgorithmScreen').default} />

      {/* AI photo enhancement */}
      <Stack.Screen name="AIPhotoEnhancement" getComponent={() => require('../screens/AIPhotoEnhancementScreen').default} options={modalScreenOptions} />

      {/* Conversational AI search */}
      <Stack.Screen name="ConversationalSearch" getComponent={() => require('../screens/ConversationalSearchScreen').default} />

      {/* Moodboard — user-generated editorial collage tools */}
      <Stack.Screen name="MoodboardHome" getComponent={() => require('../screens/MoodboardHomeScreen').default} />
      <Stack.Screen name="MoodboardEditor" getComponent={() => require('../screens/MoodboardEditorScreen').default} options={modalScreenOptions} />

      {/* Settings sub-departments — 2026 settings enhancement */}
      <Stack.Screen name="AIPreferences" getComponent={() => require('../screens/AIPreferencesScreen').default} />
      <Stack.Screen name="SustainabilityPreferences" getComponent={() => require('../screens/SustainabilityPreferencesScreen').default} />
      <Stack.Screen name="DataPrivacy" getComponent={() => require('../screens/DataPrivacyScreen').default} />
      <Stack.Screen name="NotificationPreferences" getComponent={() => require('../screens/NotificationPreferencesScreen').default} />
      {/* AI provider API integration — bring-your-own-key for OpenAI / Anthropic / Gemini / custom */}
      <Stack.Screen name="AIAgentIntegration" getComponent={() => require('../screens/AIAgentIntegrationScreen').default} />
      {/* Agent activity ledger — transparent record of agent actions and approvals */}
      <Stack.Screen name="AgentActivity" getComponent={() => require('../screens/AgentActivityScreen').default} />

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
  return (
    <Pressable
      onPress={open}
      hitSlop={12}
      style={triggerStyles.fab}
      accessibilityRole="button"
      accessibilityLabel="Open command palette"
      accessibilityHint="Opens the global command palette"
    >
      <Ionicons name="terminal-outline" size={22} color="#FFFFFF" />
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
    borderRadius: 22,
    backgroundColor: 'rgba(120,120,120,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
