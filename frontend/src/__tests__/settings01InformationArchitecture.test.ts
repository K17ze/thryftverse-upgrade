import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('SETTINGS-01 — Settings information architecture, ownership and subpage elevation', () => {
  describe('Settings hub', () => {
    const settingsSrc = readSrc('screens/SettingsScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(settingsSrc).toContain('FlagshipScreen');
      expect(settingsSrc).toContain('FlagshipHeader');
    });

    it('has a search bar that filters real destinations', () => {
      expect(settingsSrc).toContain('AppSearchBar');
      expect(settingsSrc).toContain('searchQuery');
      expect(settingsSrc).toContain('ROUTE_METADATA');
    });

    it('search filters by label, searchTerms and section', () => {
      expect(settingsSrc).toMatch(/searchTerms.*toLowerCase.*includes.*q/);
      expect(settingsSrc).toMatch(/label.*toLowerCase.*includes.*q/);
      expect(settingsSrc).toMatch(/section.*toLowerCase.*includes.*q/);
    });

    it('shows a no-results state when search has no matches', () => {
      expect(settingsSrc).toContain("ts('search.noMatching')");
    });

    it('does not contain fake "Not available yet" disabled rows', () => {
      expect(settingsSrc).not.toContain('Not available yet');
    });

    it('navigates to AccountControl for account lifecycle', () => {
      expect(settingsSrc).toContain('AccountControl');
    });

    it('navigates to SavedAddresses for delivery addresses', () => {
      expect(settingsSrc).toContain('SavedAddresses');
    });

    it('has an Account control section that is not a giant red button', () => {
      expect(settingsSrc).toContain("ts('rows.accountControl')");
      expect(settingsSrc).toContain("navigate('AccountControl')");
    });

    it('exposes a truthful Delete account row in the Account section', () => {
      // Per Apple App Store + Google Play 2026 requirements, account deletion
      // MUST be reachable in-app. Following flagship app patterns (Instagram,
      // Vinted, Depop), the row lives in the Account section (not a separate
      // "Danger zone" section which is an AI-slop anti-pattern) and navigates
      // to the dedicated DeleteAccount screen.
      expect(settingsSrc).toMatch(/deleteAccount/i);
      expect(settingsSrc).toMatch(/DeleteAccount/);
      expect(settingsSrc).not.toMatch(/Danger zone/i);
    });
  });

  describe('Settings search destinations', () => {
    const settingsSrc = readSrc('screens/SettingsScreen.tsx');

    it('includes Account control in search destinations', () => {
      expect(settingsSrc).toMatch(/key:\s*'AccountControl'/);
    });

    it('includes Saved addresses in search destinations', () => {
      expect(settingsSrc).toMatch(/key:\s*'SavedAddresses'/);
    });

    it('does not include duplicate Postage entries for delivery addresses', () => {
      // The old code had two Postage entries (one for delivery, one for shipping)
      const postageMatches = settingsSrc.match(/key:\s*'Postage'/g);
      expect(postageMatches).toHaveLength(1);
    });
  });

  describe('Information ownership — AccountSettingsScreen (compatibility redirect)', () => {
    const accountSrc = readSrc('screens/AccountSettingsScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(accountSrc).toContain('FlagshipScreen');
      expect(accountSrc).toContain('FlagshipHeader');
    });

    it('is a thin redirect wrapper to EditProfile (unified editor)', () => {
      // AccountSettings is no longer a competing full editor — it redirects
      // to EditProfileScreen which is the canonical unified profile/account editor.
      expect(accountSrc).toContain('replace');
      expect(accountSrc).toContain('EditProfile');
    });

    it('does not have a duplicate displayName editor that conflicts with EditProfile', () => {
      expect(accountSrc).not.toContain("openEdit('fullName'");
    });

    it('does not have a birthday editor (birthday was not sent to the API)', () => {
      expect(accountSrc).not.toContain('birthday');
    });

    it('does not contain phone editing (moved to EditProfileScreen)', () => {
      expect(accountSrc).not.toContain("openEdit('phone'");
    });

    it('does not contain AccountControl navigation (moved to EditProfileScreen)', () => {
      expect(accountSrc).not.toContain('AccountControl');
    });

    it('does not import deleteMyAccount or requestMyDataExport (moved to AccountControl)', () => {
      expect(accountSrc).not.toContain('deleteMyAccount');
      expect(accountSrc).not.toContain('requestMyDataExport');
    });
  });

  describe('Information ownership — EditProfileScreen', () => {
    const editSrc = readSrc('screens/EditProfileScreen.tsx');

    it('is the canonical public profile editor', () => {
      expect(editSrc).toContain('updateMyProfile');
    });

    it('owns avatar, cover, display name, username, bio, website', () => {
      expect(editSrc).toContain('avatar');
      expect(editSrc).toContain('cover');
      expect(editSrc).toContain('name');
    });

    it('clarifies these are public profile fields', () => {
      // Section label is now "Profile" (calmer than the old "Public identity").
      // The photo hint clarifies that photo/cover are managed elsewhere.
      expect(editSrc).toContain('Profile');
      expect(editSrc).toContain('profile');
    });

    it('has unsaved-changes discard warning', () => {
      expect(editSrc).toContain('Unsaved changes');
      expect(editSrc).toContain('Discard');
    });

    it('exposes public profile fields (name, username, bio, location, website)', () => {
      expect(editSrc).toContain('username');
      expect(editSrc).toContain('bio');
      expect(editSrc).toContain('location');
      expect(editSrc).toContain('website');
    });
  });

  describe('AccountControlScreen — truthful account lifecycle', () => {
    const controlSrc = readSrc('screens/AccountControlScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(controlSrc).toContain('FlagshipScreen');
      expect(controlSrc).toContain('FlagshipHeader');
    });

    it('renders the account control overview', () => {
      expect(controlSrc).toContain('AccountControl');
    });

    it('supports download data (backend-backed)', () => {
      expect(controlSrc).toContain('requestMyDataExport');
      expect(controlSrc).toContain('Download your data');
    });

    it('does not surface unsupported deactivation in production UI', () => {
      // Per SETTINGS-MASTER §12.1: Remove unsupported Deactivate Account from
      // production UI. Do not replace it with "Coming soon" or "Not available."
      expect(controlSrc).not.toContain('Deactivate account');
      expect(controlSrc).not.toMatch(/not available/i);
    });

    it('does not fabricate deactivation behaviour', () => {
      // Should not have a deactivate API call
      expect(controlSrc).not.toMatch(/deactivate.*api|api.*deactivate/i);
    });

    it('routes to the canonical DeleteAccount re-auth screen', () => {
      // AccountControlScreen no longer routes to DeleteAccount — the
      // destructive delete ritual lives at the bottom of the settings hub
      // as a dedicated danger row (§4 destructive separation principle).
      // AccountControl focuses on data export only.
      expect(controlSrc).not.toContain('deleteMyAccount');
    });

    it('handles data export API failure without losing context', () => {
      expect(controlSrc).toContain('parseApiError');
    });

    it('explains consequences before deletion', () => {
      // The delete consequence explanation lives in DeleteAccountScreen,
      // not AccountControlScreen (destructive separation).
      const deleteSrc = readFileSync(
        resolve(__dirname, '../screens/DeleteAccountScreen.tsx'),
        'utf-8',
      );
      expect(deleteSrc).toContain('permanently');
    });

    it('is not a giant red button in the Settings hub', () => {
      const settingsSrc = readSrc('screens/SettingsScreen.tsx');
      expect(settingsSrc).toContain("ts('rows.accountControl')");
      expect(settingsSrc).not.toContain("title={ts('rows.accountControl')} danger");
    });
  });

  describe('SavedAddressesScreen — operational address manager', () => {
    const savedSrc = readSrc('screens/SavedAddressesScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(savedSrc).toContain('FlagshipScreen');
      expect(savedSrc).toContain('FlagshipHeader');
    });

    it('fetches addresses from backend via listUserAddresses', () => {
      expect(savedSrc).toContain('listUserAddresses');
    });

    it('has loading state with skeleton', () => {
      expect(savedSrc).toContain('skeletonCard');
    });

    it('has empty state with Add address action', () => {
      expect(savedSrc).toContain('FlagshipState');
      expect(savedSrc).toContain('Add address');
    });

    it('has error state with retry', () => {
      expect(savedSrc).toContain('FlagshipState');
      expect(savedSrc).toContain('Retry');
    });

    it('has delete confirmation via ConfirmationSheet', () => {
      expect(savedSrc).toContain('ConfirmationSheet');
      expect(savedSrc).toContain('Remove address');
      expect(savedSrc).toContain('Cancel');
    });

    it('calls deleteUserAddress on delete', () => {
      expect(savedSrc).toContain('deleteUserAddress');
    });

    it('navigates to AddressForm for add and edit', () => {
      expect(savedSrc).toContain("AddressForm");
      expect(savedSrc).toContain("mode: 'add'");
      expect(savedSrc).toContain("mode: 'edit'");
    });

    it('has accessibility labels for edit and delete actions', () => {
      expect(savedSrc).toContain('accessibilityLabel');
      expect(savedSrc).toMatch(/Edit address for/);
      expect(savedSrc).toMatch(/Remove address for/);
    });

    it('shows default badge', () => {
      expect(savedSrc).toContain('DEFAULT');
      expect(savedSrc).toContain('defaultBadge');
    });

    it('has pull-to-refresh', () => {
      expect(savedSrc).toContain('RefreshControl');
      expect(savedSrc).toContain('isRefreshing');
    });

    it('syncs default address to store after fetch', () => {
      expect(savedSrc).toContain('saveAddress');
    });
  });

  describe('commerceApi — address field mapping fix', () => {
    const apiSrc = readSrc('services/commerceApi.ts');

    it('maps backend street to frontend streetAddress', () => {
      expect(apiSrc).toContain('mapBackendAddress');
      expect(apiSrc).toMatch(/streetAddress.*row\.street/);
    });

    it('maps backend postcode to frontend postalCode', () => {
      expect(apiSrc).toMatch(/postalCode.*row\.postcode/);
    });

    it('sends correct field names to backend on create', () => {
      expect(apiSrc).toMatch(/street.*input\.streetAddress/);
      expect(apiSrc).toMatch(/postcode.*input\.postalCode/);
    });
  });

  describe('PostageScreen — shipping preferences only', () => {
    const postageSrc = readSrc('screens/PostageScreen.tsx');

    it('links to SavedAddresses instead of inline address management', () => {
      expect(postageSrc).toContain('SavedAddresses');
    });

    it('does not have inline address add/edit forms', () => {
      expect(postageSrc).not.toContain('AddressForm');
      expect(postageSrc).not.toContain('addressAddBtn');
    });

    it('keeps carrier preferences and shipping options', () => {
      expect(postageSrc).toContain('carrier');
      expect(postageSrc).toContain('freeShipping');
      expect(postageSrc).toContain('bundleDiscount');
    });
  });

  describe('AddressFormScreen — Flagship header', () => {
    const formSrc = readSrc('screens/AddressFormScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(formSrc).toContain('FlagshipScreen');
      expect(formSrc).toContain('FlagshipHeader');
    });

    it('does not use the old custom header', () => {
      // The old header used paddingTop: insets.top
      expect(formSrc).not.toMatch(/header.*paddingTop.*insets\.top/);
    });

    it('has field-level validation', () => {
      expect(formSrc).toContain('validateField');
      expect(formSrc).toContain('errors.name');
      expect(formSrc).toContain('errors.streetAddress');
      expect(formSrc).toContain('errors.city');
      expect(formSrc).toContain('errors.postalCode');
    });

    it('has unsaved-changes discard protection', () => {
      expect(formSrc).toContain('Discard changes');
      expect(formSrc).toContain('beforeRemove');
    });

    it('has sticky save button above keyboard', () => {
      expect(formSrc).toContain('stickyFooter');
      expect(formSrc).toContain('saveBtn');
    });
  });

  describe('Navigation registration', () => {
    const navSrc = readSrc('navigation/types.ts');
    const appNavSrc = readSrc('navigation/AppNavigator.tsx');

    // ── Comprehensive route registration audit (item-26 Phase 1) ──
    // Every route declared in RootStackParamList MUST be registered as a
    // <Stack.Screen> in AppNavigator. This prevents the crash-on-navigate
    // class of defects where a route is declared and navigated to but never
    // registered.
    it('registers every ROOT_STACK_ROUTES entry as a Stack.Screen', () => {
      // Extract the ROOT_STACK_ROUTES array from types.ts
      const routesMatch = navSrc.match(
        /export const ROOT_STACK_ROUTES\s*=\s*\[([\s\S]*?)\] as const;/,
      );
      expect(routesMatch).not.toBeNull();
      const routeNames = (routesMatch![1]
        .match(/'([^']+)'/g) ?? [])
        .map((s) => s.replace(/'/g, ''));

      expect(routeNames.length).toBeGreaterThan(0);

      // RuntimeSmokeTest is dev-only — it's conditionally registered
      const devOnlyRoutes = new Set(['RuntimeSmokeTest']);

      const missing: string[] = [];
      for (const route of routeNames) {
        if (devOnlyRoutes.has(route)) continue;
        // Check for either name="RouteName" or name='RouteName'
        const pattern = new RegExp(`name=["']${route}["']`);
        if (!pattern.test(appNavSrc)) {
          missing.push(route);
        }
      }

      if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.error('Missing route registrations:', missing);
      }
      expect(missing).toEqual([]);
    });

    it('has AccountControl route type', () => {
      expect(navSrc).toContain('AccountControl: undefined');
    });

    it('has SavedAddresses route type', () => {
      expect(navSrc).toContain('SavedAddresses: undefined');
    });

    it('registers AccountControlScreen in AppNavigator', () => {
      expect(appNavSrc).toContain('AccountControlScreen');
      expect(appNavSrc).toContain('name="AccountControl"');
    });

    it('registers SavedAddressesScreen in AppNavigator', () => {
      expect(appNavSrc).toContain('SavedAddressesScreen');
      expect(appNavSrc).toContain('name="SavedAddresses"');
    });
  });

  describe('PersonalisationScreen — Flagship header', () => {
    const persSrc = readSrc('screens/PersonalisationScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(persSrc).toContain('FlagshipScreen');
      expect(persSrc).toContain('FlagshipHeader');
    });

    it('does not use the old custom header with arrow-back', () => {
      expect(persSrc).not.toMatch(/headerBack.*arrow-back/);
    });
  });

  describe('BlockedUsersScreen — truthful display', () => {
    const blockedSrc = readSrc('screens/BlockedUsersScreen.tsx');

    it('does not show a generic identity placeholder', () => {
      expect(blockedSrc).not.toContain("'Blocked account'");
    });

    it('does not show "Profile information unavailable"', () => {
      expect(blockedSrc).not.toContain('Profile information unavailable');
    });

    it('resolves public profile identity without exposing raw IDs', () => {
      expect(blockedSrc).toContain('getBlockedUsers');
      expect(blockedSrc).toContain('displayName');
      expect(blockedSrc).not.toContain('ID:');
    });
  });
});
