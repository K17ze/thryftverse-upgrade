import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

describe('VQ-09D: Bottom Navigation — five-destination model', () => {
  const typesSrc = readSrc('navigation/types.ts');
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');
  const appNavSrc = readSrc('navigation/AppNavigator.tsx');

  it('TabParamList has exactly 5 destinations: Home, Explore, Create, Inbox, Profile', () => {
    const tabParamListMatch = typesSrc.match(/export type TabParamList = \{([^}]*)\}/s);
    expect(tabParamListMatch).toBeTruthy();
    const tabParams = tabParamListMatch![1];
    expect(tabParams).toContain('Home: undefined;');
    expect(tabParams).toContain('Explore: undefined;');
    expect(tabParams).toContain('Create: undefined;');
    expect(tabParams).toContain('Inbox: undefined;');
    expect(tabParams).toContain('Profile: undefined;');
    expect(tabParams).not.toContain('TradeHub');
    expect(tabParams).not.toContain('Search');
    expect(tabParams).not.toContain('Sell');
  });

  it('TabNavigator renders 5 Tab.Screen entries with correct names', () => {
    expect(tabNavSrc).toContain('name="Home"');
    expect(tabNavSrc).toContain('name="Explore"');
    expect(tabNavSrc).toContain('name="Create"');
    expect(tabNavSrc).toContain('name="Inbox"');
    expect(tabNavSrc).toContain('name="Profile"');
    expect(tabNavSrc).not.toContain('name="TradeHub"');
    expect(tabNavSrc).not.toContain('name="Search"');
    expect(tabNavSrc).not.toContain('name="Sell"');
  });

  it('TabNavigator does not import TradeHubScreen or SellScreen', () => {
    expect(tabNavSrc).not.toContain('TradeHubScreen');
    expect(tabNavSrc).not.toContain('SellScreen');
  });

  it('Sell is registered as a stack screen in AppNavigator', () => {
    expect(appNavSrc).toContain("name=\"Sell\"");
    expect(appNavSrc).toContain('SellScreen');
  });

  it('Sell route is in RootStackParamList', () => {
    expect(typesSrc).toContain('Sell: undefined;');
  });
});

describe('VQ-09D: Central Create control', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('Create tab uses a custom tabBarButton (not default icon)', () => {
    expect(tabNavSrc).toContain('tabBarButton:');
  });

  it('Create tab prevents default navigation and opens action sheet', () => {
    expect(tabNavSrc).toContain('e.preventDefault()');
    expect(tabNavSrc).toContain('handleCreatePress');
  });

  it('CreateActionSheet has 5 actions: sell, look, poster, auction, coown', () => {
    expect(tabNavSrc).toContain("key: 'sell'");
    expect(tabNavSrc).toContain("key: 'look'");
    expect(tabNavSrc).toContain("key: 'poster'");
    expect(tabNavSrc).toContain("key: 'auction'");
    expect(tabNavSrc).toContain("key: 'coown'");
  });

  it('CreateActionSheet sell action is marked as primary', () => {
    expect(tabNavSrc).toContain('primary: true');
  });

  it('CreateActionSheet navigates to Sell route (not SellScreen)', () => {
    expect(tabNavSrc).toContain("route: 'Sell'");
    expect(tabNavSrc).not.toContain("route: 'SellScreen'");
  });

  it('Create control has accessibility label and hint', () => {
    expect(tabNavSrc).toContain('accessibilityLabel="Create"');
    expect(tabNavSrc).toContain('accessibilityHint="Opens create actions"');
  });

  it('CreateActionSheet uses Modal with slide animation', () => {
    expect(tabNavSrc).toContain('animationType="slide"');
  });

  it('createSheetVisible state is in the store', () => {
    const storeSrc = readSrc('store/useStore.ts');
    expect(storeSrc).toContain('createSheetVisible');
    expect(storeSrc).toContain('setCreateSheetVisible');
  });
});

describe('VQ-09D: Profile tab avatar', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('ProfileTabIcon component exists', () => {
    expect(tabNavSrc).toContain('ProfileTabIcon');
  });

  it('ProfileTabIcon uses CachedImage for real avatar', () => {
    expect(tabNavSrc).toContain('CachedImage');
  });

  it('ProfileTabIcon has initials fallback', () => {
    expect(tabNavSrc).toContain('initials');
    expect(tabNavSrc).toContain("|| '?'");
  });

  it('ProfileTabIcon uses userAvatar from store with currentUser.avatar fallback', () => {
    expect(tabNavSrc).toContain('userAvatar');
    expect(tabNavSrc).toContain('currentUser?.avatar');
  });

  it('Profile tab uses ProfileTabIcon (not generic TabIcon)', () => {
    expect(tabNavSrc).toContain('<ProfileTabIcon');
  });

  it('Avatar has active ring border when focused', () => {
    expect(tabNavSrc).toContain('avatarWrapActive');
    expect(tabNavSrc).toContain('borderWidth: 2');
  });
});

describe('VQ-09D: Bottom-bar visual system', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('No spring scale animation on tab icons (restrained visual)', () => {
    expect(tabNavSrc).not.toContain('withSpring');
  });

  it('No expanding underline indicator', () => {
    expect(tabNavSrc).not.toContain('activeIndicator');
    expect(tabNavSrc).not.toContain('indicatorWidth');
  });

  it('No shadow/elevation on tab bar (flat design)', () => {
    expect(tabNavSrc).toContain("shadowColor: 'transparent'");
    expect(tabNavSrc).toContain('elevation: 0');
  });

  it('Tab bar has hairline top border', () => {
    expect(tabNavSrc).toContain('borderTopWidth: StyleSheet.hairlineWidth');
  });

  it('Uses design tokens (Typography, Space) not hardcoded values', () => {
    expect(tabNavSrc).toContain('Typography.family');
  });

  it('Reduced motion is respected in TabIcon', () => {
    expect(tabNavSrc).toContain('useReducedMotion');
    expect(tabNavSrc).toContain('reducedMotion');
  });
});

describe('VQ-09D: Badges', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('Inbox badge counts unread conversations plus message requests', () => {
    expect(tabNavSrc).toContain('unreadCount');
    expect(tabNavSrc).toContain('requestCount');
    expect(tabNavSrc).toContain('inboxBadgeCount');
  });

  it('Badge displays 99+ for counts over 99', () => {
    expect(tabNavSrc).toContain("99+");
  });

  it('Badge has surface-colored border for separation from icon', () => {
    expect(tabNavSrc).toContain('borderColor: Colors.surface');
  });

  it('Badge has accessibility label with unread count', () => {
    expect(tabNavSrc).toContain('accessibilityLabel');
    expect(tabNavSrc).toContain('unread');
  });

  it('Inbox tab has dynamic accessibility label with unread count', () => {
    expect(tabNavSrc).toContain('Inbox, ');
    expect(tabNavSrc).toContain('unread');
  });
});

describe('VQ-09D: Trade Hub relocation', () => {
  const profileSrc = readSrc('screens/MyProfileScreen.tsx');

  it('Trade Hub is accessible from profile utility rail', () => {
    expect(profileSrc).toContain('Trade Hub');
  });

  it('Trade Hub utility item navigates to CoOwnHub', () => {
    expect(profileSrc).toContain("navigation.navigate('CoOwnHub')");
  });

  it('Trade Hub utility item has pulse icon', () => {
    expect(profileSrc).toContain('pulse-outline');
  });
});

describe('VQ-09D: Profile Highlights removal', () => {
  const myProfileSrc = readSrc('screens/MyProfileScreen.tsx');
  const userProfileSrc = readSrc('screens/UserProfileScreen.tsx');
  const appNavSrc = readSrc('navigation/AppNavigator.tsx');
  const typesSrc = readSrc('navigation/types.ts');

  it('MyProfileScreen does not import or render ProfileHighlightsRow', () => {
    expect(myProfileSrc).not.toContain('ProfileHighlightsRow');
    expect(myProfileSrc).not.toContain('fetchPosterHighlights');
    expect(myProfileSrc).not.toContain('PosterHighlight');
  });

  it('MyProfileScreen does not navigate to PosterHighlightEditor', () => {
    expect(myProfileSrc).not.toContain('PosterHighlightEditor');
  });

  it('UserProfileScreen does not import or render ProfileHighlightsRow', () => {
    expect(userProfileSrc).not.toContain('ProfileHighlightsRow');
    expect(userProfileSrc).not.toContain('fetchPosterHighlights');
    expect(userProfileSrc).not.toContain('PosterHighlight');
  });

  it('UserProfileScreen does not navigate to PosterHighlightEditor', () => {
    expect(userProfileSrc).not.toContain('PosterHighlightEditor');
  });

  it('PosterHighlightEditor route is removed from RootStackParamList', () => {
    expect(typesSrc).not.toContain('PosterHighlightEditor');
  });

  it('PosterHighlightEditor screen is not registered in AppNavigator', () => {
    expect(appNavSrc).not.toContain('PosterHighlightEditor');
  });
});

describe('VQ-09D: Tab interaction behaviour', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('Haptic fires only on tab change (not on re-press)', () => {
    expect(tabNavSrc).toContain('haptic.light()');
    expect(tabNavSrc).toContain('lastTabRef');
  });

  it('Create tab press is prevented from navigating (opens sheet instead)', () => {
    expect(tabNavSrc).toContain('tabPress');
    expect(tabNavSrc).toContain('e.preventDefault()');
  });

  it('Tab bar hides on keyboard', () => {
    expect(tabNavSrc).toContain('tabBarHideOnKeyboard: true');
  });
});

describe('VQ-09D: Poster functionality preserved', () => {
  const appNavSrc = readSrc('navigation/AppNavigator.tsx');
  const typesSrc = readSrc('navigation/types.ts');

  it('PosterViewer route still exists', () => {
    expect(typesSrc).toContain('PosterViewer:');
  });

  it('PosterArchive route still exists', () => {
    expect(typesSrc).toContain('PosterArchive:');
  });

  it('PosterStoryActivity route still exists', () => {
    expect(typesSrc).toContain('PosterStoryActivity:');
  });

  it('CreatePoster route still exists with mode param', () => {
    expect(typesSrc).toContain('CreatePoster:');
    expect(typesSrc).toContain("mode?: 'poster' | 'look'");
  });

  it('PosterViewer screen is registered in AppNavigator', () => {
    expect(appNavSrc).toContain('PosterViewerScreen');
  });

  it('PosterArchive screen is registered in AppNavigator', () => {
    expect(appNavSrc).toContain('PosterArchiveScreen');
  });
});
