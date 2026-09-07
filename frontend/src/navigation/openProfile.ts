import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from './types';

/**
 * Minimal navigation surface required by openProfile.
 *
 * Screens receive route-specific NativeStackNavigationProp instances
 * (e.g. NativeStackNavigationProp<RootStackParamList, 'UnifiedDiscovery'>)
 * whose setParams signatures are incompatible with the unparameterised
 * NativeStackNavigationProp<RootStackParamList>.  Extracting only the
 * navigate method avoids this variance issue while preserving full type
 * safety on the screen/params pairs we actually call.
 */
type ProfileNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList, keyof RootStackParamList>,
  'navigate'
>;

/**
 * Canonical profile navigation resolver.
 *
 * Invariant:
 *   MyProfile (tab) = owner-only projection (edit, private stats, growth).
 *   UserProfile (stack) = public-only projection (follow, message, report).
 *
 * A navigation target pointing at the signed-in user is normalised to the
 * MyProfile tab BEFORE the public UserProfile screen can mount. This
 * prevents the identity-contamination bug where UserProfile could swap to
 * owner data and expose Edit Profile on a public route.
 *
 * Deep links are also normalised at the linking layer.
 */
export function openProfile(
  navigation: ProfileNavigation,
  targetUserId: string,
  currentUserId?: string,
): void {
  if (targetUserId === currentUserId) {
    // Navigate to the owner Profile tab instead of the public UserProfile.
    navigation.navigate('MainTabs', { screen: 'Profile' } as NavigatorScreenParams<TabParamList>);
    return;
  }
  navigation.navigate('UserProfile', { userId: targetUserId });
}
