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

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});
