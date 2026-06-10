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

  it('ProductCardV2 uses flagship radius and elevation', () => {
    const src = readSrc('components/ProductCardV2.tsx');
    expect(src).toContain('borderRadius: Radius.lg');
    expect(src).toContain('...Elevation.card');
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

  it('HomeScreen loading skeleton uses flagship radius', () => {
    const src = readSrc('screens/HomeScreen.tsx');
    expect(src).not.toContain('borderRadius={0}');
    expect(src).toContain('borderRadius={Radius.lg}');
  });

  it('BrowseScreen imageWrap uses flagship radius and elevation', () => {
    const src = readSrc('screens/BrowseScreen.tsx');
    expect(src).toContain('...Elevation.card');
    expect(src).toContain('aspectRatio: 0.8');
    // imageWrap should use Radius.lg, not hardcoded 16
    expect(src).toContain('imageWrap: {');
    const imageWrapIdx = src.indexOf('imageWrap: {');
    const imageWrapEnd = src.indexOf('  },', imageWrapIdx);
    const imageWrapBlock = src.slice(imageWrapIdx, imageWrapEnd);
    expect(imageWrapBlock).toContain('borderRadius: Radius.lg');
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
