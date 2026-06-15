import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('flagship components applied to production screens', () => {
  it('MyProfileScreen imports FlagshipProfileMedia', () => {
    const src = readSrc('screens/MyProfileScreen.tsx');
    expect(src).toContain("import { FlagshipProfileMedia } from '../components/flagship';");
  });

  it('UserProfileScreen imports FlagshipProfileMedia', () => {
    const src = readSrc('screens/UserProfileScreen.tsx');
    expect(src).toContain("import { FlagshipProfileMedia } from '../components/flagship';");
  });

  it('EditProfileScreen imports FlagshipProfileMedia and FlagshipActionCluster', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain("import { FlagshipProfileMedia, FlagshipActionCluster } from '../components/flagship';");
  });

  it('MyOrdersScreen imports FlagshipOrderCard', () => {
    const src = readSrc('screens/MyOrdersScreen.tsx');
    expect(src).toContain("import { FlagshipOrderCard");
  });

  it('SyndicateHubScreen imports FlagshipAssetCard', () => {
    const src = readSrc('screens/SyndicateHubScreen.tsx');
    expect(src).toContain("import { FlagshipAssetCard");
  });

  it('PortfolioScreen imports FlagshipAssetCard', () => {
    const src = readSrc('screens/PortfolioScreen.tsx');
    expect(src).toContain("import { FlagshipAssetCard");
  });

  it('AssetDetailScreen imports FlagshipActionCluster', () => {
    const src = readSrc('screens/AssetDetailScreen.tsx');
    expect(src).toContain("import { FlagshipActionCluster } from '../components/flagship';");
  });

  it('EmptyState supports graphic prop', () => {
    const src = readSrc('components/EmptyState.tsx');
    expect(src).toContain('graphic?: React.ReactNode');
  });

  it('ProductCardV2 uses Pinterest-style tight radius and no heavy elevation', () => {
    const src = readSrc('components/ProductCardV2.tsx');
    expect(src).toContain('borderRadius: Radius.sm');
    expect(src).not.toContain('...Elevation.card');
  });

  it('MyOrdersScreen renders FlagshipOrderCard in list', () => {
    const src = readSrc('screens/MyOrdersScreen.tsx');
    expect(src).toContain('<FlagshipOrderCard');
  });

  it('SyndicateHubScreen renders FlagshipAssetCard in list', () => {
    const src = readSrc('screens/SyndicateHubScreen.tsx');
    expect(src).toContain('<FlagshipAssetCard');
  });

  it('PortfolioScreen renders FlagshipAssetCard in list', () => {
    const src = readSrc('screens/PortfolioScreen.tsx');
    expect(src).toContain('<FlagshipAssetCard');
  });

  it('ClosetScreen imports FlagshipEmptyGraphic', () => {
    const src = readSrc('screens/ClosetScreen.tsx');
    expect(src).toContain("import { FlagshipEmptyGraphic } from '../components/flagship';");
  });

  it('ClosetScreen saved empty state uses FlagshipEmptyGraphic', () => {
    const src = readSrc('screens/ClosetScreen.tsx');
    expect(src).toContain('graphic={<FlagshipEmptyGraphic');
  });

  it('OrderDetailScreen imports FlagshipActionCluster', () => {
    const src = readSrc('screens/OrderDetailScreen.tsx');
    expect(src).toContain("import { FlagshipActionCluster } from '../components/flagship';");
  });

  it('CoOwnIssueScreen imports FlagshipEmptyGraphic and FlagshipActionCluster', () => {
    const src = readSrc('screens/CoOwnIssueScreen.tsx');
    expect(src).toContain("import { FlagshipEmptyGraphic, FlagshipActionCluster } from '../components/flagship';");
  });

  it('SignUpScreen imports AppButton', () => {
    const src = readSrc('screens/SignUpScreen.tsx');
    expect(src).toContain("import { AppButton } from '../components/ui/AppButton';");
  });

  it('FlagshipProfileMedia supports video covers', () => {
    const src = readSrc('components/flagship/FlagshipProfileMedia.tsx');
    expect(src).toContain("import { Video, ResizeMode } from '../compat/Video';");
    expect(src).toContain('coverVideoUri ? (');
    expect(src).toContain('ResizeMode.COVER');
  });

  it('ProductCardV2 is image-first with no container marginBottom', () => {
    const src = readSrc('components/ProductCardV2.tsx');
    expect(src).toContain('flex: 1,');
    expect(src).not.toContain('marginBottom: Space.sm');
  });

  it('OrderDetail timeline has premium dot treatment', () => {
    const src = readSrc('screens/OrderDetailScreen.tsx');
    expect(src).toContain('borderWidth: 3');
    expect(src).toContain('borderColor: Colors.background');
    expect(src).toContain('shadowRadius');
  });

  it('HomeScreen loading skeleton uses Pinterest tight radius', () => {
    const src = readSrc('screens/HomeScreen.tsx');
    expect(src).not.toContain('borderRadius={0}');
    expect(src).toContain('borderRadius={Radius.sm}');
  });

  it('BrowseScreen imageWrap uses Pinterest tight radius and no heavy elevation', () => {
    const src = readSrc('screens/BrowseScreen.tsx');
    expect(src).not.toContain('...Elevation.card');
    expect(src).toContain('aspectRatio: 0.8');
    expect(src).toContain('imageWrap: {');
    const imageWrapIdx = src.indexOf('imageWrap: {');
    const imageWrapEnd = src.indexOf('  },', imageWrapIdx);
    const imageWrapBlock = src.slice(imageWrapIdx, imageWrapEnd);
    expect(imageWrapBlock).not.toContain('borderRadius: 16');
  });

  it('SearchScreen does not have unused inline empty state styles', () => {
    const src = readSrc('screens/SearchScreen.tsx');
    expect(src).not.toContain('emptyState:');
    expect(src).not.toContain('emptyIcon:');
    expect(src).not.toContain('emptyTitle:');
    expect(src).not.toContain('emptySubtitle:');
  });

  it('ProductCardV2 image defers borderRadius to imageWrap', () => {
    const src = readSrc('components/ProductCardV2.tsx');
    expect(src).not.toContain("borderRadius: visualOnly ? 16 : Radius.sm");
    expect(src).toContain('overflow: \'hidden\',');
  });

  it('no glass/blur except BottomSheet and tests', () => {
    const screens = [
      'screens/HomeScreen.tsx',
      'screens/BrowseScreen.tsx',
      'screens/SearchScreen.tsx',
      'screens/ClosetScreen.tsx',
      'screens/MyOrdersScreen.tsx',
      'screens/OrderDetailScreen.tsx',
      'screens/AssetDetailScreen.tsx',
      'screens/SyndicateHubScreen.tsx',
      'screens/PortfolioScreen.tsx',
      'screens/TradeHubScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain('expo-blur');
    }
  });
});

describe('UI-22B settings reconstruction architecture guardrails', () => {
  it('SettingsScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/SettingsScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader, FlagshipDangerZone } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
    expect(src).toContain('<FlagshipHeader');
  });

  it('SettingsScreenV2 has route metadata for real search', () => {
    const src = readSrc('screens/SettingsScreenV2.tsx');
    expect(src).toContain('ROUTE_METADATA');
    expect(src).toContain('searchTerms');
    expect(src).toContain('showSection');
  });

  it('SettingsScreenV2 separates destructive sign-out into FlagshipDangerZone', () => {
    const src = readSrc('screens/SettingsScreenV2.tsx');
    expect(src).toContain('<FlagshipDangerZone');
    expect(src).toContain('Sign Out');
  });

  it('EditProfileScreen uses FlagshipScreen, FlagshipHeader, FlagshipStickyFooter', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain("import { FlagshipProfileMedia, FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
    expect(src).toContain('<FlagshipStickyFooter');
  });

  it('EditProfileScreen has live preview card', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('previewCard');
    expect(src).toContain('previewName');
    expect(src).toContain('previewHandle');
  });

  it('EditProfileScreen has unsaved-change discard confirmation', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('Unsaved changes');
    expect(src).toContain('Discard');
  });

  it('PaymentsScreen uses FlagshipScreen, FlagshipHeader, and FlagshipState', () => {
    const src = readSrc('screens/PaymentsScreen.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
    expect(src).toContain('<FlagshipState variant="loading"');
    expect(src).toContain('<FlagshipState variant="error"');
  });

  it('PaymentsScreen has security banner', () => {
    const src = readSrc('screens/PaymentsScreen.tsx');
    expect(src).toContain('securityBanner');
    expect(src).toContain('Payments are encrypted and secure');
  });

  it('PostageScreen uses FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipFormSection', () => {
    const src = readSrc('screens/PostageScreen.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipFormSection } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
    expect(src).toContain('<FlagshipFormSection');
  });

  it('PostageScreen has address management section', () => {
    const src = readSrc('screens/PostageScreen.tsx');
    expect(src).toContain('Your Addresses');
    expect(src).toContain('savedAddress');
  });

  it('PersonalisationScreen uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/PersonalisationScreen.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('PersonalisationScreen has visual preview card', () => {
    const src = readSrc('screens/PersonalisationScreen.tsx');
    expect(src).toContain('previewCard');
    expect(src).toContain('previewTitle');
    expect(src).toContain('Gender:');
    expect(src).toContain('Categories:');
  });

  it('AccountSettingsScreenV2 uses FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipDangerZone', () => {
    const src = readSrc('screens/AccountSettingsScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipDangerZone } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
    expect(src).toContain('<FlagshipStickyFooter');
    expect(src).toContain('<FlagshipDangerZone');
    expect(src).toContain('Delete Account');
  });

  it('ChangePasswordScreenV2 uses FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection', () => {
    const src = readSrc('screens/ChangePasswordScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
    expect(src).toContain('<FlagshipStickyFooter');
    expect(src).toContain('<FlagshipFormSection');
  });

  it('PushNotificationsScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/PushNotificationsScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('TwoFactorSetupScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/TwoFactorSetupScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('PrivacySettingsScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/PrivacySettingsScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('ChatSettingsScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/ChatSettingsScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('ActiveSessionsScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/ActiveSessionsScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('BlockedUsersScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/BlockedUsersScreenV2.tsx');
    expect(src).toContain("import { FlagshipEmptyGraphic, FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('HelpSupportScreenV2 uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/HelpSupportScreenV2.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('AboutScreen uses FlagshipScreen and FlagshipHeader', () => {
    const src = readSrc('screens/AboutScreen.tsx');
    expect(src).toContain("import { FlagshipScreen, FlagshipHeader } from '../components/flagship'");
    expect(src).toContain('<FlagshipScreen');
  });

  it('no settings screen imports old SettingsPage wrapper', () => {
    const screens = [
      'screens/SettingsScreenV2.tsx',
      'screens/EditProfileScreen.tsx',
      'screens/PaymentsScreen.tsx',
      'screens/PostageScreen.tsx',
      'screens/PersonalisationScreen.tsx',
      'screens/AccountSettingsScreenV2.tsx',
      'screens/ChangePasswordScreenV2.tsx',
      'screens/PushNotificationsScreenV2.tsx',
      'screens/TwoFactorSetupScreenV2.tsx',
      'screens/PrivacySettingsScreenV2.tsx',
      'screens/ChatSettingsScreenV2.tsx',
      'screens/ActiveSessionsScreenV2.tsx',
      'screens/BlockedUsersScreenV2.tsx',
      'screens/HelpSupportScreenV2.tsx',
      'screens/AboutScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain("import { SettingsPage }");
      expect(src).not.toContain("from '../components/settings/SettingsPage'");
    }
  });
});
