import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('UI-11C auth + profile + settings flagship account experience', () => {
  // 1. Auth screens use premium/flagship components
  it('AuthLandingScreen does not use external image dependencies', () => {
    const src = readSrc('screens/AuthLandingScreen.tsx');
    expect(src).not.toContain('unsplash.com');
    expect(src).not.toContain('picsum.photos');
    expect(src).not.toContain('placeholder.com');
  });

  it('AuthLandingScreen uses Reanimated FadeIn/FadeInDown/FadeInUp', () => {
    const src = readSrc('screens/AuthLandingScreen.tsx');
    expect(src).toContain('FadeInDown');
    expect(src).toContain('FadeInUp');
    expect(src).toContain('FadeIn');
  });

  it('LoginScreen uses AppButton and AppInput', () => {
    const src = readSrc('screens/LoginScreen.tsx');
    expect(src).toContain('AppButton');
    expect(src).toContain('AppInput');
  });

  it('SignUpScreen uses AppButton and AppInput', () => {
    const src = readSrc('screens/SignUpScreen.tsx');
    expect(src).toContain('AppButton');
    expect(src).toContain('AppInput');
  });

  it('ForgotPasswordScreen uses AppButton', () => {
    const src = readSrc('screens/ForgotPasswordScreen.tsx');
    expect(src).toContain('AppButton');
    expect(src).not.toMatch(/primaryBtn.*backgroundColor.*#d7b98f/);
  });

  it('ForgotPasswordScreen uses FadeInDown', () => {
    const src = readSrc('screens/ForgotPasswordScreen.tsx');
    expect(src).toContain('FadeInDown');
  });

  // 2. Profile screens use FlagshipProfileMedia correctly
  it('MyProfileScreen imports FlagshipProfileMedia', () => {
    const src = readSrc('screens/MyProfileScreen.tsx');
    expect(src).toContain('FlagshipProfileMedia');
  });

  it('UserProfileScreen imports FlagshipProfileMedia', () => {
    const src = readSrc('screens/UserProfileScreen.tsx');
    expect(src).toContain('FlagshipProfileMedia');
  });

  it('EditProfileScreen imports FlagshipProfileMedia and FlagshipActionCluster', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('FlagshipProfileMedia');
    expect(src).toContain('FlagshipActionCluster');
  });

  // 3. EditProfile does not persist file:// media
  it('EditProfileScreen calls persistProfileMediaUri', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('persistProfileMediaUri');
  });

  // 4. Settings rows navigate to real screens or are honestly disabled/hidden
  it('SettingsScreenV2 uses SettingsPage and SettingsRow', () => {
    const src = readSrc('screens/SettingsScreenV2.tsx');
    expect(src).toContain('SettingsPage');
    expect(src).toContain('SettingsRow');
  });

  it('Settings subpages use ScreenHeader or SettingsPage', () => {
    const screens = [
      'screens/AccountSettingsScreenV2.tsx',
      'screens/PrivacySettingsScreenV2.tsx',
      'screens/ActiveSessionsScreenV2.tsx',
      'screens/BlockedUsersScreenV2.tsx',
      'screens/PushNotificationsScreenV2.tsx',
      'screens/ChatSettingsScreenV2.tsx',
      'screens/ChangePasswordScreenV2.tsx',
      'screens/TwoFactorSetupScreenV2.tsx',
      'screens/HelpSupportScreenV2.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).toMatch(/SettingsPage|ScreenHeader/);
    }
  });

  // 5. No fake followers/ratings/reviews
  it('UserProfileScreen does not hardcode follower counts', () => {
    const src = readSrc('screens/UserProfileScreen.tsx');
    expect(src).not.toContain('followers: 0');
    expect(src).not.toContain('followers: 1');
    expect(src).not.toContain('1.2K followers');
    expect(src).not.toContain('MOCK_FOLLOWERS');
  });

  it('MyProfileScreen does not hardcode follower counts', () => {
    const src = readSrc('screens/MyProfileScreen.tsx');
    expect(src).not.toContain('followers');
    expect(src).not.toContain('MOCK_FOLLOWERS');
  });

  // 6. No fake sessions/blocked users/2FA states
  it('ActiveSessionsScreenV2 shows honest local-only state', () => {
    const src = readSrc('screens/ActiveSessionsScreenV2.tsx');
    expect(src).toContain('Only this device is tracked locally');
    expect(src).not.toContain('MOCK_SESSIONS');
  });

  it('BlockedUsersScreenV2 does not invent fake blocked users', () => {
    const src = readSrc('screens/BlockedUsersScreenV2.tsx');
    expect(src).not.toContain('MOCK_BLOCKED');
    expect(src).not.toContain('fake blocked');
  });

  it('TwoFactorSetupScreenV2 does not fake 2FA completion', () => {
    const src = readSrc('screens/TwoFactorSetupScreenV2.tsx');
    expect(src).toContain('requestTwoFactorEnrollment');
    expect(src).toContain('verifyTwoFactorEnrollment');
    expect(src).not.toContain('MOCK_2FA');
  });

  // 7. No fake settings toggle success where backend is missing
  it('ChatSettingsScreenV2 uses honest local state for toggles', () => {
    const src = readSrc('screens/ChatSettingsScreenV2.tsx');
    expect(src).not.toContain('saved to server');
    expect(src).not.toContain('synced successfully');
  });

  // 8. No gold/yellow
  it('auth and profile screens do not use gold or yellow colors', () => {
    const screens = [
      'screens/AuthLandingScreen.tsx',
      'screens/LoginScreen.tsx',
      'screens/SignUpScreen.tsx',
      'screens/ForgotPasswordScreen.tsx',
      'screens/MyProfileScreen.tsx',
      'screens/UserProfileScreen.tsx',
      'screens/EditProfileScreen.tsx',
      'screens/PersonalisationScreen.tsx',
      'screens/InviteFriendsScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|FFE66D|F5A623|d7b98f)/i);
      expect(src).not.toMatch(/color:\s*['"]gold['"]/i);
      expect(src).not.toMatch(/color:\s*['"]yellow['"]/i);
    }
  });

  // 9. No glass/blur
  it('auth and profile screens do not use glass/blur', () => {
    const screens = [
      'screens/AuthLandingScreen.tsx',
      'screens/LoginScreen.tsx',
      'screens/SignUpScreen.tsx',
      'screens/ForgotPasswordScreen.tsx',
      'screens/MyProfileScreen.tsx',
      'screens/UserProfileScreen.tsx',
      'screens/EditProfileScreen.tsx',
      'screens/PersonalisationScreen.tsx',
      'screens/InviteFriendsScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain('expo-blur');
      expect(src).not.toContain('BlurView');
    }
  });

  // 10. No double-boxing in settings screens
  it('settings screens do not nest ElevatedSurface inside list sections', () => {
    const screens = [
      'screens/SettingsScreenV2.tsx',
      'screens/AccountSettingsScreenV2.tsx',
      'screens/PrivacySettingsScreenV2.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      const pattern1 = /<SettingsSection[\s\S]*?<ElevatedSurface[\s\S]*?<\/SettingsSection>/;
      const pattern2 = /<SettingsPage[\s\S]*?<ElevatedSurface[\s\S]*?<\/SettingsPage>/;
      // ElevatedSurface is allowed at page level but not nested inside rows
      expect(src).not.toMatch(pattern1);
    }
  });

  // 11. InviteFriendsScreen does not use fake contacts
  it('InviteFriendsScreen does not use MOCK_CONTACTS', () => {
    const src = readSrc('screens/InviteFriendsScreen.tsx');
    expect(src).not.toContain('MOCK_CONTACTS');
    expect(src).not.toContain('Alex Johnson');
    expect(src).not.toContain('Sam Rivera');
  });

  // 12. AboutScreen uses FadeInDown and design tokens
  it('AboutScreen uses FadeInDown and design tokens', () => {
    const src = readSrc('screens/AboutScreen.tsx');
    expect(src).toContain('FadeInDown');
    expect(src).toContain('Type.');
    expect(src).toContain('Space.');
  });

  // 13. ChatSettingsScreenV2 uses FadeInDown
  it('ChatSettingsScreenV2 uses FadeInDown', () => {
    const src = readSrc('screens/ChatSettingsScreenV2.tsx');
    expect(src).toContain('FadeInDown');
    expect(src).toContain('useReducedMotion');
  });

  // 14. BlockedUsersScreenV2 uses FlagshipEmptyGraphic
  it('BlockedUsersScreenV2 uses FlagshipEmptyGraphic', () => {
    const src = readSrc('screens/BlockedUsersScreenV2.tsx');
    expect(src).toContain('FlagshipEmptyGraphic');
  });
});
