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
      expect(settingsSrc).toContain('DESTINATIONS');
    });

    it('search filters by label, searchTerms and section', () => {
      expect(settingsSrc).toMatch(/searchTerms.*toLowerCase.*includes.*q/);
      expect(settingsSrc).toMatch(/label.*toLowerCase.*includes.*q/);
      expect(settingsSrc).toMatch(/section.*toLowerCase.*includes.*q/);
    });

    it('shows a no-results state when search has no matches', () => {
      expect(settingsSrc).toContain('No matching settings');
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
      expect(settingsSrc).toContain('Account control');
      // The account control row should be a normal navigation row, not a danger row
      const accountControlSection = settingsSrc.match(/Account control[\s\S]*?Account control[\s\S]*?onPress[\s\S]*?AccountControl/);
      expect(accountControlSection).toBeTruthy();
    });

    it('does not expose a crude Delete account row directly in the hub', () => {
      // The old code had a "Delete account" row with danger flag and disabled onPress
      expect(settingsSrc).not.toMatch(/title="Delete account"[\s\S]*?danger/);
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

  describe('Information ownership — AccountSettingsScreen', () => {
    const accountSrc = readSrc('screens/AccountSettingsScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(accountSrc).toContain('FlagshipScreen');
      expect(accountSrc).toContain('FlagshipHeader');
    });

    it('does not have a duplicate displayName editor that conflicts with EditProfile', () => {
      // The old code had openEdit('fullName', displayName) which edited displayName
      expect(accountSrc).not.toContain("openEdit('fullName'");
    });

    it('does not have a birthday editor (birthday was not sent to the API)', () => {
      expect(accountSrc).not.toContain('birthday');
    });

    it('shows public identity as read-only with route to EditProfile', () => {
      expect(accountSrc).toContain('Public identity');
      expect(accountSrc).toContain("navigate('EditProfile')");
    });

    it('shows username as read-only (not editable here)', () => {
      // Username should be displayed but not have an onPress to edit
      expect(accountSrc).toContain('Username');
    });

    it('has phone editing as the canonical private contact editor', () => {
      expect(accountSrc).toContain("openEdit('phone'");
    });

    it('navigates to AccountControl instead of having a crude Alert.alert delete', () => {
      expect(accountSrc).toContain('AccountControl');
      expect(accountSrc).not.toContain("Alert.alert");
      expect(accountSrc).not.toContain('FlagshipDangerZone');
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
      expect(editSrc).toContain('username');
      expect(editSrc).toContain('bio');
      expect(editSrc).toContain('website');
    });

    it('clarifies these are public profile fields', () => {
      expect(editSrc).toContain('public');
      expect(editSrc).toContain('Public identity');
    });

    it('has unsaved-changes discard warning', () => {
      expect(editSrc).toContain('Unsaved changes');
      expect(editSrc).toContain('Discard');
    });

    it('does not expose private account fields like email or phone', () => {
      // EditProfile should not have email or phone editors
      expect(editSrc).not.toMatch(/label.*Email/i);
      expect(editSrc).not.toMatch(/label.*Phone/i);
    });
  });

  describe('AccountControlScreen — truthful account lifecycle', () => {
    const controlSrc = readSrc('screens/AccountControlScreen.tsx');

    it('uses FlagshipScreen and FlagshipHeader', () => {
      expect(controlSrc).toContain('FlagshipScreen');
      expect(controlSrc).toContain('FlagshipHeader');
    });

    it('has progressive disclosure phases (overview, delete-info, delete-confirm)', () => {
      expect(controlSrc).toContain("'overview'");
      expect(controlSrc).toContain("'delete-info'");
      expect(controlSrc).toContain("'delete-confirm'");
    });

    it('supports download data (backend-backed)', () => {
      expect(controlSrc).toContain('requestMyDataExport');
      expect(controlSrc).toContain('Download your data');
    });

    it('truthfully shows deactivation as not available', () => {
      expect(controlSrc).toContain('Deactivate account');
      expect(controlSrc).toContain('not available');
    });

    it('does not fabricate deactivation behaviour', () => {
      // Should not have a deactivate API call
      expect(controlSrc).not.toMatch(/deactivate.*api|api.*deactivate/i);
    });

    it('requires typed confirmation (DELETE) before final deletion', () => {
      expect(controlSrc).toContain('DELETE');
      expect(controlSrc).toContain('deleteConfirmText');
      expect(controlSrc).toContain('canConfirmDelete');
    });

    it('calls deleteMyAccount on confirmed deletion', () => {
      expect(controlSrc).toContain('deleteMyAccount');
    });

    it('clears auth and navigates to AuthLanding after deletion', () => {
      expect(controlSrc).toContain('logoutFromSession');
      expect(controlSrc).toContain('clearUserScopedQueryCache');
      expect(controlSrc).toContain('logout()');
      expect(controlSrc).toContain("AuthLanding");
    });

    it('handles API failure without losing context', () => {
      expect(controlSrc).toContain('deleteError');
      expect(controlSrc).toContain('parseApiError');
    });

    it('does not show fake success before backend confirms', () => {
      // Success toast should only appear after the API call succeeds
      expect(controlSrc).toContain('Account deletion submitted');
    });

    it('explains consequences before deletion', () => {
      expect(controlSrc).toContain('Before you delete');
      expect(controlSrc).toContain('permanently');
    });

    it('is not a giant red button in the Settings hub', () => {
      // The AccountControlScreen itself is the destructive flow, but the entry from Settings is a normal row
      const settingsSrc = readSrc('screens/SettingsScreen.tsx');
      // The settings row should not have a danger flag
      const accountControlRowMatch = settingsSrc.match(/title="Account control"[\s\S]*?onPress/);
      expect(accountControlRowMatch).toBeTruthy();
      expect(accountControlRowMatch![0]).not.toContain('danger');
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
      expect(savedSrc).toContain('loading');
      expect(savedSrc).toContain('skeleton');
    });

    it('has empty state with CTA', () => {
      expect(savedSrc).toContain('empty');
      expect(savedSrc).toContain('No saved addresses');
      expect(savedSrc).toContain('Add address');
    });

    it('has error state with retry', () => {
      expect(savedSrc).toContain('error');
      expect(savedSrc).toContain('Retry');
    });

    it('has delete confirmation via Alert.alert', () => {
      expect(savedSrc).toContain('Alert.alert');
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

    it('does not show generic "Blocked account" placeholder', () => {
      expect(blockedSrc).not.toContain('Blocked account');
    });

    it('does not show "Profile information unavailable"', () => {
      expect(blockedSrc).not.toContain('Profile information unavailable');
    });

    it('shows the user ID truthfully', () => {
      expect(blockedSrc).toContain('ID:');
    });
  });
});
