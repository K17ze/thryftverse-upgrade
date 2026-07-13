import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../');
const COMPONENTS = resolve(SRC, 'components');
const SCREENS = resolve(SRC, 'screens');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('VISUAL-14 Reference-Match Final Polish', () => {
  // ── 1. InboxScreen uses the current flat, shared conversation row ──
  it('InboxScreen rows use the shared native row with explicit typography and press feedback', () => {
    const screen = read(resolve(SCREENS, 'InboxScreen.tsx'));
    const row = read(resolve(COMPONENTS, 'chat/InboxConversationRow.tsx'));
    expect(screen).toContain('InboxConversationRow');
    expect(row).toContain('scaleValue={0.98}');
    expect(row).toContain('paddingHorizontal: Space.md');
    expect(row).toContain('color: Colors.textPrimary');
    expect(row).not.toContain('...Elevation.subtle');
  });

  it('InboxScreen list has top padding for card spacing', () => {
    const src = read(resolve(SCREENS, 'InboxScreen.tsx'));
    expect(src).toContain("paddingTop: Space.sm");
  });

  // ── 2. MessageBubble has modern bubble styling ──
  it('MessageBubble has variable border radius for me/them bubbles', () => {
    const src = read(resolve(COMPONENTS, 'chat/MessageBubble.tsx'));
    expect(src).toContain('bubbleMe:');
    expect(src).toContain('bubbleThem:');
    expect(src).toContain('borderTopRightRadius: Radius.sm');
    expect(src).toContain('borderTopLeftRadius: Radius.sm');
  });

  it('MessageBubble uses brand/surfaceAlt colors for them/me', () => {
    const src = read(resolve(COMPONENTS, 'chat/MessageBubble.tsx'));
    expect(src).toContain('bubbleBg');
    expect(src).toContain('isMe ? Colors.brand : Colors.surfaceAlt');
  });

  it('MessageBubble uses colour-based separation without shadow', () => {
    const src = read(resolve(COMPONENTS, 'chat/MessageBubble.tsx'));
    expect(src).toContain('backgroundColor: Colors.brand');
    expect(src).toContain('backgroundColor: Colors.surfaceAlt');
    expect(src).not.toContain('...Elevation.subtle');
  });

  // ── 3. ChatComposerBar has refined styling ──
  it('ChatComposerBar input has border for refined look', () => {
    const src = read(resolve(COMPONENTS, 'chat/ChatComposerBar.tsx'));
    expect(src).toContain('borderWidth: StyleSheet.hairlineWidth');
    expect(src).toContain('borderColor: Colors.border');
  });

  it('ChatComposerBar send button uses brand colour when active', () => {
    const src = read(resolve(COMPONENTS, 'chat/ChatComposerBar.tsx'));
    expect(src).toContain('backgroundColor: Colors.brand');
    expect(src).toContain("color={canSend ? Colors.textInverse");
  });

  // ── 4. WithdrawScreen has entrance animations ──
  it('WithdrawScreen imports FadeInDown', () => {
    const src = read(resolve(SCREENS, 'WithdrawScreen.tsx'));
    expect(src).toContain("import Reanimated, { FadeInDown }");
  });

  it('WithdrawScreen amount section has entrance animation', () => {
    const src = read(resolve(SCREENS, 'WithdrawScreen.tsx'));
    expect(src).toContain('entering={FadeInDown.duration(300).delay(30)}');
  });

  it('WithdrawScreen bank section has entrance animation', () => {
    const src = read(resolve(SCREENS, 'WithdrawScreen.tsx'));
    expect(src).toContain('entering={FadeInDown.duration(300).delay(80)}');
  });

  it('WithdrawScreen bank card has subtle shadow and border', () => {
    const src = read(resolve(SCREENS, 'WithdrawScreen.tsx'));
    expect(src).toContain('...Elevation.subtle');
    expect(src).toContain('borderWidth: StyleSheet.hairlineWidth');
    expect(src).toContain('borderColor: Colors.border');
  });

  // ── 5. No fake/external data regressions ──
  it('no unsplash URLs in production screens', () => {
    const screens = [
      'InboxScreen.tsx',
      'ChatScreen.tsx',
      'WithdrawScreen.tsx',
      'BalanceScreen.tsx',
    ];
    for (const s of screens) {
      const src = read(resolve(SCREENS, s));
      expect(src).not.toContain('images.unsplash.com');
      expect(src).not.toContain('picsum.photos');
    }
  });

  // ── 6. SettingsScreen maintains upgraded structure ──
  it('SettingsScreen uses the flagship shell, identity hero and shared setting rows', () => {
    const src = read(resolve(SCREENS, 'SettingsScreen.tsx'));
    expect(src).toContain('FlagshipScreen');
    expect(src).toContain('identityHero');
    expect(src).toContain('SettingsSection');
    expect(src).toContain('SettingsRow');
    expect(src).toContain('...Elevation.subtle');
  });

  // ── 7. Combined visual branch components still present ──
  it('MyProfileIdentityHero component exists and is imported', () => {
    const src = read(resolve(COMPONENTS, 'profile/MyProfileIdentityHero.tsx'));
    expect(src).toBeTruthy();
    const screen = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(screen).toContain('MyProfileIdentityHero');
  });

  it('ProfileTabRail component exists and is imported', () => {
    const src = read(resolve(COMPONENTS, 'profile/ProfileTabRail.tsx'));
    expect(src).toBeTruthy();
    const screen = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(screen).toContain('ProfileTabRail');
  });

  it('DiscoverySectionHeader component exists', () => {
    expect(existsSync(resolve(COMPONENTS, 'discover/DiscoverySectionHeader.tsx'))).toBe(true);
  });

  it('EditorialDiscoveryHero component exists', () => {
    expect(existsSync(resolve(COMPONENTS, 'discover/EditorialDiscoveryHero.tsx'))).toBe(true);
  });

  // ── 8. Motion utilities still used ──
  it('PressPresets hook exists and is imported', () => {
    expect(existsSync(resolve(SRC, 'hooks/usePremiumPressFeedback.ts'))).toBe(true);
    const src = read(resolve(COMPONENTS, 'ProductCardV2.tsx'));
    expect(src).toContain('PressPresets');
  });

  // ── 9. No gold/yellow/glass regressions ──
  it('no hardcoded gold hex in touched screens', () => {
    const screens = [
      'InboxScreen.tsx',
      'WithdrawScreen.tsx',
    ];
    for (const s of screens) {
      const src = read(resolve(SCREENS, s));
      expect(src).not.toContain('#F5A623');
      expect(src).not.toContain('#d7b98f');
      expect(src).not.toContain('#D4AF37');
    }
  });
});
