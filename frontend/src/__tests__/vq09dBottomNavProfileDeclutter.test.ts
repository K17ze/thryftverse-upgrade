import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
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
  const appNavSrc = readSrc('navigation/AppNavigator.tsx');
  const typesSrc = readSrc('navigation/types.ts');
  const createCameraSrc = readSrc('screens/CreateCameraScreen.tsx');

  it('Create tab uses a custom tabBarButton (not default icon)', () => {
    expect(tabNavSrc).toContain('tabBarButton:');
  });

  it('Create tab navigates directly to unified camera (no action sheet)', () => {
    expect(tabNavSrc).toContain('CreateCamera');
    expect(tabNavSrc).not.toContain('CreateActionSheet');
    expect(tabNavSrc).not.toContain('createSheetVisible');
  });

  it('Create tab has single press path (no redundant tabPress listener)', () => {
    expect(tabNavSrc).toContain('handleCreatePress');
    const createSection = tabNavSrc.slice(
      tabNavSrc.indexOf('name="Create"'),
      tabNavSrc.indexOf('name="Inbox"')
    );
    expect(createSection).not.toContain('listeners:');
    expect(createSection).not.toContain('tabPress');
  });

  it('Create tabBarButton preserves accessibilityState and testID from props', () => {
    expect(tabNavSrc).toContain('accessibilityState={props.accessibilityState}');
    expect(tabNavSrc).toContain('testID={props.testID}');
    expect(tabNavSrc).toContain('onLongPress={props.onLongPress}');
  });

  it('CreateCamera screen is registered in AppNavigator as a full-screen modal', () => {
    expect(appNavSrc).toContain('name="CreateCamera"');
    expect(appNavSrc).toContain('CreateCameraScreen');
    expect(appNavSrc).toContain('CreateCamera');
  });

  it('CreateCamera route is in RootStackParamList', () => {
    expect(typesSrc).toContain('CreateCamera:');
    expect(typesSrc).toContain("mode?: 'visual-search' | 'look' | 'poster'");
  });

  it('CreateCamera has mode switcher for Visual Search / Look / Poster', () => {
    expect(createCameraSrc).toContain('visual-search');
    expect(createCameraSrc).toContain('look');
    expect(createCameraSrc).toContain('poster');
  });

  it('CreateCamera routes captures to the correct destination', () => {
    expect(createCameraSrc).toContain('VisualSearch');
    expect(createCameraSrc).toContain('CreatorStudio');
  });

  it('CreateCamera preserves other create actions in overflow menu', () => {
    expect(createCameraSrc).toContain('CreateAuction');
    expect(createCameraSrc).toContain('CreateCoOwn');
  });

  it('HomeScreen has a separate + button for the listing flow', () => {
    const homeSrc = readSrc('screens/HomeScreen.tsx');
    expect(homeSrc).toContain("navigation.navigate('Sell')");
    expect(homeSrc).toContain('name="add"');
  });

  it('Create control has accessibility label and hint', () => {
    expect(tabNavSrc).toContain('accessibilityLabel="Create"');
    expect(tabNavSrc).toContain('accessibilityHint="Opens create actions"');
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
    expect(tabNavSrc).toContain('borderWidth: 2');
    expect(tabNavSrc).toContain('borderColor: colors.textPrimary');
  });
});

describe('VQ-09D: Bottom-bar visual system', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('No spring scale animation on tab icons (restrained visual)', () => {
    expect(tabNavSrc).not.toContain('withSpring');
  });

  it('No timing scale animation on tab icons (no-op removed)', () => {
    expect(tabNavSrc).not.toContain('withTiming');
    expect(tabNavSrc).not.toContain('useSharedValue');
    expect(tabNavSrc).not.toContain('useAnimatedStyle');
  });

  it('No Reanimated import in TabNavigator', () => {
    expect(tabNavSrc).not.toContain('react-native-reanimated');
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

  it('Tab icons use outline inactive / filled active pattern', () => {
    expect(tabNavSrc).toContain('home-outline');
    expect(tabNavSrc).toContain("'home'");
    expect(tabNavSrc).toContain('search-outline');
    expect(tabNavSrc).toContain("'search'");
    expect(tabNavSrc).toContain('paper-plane-outline');
    expect(tabNavSrc).toContain("'paper-plane'");
  });
});

describe('VQ-09D: Badges', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('Inbox badge deduplicates requests and unread conversations', () => {
    expect(tabNavSrc).toContain('requestIds');
    expect(tabNavSrc).toContain('requestIds.has');
    expect(tabNavSrc).toContain('unreadNonRequestCount');
    expect(tabNavSrc).toContain('inboxBadgeCount');
  });

  it('Badge displays 99+ for counts over 99', () => {
    expect(tabNavSrc).toContain("99+");
  });

  it('Badge has surface-colored border for separation from icon', () => {
    expect(tabNavSrc).toContain('borderColor: colors.surface');
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
  const appNavSrc = readSrc('navigation/AppNavigator.tsx');
  const typesSrc = readSrc('navigation/types.ts');

  it('Trade Hub is accessible from profile utility rail', () => {
    expect(profileSrc).toContain('Trade Hub');
  });

  it('Trade Hub utility item navigates to TradeHub (not CoOwnHub)', () => {
    expect(profileSrc).toContain("navigation.navigate('TradeHub')");
    expect(profileSrc).not.toContain("navigation.navigate('CoOwnHub')");
  });

  it('Trade Hub utility item has pulse icon', () => {
    expect(profileSrc).toContain('pulse-outline');
  });

  it('TradeHub is registered as a stack route in AppNavigator', () => {
    expect(appNavSrc).toContain('name="TradeHub"');
    expect(appNavSrc).toContain('TradeHubScreen');
  });

  it('TradeHub route is in RootStackParamList', () => {
    expect(typesSrc).toContain('TradeHub: undefined;');
  });

  it('CoOwnHub remains a separate route', () => {
    expect(appNavSrc).toContain('name="CoOwnHub"');
    expect(typesSrc).toContain('CoOwnHub:');
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

  it('ProfileHighlightsRow component file is deleted', () => {
    expect(fileExists('components/poster/ProfileHighlightsRow.tsx')).toBe(false);
  });

  it('PosterHighlightEditorScreen file is deleted', () => {
    expect(fileExists('screens/PosterHighlightEditorScreen.tsx')).toBe(false);
  });

  it('postersApi.ts does not export highlight types or functions', () => {
    const apiSrc = readSrc('services/postersApi.ts');
    expect(apiSrc).not.toContain('PosterHighlightFrame');
    expect(apiSrc).not.toContain('PosterHighlight ');
    expect(apiSrc).not.toContain('PosterHighlightListResponse');
    expect(apiSrc).not.toContain('fetchPosterHighlights');
    expect(apiSrc).not.toContain('createPosterHighlight');
    expect(apiSrc).not.toContain('updatePosterHighlight');
    expect(apiSrc).not.toContain('deletePosterHighlight');
    expect(apiSrc).not.toContain('addFrameToHighlight');
    expect(apiSrc).not.toContain('removeFrameFromHighlight');
  });
});

describe('VQ-09D: Tab interaction behaviour', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('Haptic fires only on tab change (not on re-press)', () => {
    expect(tabNavSrc).toContain('haptic.light()');
    expect(tabNavSrc).toContain('lastTabRef');
  });

  it('Create tab uses custom tabBarButton (single press path, no tabPress listener)', () => {
    expect(tabNavSrc).toContain('tabBarButton');
    expect(tabNavSrc).toContain('handleCreatePress');
  });

  it('Tab bar hides on keyboard', () => {
    expect(tabNavSrc).toContain('tabBarHideOnKeyboard: true');
  });

  it('Home screen uses useScrollToTop for re-press scroll-to-top', () => {
    const homeSrc = readSrc('screens/HomeScreen.tsx');
    expect(homeSrc).toContain('useScrollToTop');
  });

  it('Explore screen uses useScrollToTop for re-press scroll-to-top', () => {
    const exploreSrc = readSrc('screens/SearchScreen.tsx');
    expect(exploreSrc).toContain('useScrollToTop');
    expect(exploreSrc).toContain('scrollRef');
  });

  it('Inbox screen uses useScrollToTop for re-press scroll-to-top', () => {
    const inboxSrc = readSrc('screens/InboxScreen.tsx');
    expect(inboxSrc).toContain('useScrollToTop');
    expect(inboxSrc).toContain('listRef');
  });

  it('Profile screen uses useScrollToTop for re-press scroll-to-top', () => {
    const profileSrc = readSrc('screens/MyProfileScreen.tsx');
    expect(profileSrc).toContain('useScrollToTop');
    expect(profileSrc).toContain('scrollRef');
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
