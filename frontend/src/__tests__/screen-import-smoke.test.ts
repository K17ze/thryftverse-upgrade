import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/*
 * Screen static smoke tests.
 * We do NOT import React Native screens into the vitest node environment
 * because expo-modules-core requires native globals that are not available.
 * Instead we verify source file structure, exports, and key patterns.
 */

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('EditProfileScreen static smoke', () => {
  const src = readSrc('screens/EditProfileScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function EditProfileScreen/);
  });

  it('imports PremiumTextField', () => {
    expect(src).toContain("import { PremiumTextField }");
  });

  it('imports PremiumSelectRow', () => {
    expect(src).toContain("import { PremiumSelectRow }");
  });

  it('imports PremiumFormCard', () => {
    expect(src).toContain("import { PremiumFormCard }");
  });

  it('uses reactive theme (useAppTheme)', () => {
    expect(src).toContain('useAppTheme');
  });

  it('does not use ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('ChangePasswordScreenV2 static smoke', () => {
  const src = readSrc('screens/ChangePasswordScreenV2.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function ChangePasswordScreenV2/);
  });

  it('imports PremiumTextField', () => {
    expect(src).toContain("import { PremiumTextField }");
  });

  it('imports PremiumFormCard', () => {
    expect(src).toContain("import { PremiumFormCard }");
  });

  it('imports PremiumActionFooter', () => {
    expect(src).toContain("import { PremiumActionFooter }");
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('SellScreenV2 static smoke', () => {
  const src = readSrc('screens/SellScreenV2.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function SellScreenV2/);
  });

  it('uses Animated.ScrollView for reanimated scroll handler', () => {
    expect(src).toContain('Animated.ScrollView');
  });

  it('has useAnimatedScrollHandler safety comment', () => {
    expect(src).toContain('SAFETY: useAnimatedScrollHandler returns an object');
  });

  it('has auth guard before publish', () => {
    expect(src).toContain('Sign in to publish a listing');
  });

  it('does not send sellerId with unknown fallback', () => {
    expect(src).not.toContain("?? 'unknown'");
    expect(src).not.toContain('?? "unknown"');
  });

  it('blocks publish if currentUser is missing', () => {
    expect(src).toMatch(/if\s*\(\s*!currentUser\?\.id\s*\)/);
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('ListingSuccessScreen static smoke', () => {
  const src = readSrc('screens/ListingSuccessScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function ListingSuccessScreen/);
  });

  it('does not import MOCK_USERS', () => {
    expect(src).not.toContain('MOCK_USERS');
  });

  it('does not import MY_USER', () => {
    expect(src).not.toContain('MY_USER');
  });

  it('does not import ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });

  it('does not contain fake conversationId', () => {
    expect(src).not.toContain("conversationId: 'c1'");
  });

  it('does not contain fake growth claim', () => {
    expect(src).not.toContain('sell 3x faster');
  });

  it('does not contain fake support chat navigation', () => {
    expect(src).not.toContain('ChatConversation');
  });

  it('uses reactive theme (useAppTheme)', () => {
    expect(src).toContain('useAppTheme');
  });

  it('has real ItemDetail navigation', () => {
    expect(src).toContain("'ItemDetail'");
  });

  it('has real ManageListing navigation', () => {
    expect(src).toContain("'ManageListing'");
  });

  it('has real HelpSupport navigation', () => {
    expect(src).toContain("'HelpSupport'");
  });

  it('uses design tokens (Space, Type, Radius)', () => {
    expect(src).toContain('Space.');
    expect(src).toContain('Type.');
    expect(src).toContain('Radius.');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});
