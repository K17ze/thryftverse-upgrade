import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('UI-21 device UX audit and consistency restoration', () => {
  // ── 1. MyProfile exposes a Settings action ──
  it('MyProfileScreen exposes a Settings action in the cover action layer', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(src).toContain('settings-outline');
    expect(src).toContain("navigate('Settings')");
    expect(src).toContain('Open settings');
  });

  // ── 2. Settings action routes to the active Settings screen ──
  it('Settings action routes to the registered Settings screen', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(src).toContain("navigation.navigate('Settings')");
    const nav = read(resolve(__dirname, '../navigation/AppNavigator.tsx'));
    expect(nav).toContain("name=\"Settings\"");
    expect(nav).toContain('SettingsScreen');
  });

  // ── 3. Settings action is not inside a condition requiring profile media ──
  it('Settings action is always reachable regardless of profile media', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    // The settings button is inside coverActionLayer which is always rendered
    expect(src).toContain('coverActionLayer');
    // It should not be inside a conditional block like {displayCover && ...}
    const coverActionIdx = src.indexOf('coverActionLayer');
    const afterCoverAction = src.substring(coverActionIdx, coverActionIdx + 600);
    expect(afterCoverAction).not.toMatch(/\{\s*displayCover\s*&&/);
    expect(afterCoverAction).not.toMatch(/\{\s*coverUri\s*&&/);
  });

  // ── 4. Home feed renders poster before product/feed sections ──
  it('HomeScreen renders poster section before Explore section', () => {
    const src = read(resolve(SCREENS, 'HomeScreen.tsx'));
    const posterIdx = src.indexOf('{renderPosters()}');
    // Search for JSX usage of DiscoverySectionHeader, not the import
    const exploreIdx = src.indexOf('<DiscoverySectionHeader');
    expect(posterIdx).toBeGreaterThan(0);
    expect(exploreIdx).toBeGreaterThan(0);
    expect(posterIdx).toBeLessThan(exploreIdx);
  });

  // ── 5. Poster loading skeleton occupies the same top feed position ──
  it('renderPosters shows SkeletonLoader while postersLoading is true', () => {
    const src = read(resolve(SCREENS, 'HomeScreen.tsx'));
    expect(src).toContain('if (postersLoading)');
    expect(src).toContain('poster_skeleton_');
    expect(src).toContain('SkeletonLoader width={120} height={152}');
  });

  // ── 6. Async poster loading cannot insert it in the middle of the feed ──
  it('renderPosters is placed deterministically before Explore in ScrollView', () => {
    const src = read(resolve(SCREENS, 'HomeScreen.tsx'));
    // renderPosters() JSX position is fixed; it does not conditionally move
    const scrollViewContent = src.substring(src.indexOf('contentContainerStyle'));
    const posterPos = scrollViewContent.indexOf('{renderPosters()}');
    const editorialPos = scrollViewContent.indexOf('EditorialDiscoveryHero');
    const explorePos = scrollViewContent.indexOf('DiscoverySectionHeader');
    expect(posterPos).toBeLessThan(editorialPos);
    expect(posterPos).toBeLessThan(explorePos);
  });

  // ── 7. Primary headers respect safe-area architecture ──
  it('HomeScreen floating header uses insets.top for safe area', () => {
    const src = read(resolve(SCREENS, 'HomeScreen.tsx'));
    expect(src).toContain('insets.top');
    expect(src).toContain('SafeAreaView');
  });

  it('MyProfileScreen floating header uses insets.top for safe area', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(src).toContain('insets.top');
    expect(src).toContain('useSafeAreaInsets');
  });

  // ── 8. Bottom CTAs do not overlap bottom navigation ──
  it('MyProfileScreen tab content has bottom padding for tab bar clearance', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(src).toContain('paddingBottom: 120');
  });

  // ── 9. No hidden/inaccessible production routes in corrected flows ──
  it('Settings route remains registered in AppNavigator', () => {
    const nav = read(resolve(__dirname, '../navigation/AppNavigator.tsx'));
    expect(nav).toContain('SettingsScreen');
    expect(nav).toContain("name=\"Settings\"");
  });

  // ── 10. No duplicate legacy profile hero returns ──
  it('MyProfileScreen uses a single ProfileVisualHeader, not duplicated hero components', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    // Count JSX usages only, excluding import statements
    const jsxMatches = src.match(/<ProfileVisualHeader/g);
    expect(jsxMatches).toHaveLength(1);
  });

  // ── 11. No mock financial data returns to co-own ──
  it('Active co-own screens do not import from tradeHub or mockSyndicateData', () => {
    const screens = [
      'AssetDetailScreen.tsx',
      'BuyoutScreen.tsx',
      'TradeScreen.tsx',
      'TradeConfirmScreen.tsx',
      'PortfolioScreen.tsx',
      'SyndicateHubScreen.tsx',
      'MarketLedgerScreen.tsx',
      'SyndicateOrderHistoryScreen.tsx',
      'AssetLeaderboardScreen.tsx',
      'SyndicateScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain("from '../data/tradeHub'");
      expect(src).not.toContain("from '../data/mockSyndicateData'");
    }
  });

  // ── 12. No Unsplash/picsum/external placeholder providers ──
  it('Screens do not use placeholder image providers', () => {
    const screens = [
      'HomeScreen.tsx',
      'MyProfileScreen.tsx',
      'SearchScreen.tsx',
      'InboxScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('unsplash');
      expect(src).not.toContain('picsum');
      expect(src).not.toMatch(/placeholder\.(com|image|img)/i);
    }
  });

  // ── 13. No gold/yellow/glass regressions ──
  it('No gold yellow or glass color regressions in primary screens', () => {
    const screens = [
      'HomeScreen.tsx',
      'MyProfileScreen.tsx',
      'SearchScreen.tsx',
      'InboxScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      const colorMatches = src.match(/color:\s*['"]gold['"]|color:\s*['"]yellow['"]|backgroundColor:\s*['"]gold['"]|backgroundColor:\s*['"]yellow['"]/gi);
      expect(colorMatches).toBeNull();
      expect(src).not.toContain('glassmorphism');
      expect(src).not.toContain('glass');
    }
  });

  // ── 14. EditorialDiscoveryHero does not render when all URIs are empty ──
  it('HomeScreen editorial hero is conditional on real imagery', () => {
    const src = read(resolve(SCREENS, 'HomeScreen.tsx'));
    expect(src).toContain('heroItems.some((h) => h.uri.trim().length > 0)');
    expect(src).toContain('heroItems.filter((h) => h.uri.trim().length > 0)');
  });

  // ── 15. MyProfile floating header includes Settings access ──
  it('MyProfileScreen floating header has a Settings action', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(src).toContain('floatingHeaderAction');
    const floatingHeaderIdx = src.indexOf('floatingHeader');
    const after = src.substring(floatingHeaderIdx, floatingHeaderIdx + 1200);
    expect(after).toContain('settings-outline');
    expect(after).toContain("navigate('Settings')");
  });

  // ── 16. Quick Access grid does NOT duplicate Settings (canonical action is header only) ──
  it('MyProfileScreen Quick Access grid does not duplicate Settings entry', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    const quickAccessIdx = src.indexOf('quickAccess');
    const after = src.substring(quickAccessIdx, quickAccessIdx + 1200);
    expect(after).not.toContain("label: 'Settings'");
    expect(after).not.toContain("route: 'Settings'");
  });

  // ── 17. Profile uses Edits/Looks/Pulse tab labels (UI-21P.2 flagship elevation) ──
  it('MyProfileScreen uses Edits/Looks/Pulse tab labels', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    // Search within the ProfileTabRail tabs array specifically
    const tabsIdx = src.indexOf('tabs={[');
    const tabsEndIdx = src.indexOf(']}', tabsIdx);
    const tabSection = src.substring(tabsIdx, tabsEndIdx + 2);
    expect(tabSection).toContain("label: 'Edits'");
    expect(tabSection).toContain("label: 'Looks'");
    expect(tabSection).toContain("label: 'Pulse'");
    expect(tabSection).not.toContain("label: 'Wardrobe'");
    expect(tabSection).not.toContain("label: 'Saved'");
    expect(tabSection).not.toContain("label: 'About'");
  });

  // ── 18. ProfileTabRail meets minimum 44px touch target (UI-21P.2) ──
  it('ProfileTabRail tab height meets 44px minimum', () => {
    const src = read(resolve(COMPONENTS, 'profile/ProfileTabRail.tsx'));
    expect(src).toContain('height: TAB_HEIGHT');
    expect(src).toContain('const TAB_HEIGHT = 44');
  });

  // ── 19. Poster rail tiles enlarged for flagship presence (UI-21P.2) ──
  it('HomeScreen poster tiles are 120x152 for flagship presence', () => {
    const src = read(resolve(SCREENS, 'HomeScreen.tsx'));
    const posterTileIdx = src.indexOf('posterTile:');
    const posterSection = src.substring(posterTileIdx, posterTileIdx + 300);
    expect(posterSection).toContain('width: 120');
    expect(posterSection).toContain('height: 152');
  });

  // ── 20. EditProfile uses FlagshipHeader instead of custom header (UI-21P.4) ──
  it('EditProfileScreen uses shared FlagshipHeader with back arrow', () => {
    const src = read(resolve(SCREENS, 'EditProfileScreen.tsx'));
    expect(src).toContain("FlagshipScreen, FlagshipHeader");
    expect(src).toContain('<FlagshipHeader');
    // Should not have the old custom header pattern
    expect(src).not.toContain('name="close" size={28}');
  });

  // ── 21. EditProfile sections use FlagshipFormSection (UI-21P.4) ──
  it('EditProfileScreen wraps form sections in FlagshipFormSection', () => {
    const src = read(resolve(SCREENS, 'EditProfileScreen.tsx'));
    expect(src).toContain("FlagshipFormSection");
    expect(src).toContain('<FlagshipFormSection');
  });

  // ── 22. Inbox rows are flat with hairline separators (UI-21P.4) ──
  it('InboxScreen uses flat rows with hairline separators', () => {
    const src = read(resolve(SCREENS, 'InboxScreen.tsx'));
    // Should have rowSeparator style
    expect(src).toContain('rowSeparator:');
    expect(src).toContain('height: StyleSheet.hairlineWidth');
    // Should not have card styling on rows
    expect(src).not.toMatch(/rowInner:[\s\S]{0,300}backgroundColor: Colors\.surface/);
    expect(src).not.toMatch(/rowInner:[\s\S]{0,300}borderRadius/);
  });

  // ── 23. PremiumTextField supports containerStyle prop (UI-21P.4) ──
  it('PremiumTextField accepts containerStyle prop', () => {
    const src = read(resolve(COMPONENTS, 'ui/PremiumTextField.tsx'));
    expect(src).toContain('containerStyle?:');
  });

  // ── 24. PremiumSelectRow supports style prop (UI-21P.4) ──
  it('PremiumSelectRow accepts style prop', () => {
    const src = read(resolve(COMPONENTS, 'ui/PremiumSelectRow.tsx'));
    expect(src).toContain('style?:');
  });

  // ── 25. SettingsStickySaveBar component exists (UI-21P.4) ──
  it('SettingsStickySaveBar shared component exists', () => {
    const path = resolve(COMPONENTS, 'settings/SettingsStickySaveBar.tsx');
    const src = read(path);
    expect(src).toContain('export function SettingsStickySaveBar');
    expect(src).toContain('SettingsStickySaveBarProps');
  });

  // ── 26. No fake data in Inbox or Chat (UI-21P.4 product truth) ──
  it('InboxScreen uses real conversation state, not fabricated data', () => {
    const src = read(resolve(SCREENS, 'InboxScreen.tsx'));
    expect(src).toContain('useStore');
    expect(src).toContain('conversations');
    expect(src).not.toContain('const MOCK_CONVERSATIONS');
    expect(src).not.toContain('FAKE_MESSAGES');
  });

  // ── 27. Chat uses shared header, context, timeline, composer (UI-21P.4) ──
  it('ChatScreen uses shared MessageBubble and ChatComposerBar', () => {
    const src = read(resolve(SCREENS, 'ChatScreen.tsx'));
    expect(src).toContain("import { MessageBubble } from '../components/chat/MessageBubble'");
    expect(src).toContain("import { ChatComposerBar } from '../components/chat/ChatComposerBar'");
  });

  // ── 28. No external placeholder providers in messaging (UI-21P.4) ──
  it('Inbox and Chat screens do not use placeholder image providers', () => {
    const inbox = read(resolve(SCREENS, 'InboxScreen.tsx'));
    const chat = read(resolve(SCREENS, 'ChatScreen.tsx'));
    for (const src of [inbox, chat]) {
      expect(src).not.toContain('unsplash');
      expect(src).not.toContain('picsum');
    }
  });
});