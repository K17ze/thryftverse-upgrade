/**
 * E2E smoke test plan — ThryftVerse
 *
 * This file is the canonical ownership gate for every critical user journey.
 * Each journey is asserted as an executable `it` (not a `it.todo`) that
 * proves the journey is OWNED by the codebase:
 *
 *   1. The screen/component that backs the journey exists in `src/screens/`.
 *   2. The Maestro flow file that drives the E2E execution exists in
 *      `.maestro/`. If the flow is missing, the test FAILS with a clear
 *      message: "Maestro flow not found for journey: X. Create .maestro/X.yml".
 *
 * Why executable ownership (not `it.todo`):
 *   - The audit found that `it.todo` placeholders "do not prove user-visible
 *     closure." A pending todo is invisible closure; a failing ownership
 *     assertion is visible closure.
 *   - The codebase has 1178 unit/contract/runtime tests but ZERO E2E
 *     tests (P1 production-readiness gap, AGENTS.md §15). These tests make
 *     the gap FAIL in every CI run rather than silently pending, and give
 *     engineers a checklist to implement against.
 *
 * Relationship to Maestro:
 *   - `app-launch.yml`        → "App launches and renders"
 *   - `onboarding-flow.yml`   → "Onboarding completes and reaches auth"
 *   - `navigation-flow.yml`   → "Primary tab navigation works"
 *   - `search-flow.yml`       → "Search returns results"
 *   - `item-detail-flow.yml`  → "Item detail loads with commerce content"
 *   - The remaining journeys below are not yet backed by a flow file and
 *     are the next milestones for the E2E suite — their ownership tests
 *     fail until the corresponding `.maestro/*.yml` flow is created.
 *
 * Run (the Maestro-backed subset):
 *   npm run test:e2e:smoke
 *   npm run test:e2e
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

const SCREENS_DIR = resolve(__dirname, '..', 'screens');
const MAESTRO_DIR = resolve(__dirname, '..', '..', '.maestro');

/** Returns true when a screen file exists under `src/screens/`. */
function screenExists(name: string): boolean {
  return existsSync(resolve(SCREENS_DIR, name));
}

/** Returns true when a Maestro flow file exists under `.maestro/`. */
function maestroFlowExists(name: string): boolean {
  return existsSync(resolve(MAESTRO_DIR, name));
}

/**
 * Asserts that the screen backing a journey exists. Throws a clear,
 * actionable error when the screen is missing so the failure names the
 * exact file that must be created.
 */
function expectScreen(name: string, journey: string): void {
  if (!screenExists(name)) {
    throw new Error(
      `Screen not found for journey "${journey}". Create src/screens/${name}.`
    );
  }
}

/**
 * Asserts that the Maestro flow backing a journey exists. Throws a clear,
 * actionable error when the flow is missing so the failure names the exact
 * flow file that must be created.
 */
function expectMaestroFlow(flowName: string, journey: string): void {
  if (!maestroFlowExists(flowName)) {
    throw new Error(
      `Maestro flow not found for journey: ${journey}. Create .maestro/${flowName}`
    );
  }
}

describe('E2E smoke test plan — critical user journeys', () => {
  // ── Launch & onboarding ──
  describe('App launch', () => {
    it('should launch and render the first screen within 5s — journey owned', () => {
      const journey = 'should launch and render the first screen within 5s';
      expectScreen('HomeScreen.tsx', journey);
      expectMaestroFlow('app-launch.yml', journey);
    });

    it('should show the splash screen then transition to first route — journey owned', () => {
      const journey = 'should show the splash screen then transition to first route';
      expectScreen('HomeScreen.tsx', journey);
      expectMaestroFlow('app-launch.yml', journey);
    });

    it('should not crash on cold start with no persisted state — journey owned', () => {
      const journey = 'should not crash on cold start with no persisted state';
      expectScreen('HomeScreen.tsx', journey);
      expectMaestroFlow('app-launch.yml', journey);
    });
  });

  describe('Onboarding', () => {
    it('should show the age-verification gate on first launch — journey owned', () => {
      const journey = 'should show the age-verification gate on first launch';
      expectScreen('AgeVerificationScreen.tsx', journey);
      expectMaestroFlow('onboarding-flow.yml', journey);
    });

    it('should advance through all 4 onboarding slides — journey owned', () => {
      const journey = 'should advance through all 4 onboarding slides';
      expectScreen('OnboardingScreen.tsx', journey);
      expectMaestroFlow('onboarding-flow.yml', journey);
    });

    it('should reach AuthLanding after completing onboarding — journey owned', () => {
      const journey = 'should reach AuthLanding after completing onboarding';
      expectScreen('AuthLandingScreen.tsx', journey);
      expectMaestroFlow('onboarding-flow.yml', journey);
    });

    it('should skip onboarding via the Skip control — journey owned', () => {
      const journey = 'should skip onboarding via the Skip control';
      expectScreen('OnboardingScreen.tsx', journey);
      expectMaestroFlow('onboarding-flow.yml', journey);
    });

    it('should not re-show onboarding on subsequent launches — journey owned', () => {
      const journey = 'should not re-show onboarding on subsequent launches';
      expectScreen('OnboardingScreen.tsx', journey);
      expectMaestroFlow('onboarding-flow.yml', journey);
    });
  });

  // ── Authentication ──
  describe('Authentication', () => {
    it('should sign up a new user with email and password — journey owned', () => {
      const journey = 'should sign up a new user with email and password';
      expectScreen('SignUpScreen.tsx', journey);
      expectMaestroFlow('auth-flow.yml', journey);
    });

    it('should sign in an existing user — journey owned', () => {
      const journey = 'should sign in an existing user';
      expectScreen('LoginScreen.tsx', journey);
      expectMaestroFlow('auth-flow.yml', journey);
    });

    it('should sign in with Apple (iOS) — journey owned', () => {
      const journey = 'should sign in with Apple (iOS)';
      expectScreen('LoginScreen.tsx', journey);
      expectMaestroFlow('auth-flow.yml', journey);
    });

    it('should send a password-reset email from ForgotPassword — journey owned', () => {
      const journey = 'should send a password-reset email from ForgotPassword';
      expectScreen('ForgotPasswordScreen.tsx', journey);
      expectMaestroFlow('auth-flow.yml', journey);
    });

    it('should sign out and return to AuthLanding — journey owned', () => {
      const journey = 'should sign out and return to AuthLanding';
      expectScreen('AuthLandingScreen.tsx', journey);
      expectMaestroFlow('auth-flow.yml', journey);
    });

    it('should persist the session across app restarts — journey owned', () => {
      const journey = 'should persist the session across app restarts';
      expectScreen('LoginScreen.tsx', journey);
      expectMaestroFlow('auth-flow.yml', journey);
    });
  });

  // ── Browse & discovery ──
  describe('Browse', () => {
    it('should load the Browse grid with listings — journey owned', () => {
      const journey = 'should load the Browse grid with listings';
      expectScreen('BrowseScreen.tsx', journey);
      expectMaestroFlow('navigation-flow.yml', journey);
    });

    it('should filter listings by category — journey owned', () => {
      const journey = 'should filter listings by category';
      expectScreen('CategoryDetailScreen.tsx', journey);
      expectMaestroFlow('navigation-flow.yml', journey);
    });

    it('should open the FilterScreen and apply filters — journey owned', () => {
      const journey = 'should open the FilterScreen and apply filters';
      expectScreen('FilterScreen.tsx', journey);
      expectMaestroFlow('navigation-flow.yml', journey);
    });

    it('should pull-to-refresh the Browse grid — journey owned', () => {
      const journey = 'should pull-to-refresh the Browse grid';
      expectScreen('BrowseScreen.tsx', journey);
      expectMaestroFlow('navigation-flow.yml', journey);
    });

    it('should show the empty state when no listings match — journey owned', () => {
      const journey = 'should show the empty state when no listings match';
      expectScreen('BrowseScreen.tsx', journey);
      expectMaestroFlow('navigation-flow.yml', journey);
    });
  });

  describe('Search', () => {
    it('should open search from the Explore tab — journey owned', () => {
      const journey = 'should open search from the Explore tab';
      expectScreen('SearchScreen.tsx', journey);
      expectMaestroFlow('search-flow.yml', journey);
    });

    it('should return results for a text query ("vintage denim") — journey owned', () => {
      const journey = 'should return results for a text query ("vintage denim")';
      expectScreen('GlobalSearchScreen.tsx', journey);
      expectMaestroFlow('search-flow.yml', journey);
    });

    it('should show recent searches on first focus — journey owned', () => {
      const journey = 'should show recent searches on first focus';
      expectScreen('SavedSearchesScreen.tsx', journey);
      expectMaestroFlow('search-flow.yml', journey);
    });

    it('should clear the query and return to discover — journey owned', () => {
      const journey = 'should clear the query and return to discover';
      expectScreen('GlobalSearchScreen.tsx', journey);
      expectMaestroFlow('search-flow.yml', journey);
    });

    it('should save a search alert — journey owned', () => {
      const journey = 'should save a search alert';
      expectScreen('SavedSearchesScreen.tsx', journey);
      expectMaestroFlow('search-flow.yml', journey);
    });
  });

  // ── Item detail & commerce ──
  describe('Item detail', () => {
    it('should load item detail with image, title, and price — journey owned', () => {
      const journey = 'should load item detail with image, title, and price';
      expectScreen('ItemDetailScreen.tsx', journey);
      expectMaestroFlow('item-detail-flow.yml', journey);
    });

    it('should swipe through the media gallery — journey owned', () => {
      const journey = 'should swipe through the media gallery';
      expectScreen('ItemDetailScreen.tsx', journey);
      expectMaestroFlow('item-detail-flow.yml', journey);
    });

    it('should open the fullscreen media viewer — journey owned', () => {
      const journey = 'should open the fullscreen media viewer';
      expectScreen('ItemDetailScreen.tsx', journey);
      expectMaestroFlow('item-detail-flow.yml', journey);
    });

    it('should save an item to a collection — journey owned', () => {
      const journey = 'should save an item to a collection';
      expectScreen('CollectionDetailScreen.tsx', journey);
      expectMaestroFlow('item-detail-flow.yml', journey);
    });

    it('should share an item listing — journey owned', () => {
      const journey = 'should share an item listing';
      expectScreen('ItemDetailScreen.tsx', journey);
      expectMaestroFlow('item-detail-flow.yml', journey);
    });

    it('should show seller trust signals and reviews — journey owned', () => {
      const journey = 'should show seller trust signals and reviews';
      expectScreen('ItemDetailScreen.tsx', journey);
      expectMaestroFlow('item-detail-flow.yml', journey);
    });
  });

  describe('Add to cart / bundle bag', () => {
    it('should add an item to the bundle bag — journey owned', () => {
      const journey = 'should add an item to the bundle bag';
      expectScreen('BundleBagScreen.tsx', journey);
      expectMaestroFlow('bundle-bag-flow.yml', journey);
    });

    it('should show the bundle bag with the added item — journey owned', () => {
      const journey = 'should show the bundle bag with the added item';
      expectScreen('BundleBagScreen.tsx', journey);
      expectMaestroFlow('bundle-bag-flow.yml', journey);
    });

    it('should remove an item from the bundle bag — journey owned', () => {
      const journey = 'should remove an item from the bundle bag';
      expectScreen('BundleBagScreen.tsx', journey);
      expectMaestroFlow('bundle-bag-flow.yml', journey);
    });

    it('should update the bundle total when items change — journey owned', () => {
      const journey = 'should update the bundle total when items change';
      expectScreen('BundleBagScreen.tsx', journey);
      expectMaestroFlow('bundle-bag-flow.yml', journey);
    });
  });

  describe('Checkout', () => {
    it('should proceed from bundle bag to checkout — journey owned', () => {
      const journey = 'should proceed from bundle bag to checkout';
      expectScreen('CheckoutScreen.tsx', journey);
      expectMaestroFlow('checkout-flow.yml', journey);
    });

    it('should select a saved shipping address — journey owned', () => {
      const journey = 'should select a saved shipping address';
      expectScreen('SavedAddressesScreen.tsx', journey);
      expectMaestroFlow('checkout-flow.yml', journey);
    });

    it('should select a payment method — journey owned', () => {
      const journey = 'should select a payment method';
      expectScreen('PaymentsScreen.tsx', journey);
      expectMaestroFlow('checkout-flow.yml', journey);
    });

    it('should place an order and show the receipt — journey owned', () => {
      const journey = 'should place an order and show the receipt';
      expectScreen('OrderReceiptScreen.tsx', journey);
      expectMaestroFlow('checkout-flow.yml', journey);
    });

    it('should handle a declined payment gracefully — journey owned', () => {
      const journey = 'should handle a declined payment gracefully';
      expectScreen('CheckoutScreen.tsx', journey);
      expectMaestroFlow('checkout-flow.yml', journey);
    });
  });

  // ── Messaging ──
  describe('Messaging', () => {
    it('should open the Inbox and list conversations — journey owned', () => {
      const journey = 'should open the Inbox and list conversations';
      expectScreen('InboxScreen.tsx', journey);
      expectMaestroFlow('messaging-flow.yml', journey);
    });

    it('should open a conversation and send a text message — journey owned', () => {
      const journey = 'should open a conversation and send a text message';
      expectScreen('ChatScreen.tsx', journey);
      expectMaestroFlow('messaging-flow.yml', journey);
    });

    it('should send a photo attachment — journey owned', () => {
      const journey = 'should send a photo attachment';
      expectScreen('ChatMediaPreviewScreen.tsx', journey);
      expectMaestroFlow('messaging-flow.yml', journey);
    });

    it('should show typing indicator when the peer types — journey owned', () => {
      const journey = 'should show typing indicator when the peer types';
      expectScreen('ChatScreen.tsx', journey);
      expectMaestroFlow('messaging-flow.yml', journey);
    });

    it('should open message requests and accept one — journey owned', () => {
      const journey = 'should open message requests and accept one';
      expectScreen('MessageRequestsScreen.tsx', journey);
      expectMaestroFlow('messaging-flow.yml', journey);
    });

    it('should archive a conversation — journey owned', () => {
      const journey = 'should archive a conversation';
      expectScreen('ArchivedConversationsScreen.tsx', journey);
      expectMaestroFlow('messaging-flow.yml', journey);
    });
  });

  // ── Profile & settings ──
  describe('Profile', () => {
    it('should open MyProfile and show shop + looks tabs — journey owned', () => {
      const journey = 'should open MyProfile and show shop + looks tabs';
      expectScreen('MyProfileScreen.tsx', journey);
      expectMaestroFlow('profile-flow.yml', journey);
    });

    it('should edit the profile and save changes — journey owned', () => {
      const journey = 'should edit the profile and save changes';
      expectScreen('EditProfileScreen.tsx', journey);
      expectMaestroFlow('profile-flow.yml', journey);
    });

    it('should open a public seller profile from an item — journey owned', () => {
      const journey = 'should open a public seller profile from an item';
      expectScreen('UserProfileScreen.tsx', journey);
      expectMaestroFlow('profile-flow.yml', journey);
    });

    it('should follow / unfollow a seller — journey owned', () => {
      const journey = 'should follow / unfollow a seller';
      expectScreen('UserProfileScreen.tsx', journey);
      expectMaestroFlow('profile-flow.yml', journey);
    });

    it('should view seller reviews — journey owned', () => {
      const journey = 'should view seller reviews';
      expectScreen('UserProfileScreen.tsx', journey);
      expectMaestroFlow('profile-flow.yml', journey);
    });
  });

  describe('Settings', () => {
    it('should open Settings from the Profile tab — journey owned', () => {
      const journey = 'should open Settings from the Profile tab';
      expectScreen('SettingsScreen.tsx', journey);
      expectMaestroFlow('settings-flow.yml', journey);
    });

    it('should toggle push notifications — journey owned', () => {
      const journey = 'should toggle push notifications';
      expectScreen('PushNotificationsScreen.tsx', journey);
      expectMaestroFlow('settings-flow.yml', journey);
    });

    it('should change the theme (light / dark / system) — journey owned', () => {
      const journey = 'should change the theme (light / dark / system)';
      expectScreen('SettingsScreen.tsx', journey);
      expectMaestroFlow('settings-flow.yml', journey);
    });

    it('should open Privacy settings — journey owned', () => {
      const journey = 'should open Privacy settings';
      expectScreen('PrivacySettingsScreen.tsx', journey);
      expectMaestroFlow('settings-flow.yml', journey);
    });

    it('should open Accessibility settings — journey owned', () => {
      const journey = 'should open Accessibility settings';
      expectScreen('AccessibilitySettingsScreen.tsx', journey);
      expectMaestroFlow('settings-flow.yml', journey);
    });

    it('should export account data — journey owned', () => {
      const journey = 'should export account data';
      expectScreen('DataExportScreen.tsx', journey);
      expectMaestroFlow('settings-flow.yml', journey);
    });
  });

  // ── Galleria & co-ownership ──
  describe('Galleria', () => {
    it('should open the Galleria screen from Home — journey owned', () => {
      const journey = 'should open the Galleria screen from Home';
      expectScreen('GalleriaScreen.tsx', journey);
      expectMaestroFlow('galleria-flow.yml', journey);
    });

    it('should load featured assets and editorial collections — journey owned', () => {
      const journey = 'should load featured assets and editorial collections';
      expectScreen('GalleriaScreen.tsx', journey);
      expectMaestroFlow('galleria-flow.yml', journey);
    });

    it('should open a Galleria collection detail — journey owned', () => {
      const journey = 'should open a Galleria collection detail';
      expectScreen('GalleriaCollectionDetailScreen.tsx', journey);
      expectMaestroFlow('galleria-flow.yml', journey);
    });

    it('should open an asset detail with chart and order book — journey owned', () => {
      const journey = 'should open an asset detail with chart and order book';
      expectScreen('AssetDetailScreen.tsx', journey);
      expectMaestroFlow('galleria-flow.yml', journey);
    });
  });

  describe('Co-ownership / trade', () => {
    it('should place a buy order on an asset — journey owned', () => {
      const journey = 'should place a buy order on an asset';
      expectScreen('TradeConfirmScreen.tsx', journey);
      expectMaestroFlow('trade-flow.yml', journey);
    });

    it('should show the trade receipt after a fill — journey owned', () => {
      const journey = 'should show the trade receipt after a fill';
      expectScreen('TradeConfirmScreen.tsx', journey);
      expectMaestroFlow('trade-flow.yml', journey);
    });

    it('should open the Portfolio and show positions — journey owned', () => {
      const journey = 'should open the Portfolio and show positions';
      expectScreen('PortfolioScreen.tsx', journey);
      expectMaestroFlow('trade-flow.yml', journey);
    });
  });

  // ── Moodboard / looks / posters ──
  describe('Moodboard / Looks', () => {
    it('should open the Looks tab on Explore — journey owned', () => {
      const journey = 'should open the Looks tab on Explore';
      expectScreen('LookDetailScreen.tsx', journey);
      expectMaestroFlow('looks-flow.yml', journey);
    });

    it('should open a look detail with tagged pieces — journey owned', () => {
      const journey = 'should open a look detail with tagged pieces';
      expectScreen('LookDetailScreen.tsx', journey);
      expectMaestroFlow('looks-flow.yml', journey);
    });

    it('should create a new look from the Create tab — journey owned', () => {
      const journey = 'should create a new look from the Create tab';
      expectMaestroFlow('looks-flow.yml', journey);
    });

    it('should like and comment on a look — journey owned', () => {
      const journey = 'should like and comment on a look';
      expectScreen('LookDetailScreen.tsx', journey);
      expectMaestroFlow('looks-flow.yml', journey);
    });
  });

  describe('Posters', () => {
    it('should view a poster story from the Home feed — journey owned', () => {
      const journey = 'should view a poster story from the Home feed';
      expectScreen('PosterStoryActivityScreen.tsx', journey);
      expectMaestroFlow('posters-flow.yml', journey);
    });

    it('should create a poster from the Create flow — journey owned', () => {
      const journey = 'should create a poster from the Create flow';
      expectScreen('CreatePosterHighlightScreen.tsx', journey);
      expectMaestroFlow('posters-flow.yml', journey);
    });

    it('should react to a poster with an emoji — journey owned', () => {
      const journey = 'should react to a poster with an emoji';
      expectScreen('PosterViewerScreen.tsx', journey);
      expectMaestroFlow('posters-flow.yml', journey);
    });
  });
});
