import React from 'react';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { RootStackParamList } from './types';
import { useStore } from '../store/useStore';
import { Motion } from '../constants/motion';

import AuthLandingScreen from '../screens/AuthLandingScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import TabNavigator from './TabNavigator';
import CategoryDetailScreen from '../screens/CategoryDetailScreen';
import BrowseScreen from '../screens/BrowseScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import ClosetScreen from '../screens/ClosetScreen';
import CollectionDetailScreen from '../screens/CollectionDetailScreen';
import PosterViewerScreen from '../screens/PosterViewerScreen';
import CreatePosterScreen from '../screens/CreatePosterScreen';
import PosterStoryActivityScreen from '../screens/PosterStoryActivityScreen';
import PosterArchiveScreen from '../screens/PosterArchiveScreen';
import PosterHighlightEditorScreen from '../screens/PosterHighlightEditorScreen';

import CreateAuctionScreen from '../screens/CreateAuctionScreen';
import CreateCoOwnScreen from '../screens/CreateSyndicateScreen';
import MarketLedgerScreen from '../screens/MarketLedgerScreen';
import CoOwnHubScreen from '../screens/SyndicateHubScreen';
import AssetDetailScreen from '../screens/AssetDetailScreen';
import TradeScreen from '../screens/TradeScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import MyBidsScreen from '../screens/MyBidsScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import CoOwnOrderHistoryScreen from '../screens/SyndicateOrderHistoryScreen';
import AssetLeaderboardScreen from '../screens/AssetLeaderboardScreen';
import BuyoutScreen from '../screens/BuyoutScreen';
import CoOwnOnboardingScreen from '../screens/SyndicateOnboardingScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateGroupChatScreen from '../screens/CreateGroupChatScreen';
import GroupBotDirectoryScreen from '../screens/GroupBotDirectoryScreen';
import GroupChatInfoScreen from '../screens/GroupChatInfoScreen';
import GroupMembersScreen from '../screens/GroupMembersScreen';
import GroupBotManagementScreen from '../screens/GroupBotManagementScreen';
import BotDirectoryScreen from '../screens/BotDirectoryScreen';
import BotDetailScreen from '../screens/BotDetailScreen';
import CustomBotsScreen from '../screens/CustomBotsScreen';
import BotBuilderScreen from '../screens/BotBuilderScreen';
import EditGroupScreen from '../screens/EditGroupScreen';
import UserProfileScreen from '../screens/UserProfileScreen';

// Profile Subs
import BalanceScreen from '../screens/BalanceScreen';
import WalletScreen from '../screens/WalletScreen';
import MyOrdersScreen from '../screens/MyOrdersScreen';
import PersonalisationScreen from '../screens/PersonalisationScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import AccountSettingsScreen from '../screens/AccountSettingsScreen';
import PaymentsScreen from '../screens/PaymentsScreen';

// Phase 16 new screens
import MakeOfferScreen from '../screens/MakeOfferScreen';
import PushNotificationsScreen from '../screens/PushNotificationsScreen';
import PostageScreen from '../screens/PostageScreen';
import InviteFriendsScreen from '../screens/InviteFriendsScreen';
import BalanceHistoryScreen from '../screens/BalanceHistoryScreen';

import AddBankAccountScreen from '../screens/AddBankAccountScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';

// Phase 18 new screens
import OrderDetailScreen from '../screens/OrderDetailScreen';
import SellerFulfilmentScreen from '../screens/SellerFulfilmentScreen';
import OrderReceiptScreen from '../screens/OrderReceiptScreen';

// Phase 19 new screens
import CheckoutScreen from '../screens/CheckoutScreen';
import AddressFormScreen from '../screens/AddressFormScreen';
import SuccessScreen from '../screens/SuccessScreen';
import ManageListingScreen from '../screens/ManageListingScreen';
import WithdrawScreen from '../screens/WithdrawScreen';
import CategoryTreeScreen from '../screens/CategoryTreeScreen';

// Phase 24 new screens
import GlobalSearchScreen from '../screens/GlobalSearchScreen';

// Phase 25 new screens
import FilterScreen from '../screens/FilterScreen';
import ListingSuccessScreen from '../screens/ListingSuccessScreen';

// Phase 27
import NotificationsScreen from '../screens/NotificationsScreen';

// Phase 28
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import VisualSearchScreen from '../screens/VisualSearchScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import TwoFactorSetupScreen from '../screens/TwoFactorSetupScreen';
import WriteReviewScreen from '../screens/WriteReviewScreen';
import ReportScreen from '../screens/ReportScreen';
import EditListingScreen from '../screens/EditListingScreen';

// Explore / Creator screens
import CreateLookScreen from '../screens/CreateLookScreen';
import OutfitBuilderScreen from '../screens/OutfitBuilderScreen';
import CoOwnIssueScreen from '../screens/CoOwnIssueScreen';
// UI-22R.6B — Experience elevation
import LookDetailScreen from '../screens/LookDetailScreen';
import PulseFeedScreen from '../screens/PulseFeedScreen';
import ExploreCollectionScreen from '../screens/ExploreCollectionScreen';
import StyleQuizScreen from '../screens/StyleQuizScreen';

// VISUAL-15 — UI Architecture + Feature Depth
import ConversationInfoScreen from '../screens/ConversationInfoScreen';
import MessageRequestsScreen from '../screens/MessageRequestsScreen';
import NewMessageScreen from '../screens/NewMessageScreen';
import SharedConversationMediaScreen from '../screens/SharedConversationMediaScreen';
import ManageCollectionItemsScreen from '../screens/ManageCollectionItemsScreen';
import CreateCollectionScreen from '../screens/CreateCollectionScreen';
import OrderSupportScreen from '../screens/OrderSupportScreen';
import ChatMediaPreviewScreen from '../screens/ChatMediaPreviewScreen';
// UI-18 — Reference-perfect product UX
import EditCollectionScreen from '../screens/EditCollectionScreen';
import SupportTicketDetailScreen from '../screens/SupportTicketDetailScreen';
// UI-19 — Sell / Co-own / Chat marketplace UX
import ListingPreviewScreen from '../screens/ListingPreviewScreen';
import TradeConfirmScreen from '../screens/TradeConfirmScreen';

// Phase 13 — Settings integrity
import ChatSettingsScreen from '../screens/ChatSettingsScreen';
import ActiveSessionsScreen from '../screens/ActiveSessionsScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import PrivacySettingsScreen from '../screens/PrivacySettingsScreen';
import AboutScreen from '../screens/AboutScreen';

// Diagnostic — dev only
import RuntimeSmokeTestScreen from '../screens/RuntimeSmokeTestScreen';

const Stack = createStackNavigator<RootStackParamList>();

const pushScreenOptions = {
  headerShown: false,
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  gestureEnabled: true,
  gestureDirection: 'horizontal' as const,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: {
        duration: Motion.navigation.pushOpenDuration,
      },
    },
    close: {
      animation: 'timing' as const,
      config: {
        duration: Motion.navigation.pushCloseDuration,
      },
    },
  },
};

const modalScreenOptions = {
  presentation: 'modal' as const,
  cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
  gestureEnabled: true,
  gestureDirection: 'vertical' as const,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: {
        duration: Motion.navigation.modalOpenDuration,
      },
    },
    close: {
      animation: 'timing' as const,
      config: {
        duration: Motion.navigation.modalCloseDuration,
      },
    },
  },
};

const transparentSheetScreenOptions = {
  presentation: 'transparentModal' as const,
  headerShown: false,
  cardOverlayEnabled: true,
  cardStyle: { backgroundColor: 'transparent' },
  gestureEnabled: false,
  animationEnabled: false,
};

export default function AppNavigator() {
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  return (
    <Stack.Navigator
      key={isAuthenticated ? 'authenticated' : 'anonymous'}
      initialRouteName={isAuthenticated ? 'MainTabs' : 'AuthLanding'}
      screenOptions={pushScreenOptions}
    >

      {/* Auth Flow */}
      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />

      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
      <Stack.Screen name="Browse" component={BrowseScreen} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
      <Stack.Screen name="Closet" component={ClosetScreen} />
      <Stack.Screen name="CollectionDetail" component={CollectionDetailScreen} />
      <Stack.Screen name="PosterViewer" component={PosterViewerScreen} options={modalScreenOptions} />
      <Stack.Screen name="CreatePoster" component={CreatePosterScreen} options={modalScreenOptions} />
      <Stack.Screen name="PosterStoryActivity" component={PosterStoryActivityScreen} options={modalScreenOptions} />
      <Stack.Screen name="PosterArchive" component={PosterArchiveScreen} options={modalScreenOptions} />
      <Stack.Screen name="PosterHighlightEditor" component={PosterHighlightEditorScreen} options={modalScreenOptions} />

      <Stack.Screen name="CreateAuction" component={CreateAuctionScreen} options={modalScreenOptions} />
      <Stack.Screen name="CreateCoOwn" component={CreateCoOwnScreen} options={modalScreenOptions} />
      <Stack.Screen name="MarketLedger" component={MarketLedgerScreen} />
      <Stack.Screen name="CoOwnHub" component={CoOwnHubScreen} />
      <Stack.Screen name="AssetDetail" component={AssetDetailScreen} />
      <Stack.Screen name="Trade" component={TradeScreen} options={modalScreenOptions} />
      <Stack.Screen name="Portfolio" component={PortfolioScreen} />
      <Stack.Screen name="MyBids" component={MyBidsScreen} />
      <Stack.Screen name="MyListings" component={MyListingsScreen} />
      <Stack.Screen name="CoOwnOrderHistory" component={CoOwnOrderHistoryScreen} />
      <Stack.Screen name="AssetLeaderboard" component={AssetLeaderboardScreen} />
      <Stack.Screen name="Buyout" component={BuyoutScreen} />
      <Stack.Screen name="CoOwnOnboarding" component={CoOwnOnboardingScreen} options={modalScreenOptions} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="CreateGroupChat" component={CreateGroupChatScreen} options={modalScreenOptions} />
      <Stack.Screen name="GroupBotDirectory" component={GroupBotDirectoryScreen} options={modalScreenOptions} />
      <Stack.Screen name="GroupChatInfo" component={GroupChatInfoScreen} />
      <Stack.Screen name="GroupMembers" component={GroupMembersScreen} />
      <Stack.Screen name="GroupBotManagement" component={GroupBotManagementScreen} />
      <Stack.Screen name="BotDirectory" component={BotDirectoryScreen} />
      <Stack.Screen name="BotDetail" component={BotDetailScreen} />
      <Stack.Screen name="CustomBots" component={CustomBotsScreen} />
      <Stack.Screen name="BotBuilder" component={BotBuilderScreen} options={modalScreenOptions} />
      <Stack.Screen name="EditGroup" component={EditGroupScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="Balance" component={BalanceScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} />
      <Stack.Screen name="Personalisation" component={PersonalisationScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />

      {/* Phase 16 new screens */}
      <Stack.Screen name="MakeOffer" component={MakeOfferScreen} />
      <Stack.Screen name="PushNotifications" component={PushNotificationsScreen} />
      <Stack.Screen name="Postage" component={PostageScreen} />
      <Stack.Screen name="InviteFriends" component={InviteFriendsScreen} />
      <Stack.Screen name="BalanceHistory" component={BalanceHistoryScreen} />

      {/* Phase 17 new screens */}
      <Stack.Screen name="AddBankAccount" component={AddBankAccountScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />

      {/* Phase 18 new screens */}
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
      <Stack.Screen name="SellerFulfilment" component={SellerFulfilmentScreen} />
      <Stack.Screen name="OrderReceipt" component={OrderReceiptScreen} />

      {/* Phase 19 new screens */}
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="AddressForm" component={AddressFormScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
      <Stack.Screen name="ManageListing" component={ManageListingScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="CategoryTree" component={CategoryTreeScreen} />

      {/* Phase 24 new screens */}
      <Stack.Screen name="GlobalSearch" component={GlobalSearchScreen} />

      {/* Phase 25 new screens */}
      <Stack.Screen name="Filter" component={FilterScreen} options={transparentSheetScreenOptions} />
      <Stack.Screen name="ListingSuccess" component={ListingSuccessScreen} />
      <Stack.Screen name="EditListing" component={EditListingScreen} options={modalScreenOptions} />

      {/* Phase 27 new screens */}
      <Stack.Screen name="NotificationsList" component={NotificationsScreen} />

      {/* Phase 28 new screens */}
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="TwoFactorSetup" component={TwoFactorSetupScreen} />
      <Stack.Screen name="WriteReview" component={WriteReviewScreen} options={modalScreenOptions} />
      <Stack.Screen name="Report" component={ReportScreen} options={modalScreenOptions} />

      {/* Visual Search */}
      <Stack.Screen name="VisualSearch" component={VisualSearchScreen} />

      {/* Explore / Creator screens */}
      <Stack.Screen name="CreateLook" component={CreateLookScreen} options={modalScreenOptions} />
      <Stack.Screen name="OutfitBuilder" component={OutfitBuilderScreen} options={modalScreenOptions} />
      <Stack.Screen name="CoOwnIssue" component={CoOwnIssueScreen} options={modalScreenOptions} />
      {/* UI-22R.6B — Experience elevation */}
      <Stack.Screen name="LookDetail" component={LookDetailScreen} />
      <Stack.Screen name="PulseFeed" component={PulseFeedScreen} />
      <Stack.Screen name="ExploreCollection" component={ExploreCollectionScreen} />
      <Stack.Screen name="StyleQuiz" component={StyleQuizScreen} options={modalScreenOptions} />

      {/* Phase 13 — Settings integrity */}
      <Stack.Screen name="ChatSettings" component={ChatSettingsScreen} />
      <Stack.Screen name="ActiveSessions" component={ActiveSessionsScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />

      {/* VISUAL-15 — UI Architecture + Feature Depth */}
      <Stack.Screen name="ConversationInfo" component={ConversationInfoScreen} />
      <Stack.Screen name="MessageRequests" component={MessageRequestsScreen} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} options={modalScreenOptions} />
      <Stack.Screen name="SharedConversationMedia" component={SharedConversationMediaScreen} />
      <Stack.Screen name="ManageCollectionItems" component={ManageCollectionItemsScreen} />
      <Stack.Screen name="CreateCollection" component={CreateCollectionScreen} options={modalScreenOptions} />
      <Stack.Screen name="OrderSupport" component={OrderSupportScreen} />
      <Stack.Screen name="ChatMediaPreview" component={ChatMediaPreviewScreen} options={modalScreenOptions} />
      {/* UI-18 — Reference-perfect product UX */}
      <Stack.Screen name="EditCollection" component={EditCollectionScreen} options={modalScreenOptions} />
      <Stack.Screen name="SupportTicketDetail" component={SupportTicketDetailScreen} />
      {/* UI-19 — Sell / Co-own / Chat marketplace UX */}
      <Stack.Screen name="ListingPreview" component={ListingPreviewScreen} options={modalScreenOptions} />
      <Stack.Screen name="TradeConfirm" component={TradeConfirmScreen} options={modalScreenOptions} />

      {/* Diagnostic — dev only */}
      {__DEV__ && (
        <Stack.Screen name="RuntimeSmokeTest" component={RuntimeSmokeTestScreen} />
      )}
    </Stack.Navigator>
  );
}