import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const SRC = resolve(__dirname, '../');
const SCREENS = resolve(SRC, 'screens');
const COMPONENTS = resolve(SRC, 'components');
const DATA = resolve(SRC, 'data');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

function filesUnder(dir: string, ext = '.tsx'): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

const screenFiles = filesUnder(SCREENS);
const componentFiles = filesUnder(COMPONENTS);
const dataFiles = filesUnder(DATA, '.ts');
const allProduction = [...screenFiles, ...componentFiles, ...dataFiles];

describe('VISUAL-13C Motion / Interaction / Quality Layer', () => {
  // ── 1. Press feedback system ──
  it('AnimatedPressable default disableAnimation is false (animations enabled)', () => {
    const src = read(join(COMPONENTS, 'AnimatedPressable.tsx'));
    expect(src).toContain('disableAnimation = false');
  });

  it('usePremiumPressFeedback hook exists with PressPresets', () => {
    const src = read(join(SRC, 'hooks/usePremiumPressFeedback.ts'));
    expect(src).toContain('export function usePremiumPressFeedback');
    expect(src).toContain('export const PressPresets');
    expect(src).toContain('card:');
    expect(src).toContain('iconButton:');
    expect(src).toContain('primaryButton:');
  });

  it('AppButton uses press feedback (scaleValue + disableAnimation false)', () => {
    const src = read(join(COMPONENTS, 'ui/AppButton.tsx'));
    expect(src).toContain('scaleValue={0.985}');
    expect(src).toContain('disableAnimation={false}');
  });

  // ── 2. Product / board / profile cards use premium press layer ──
  it('ProductCardV2 uses PressPresets.card on image press', () => {
    const src = read(join(COMPONENTS, 'ProductCardV2.tsx'));
    expect(src).toContain("...PressPresets.card");
  });

  it('LookPreviewCard uses PressPresets.card', () => {
    const src = read(join(COMPONENTS, 'profile/LookPreviewCard.tsx'));
    expect(src).toContain("...PressPresets.card");
  });

  it('ClosetBoardCard uses PressPresets.card', () => {
    const src = read(join(COMPONENTS, 'profile/ClosetBoardCard.tsx'));
    expect(src).toContain("...PressPresets.card");
  });

  it('FlagshipOrderCard uses AnimatedPressable + PressPresets', () => {
    const src = read(join(COMPONENTS, 'flagship/FlagshipOrderCard.tsx'));
    expect(src).toContain('AnimatedPressable');
    expect(src).toContain('PressPresets');
  });

  // ── 3. CachedImage fade / loading / empty placeholder ──
  it('CachedImage has shimmer loading state', () => {
    const src = read(join(COMPONENTS, 'CachedImage.tsx'));
    expect(src).toContain('shimmerX');
    expect(src).toContain('AnimatedLinearGradient');
  });

  it('CachedImage has fade-in animation on load', () => {
    const src = read(join(COMPONENTS, 'CachedImage.tsx'));
    expect(src).toContain('imageOpacity');
    expect(src).toContain('withTiming');
  });

  it('CachedImage renders ImageEmptyGraphic when uri is missing', () => {
    const src = read(join(COMPONENTS, 'CachedImage.tsx'));
    expect(src).toContain('ImageEmptyGraphic');
    expect(src).toMatch(/if\s*\(\s*!uri\s*\)/);
  });

  // ── 4. Skeletons are layout-specific ──
  it('MasonrySkeleton exists for masonry grid layouts', () => {
    expect(existsSync(join(COMPONENTS, 'skeletons/MasonrySkeleton.tsx'))).toBe(true);
  });

  it('BoardSkeleton exists for board card layouts', () => {
    expect(existsSync(join(COMPONENTS, 'skeletons/BoardSkeleton.tsx'))).toBe(true);
  });

  it('OrderRowSkeleton exists for order list layouts', () => {
    expect(existsSync(join(COMPONENTS, 'skeletons/OrderRowSkeleton.tsx'))).toBe(true);
  });

  it('BrowseScreen uses MasonrySkeleton instead of generic rectangles', () => {
    const src = read(join(SCREENS, 'BrowseScreen.tsx'));
    expect(src).toContain('MasonrySkeleton');
  });

  // ── 5. Empty graphics variants exist ──
  it('ImageEmptyGraphic exists and is used', () => {
    expect(existsSync(join(COMPONENTS, 'ImageEmptyGraphic.tsx'))).toBe(true);
    const cached = read(join(COMPONENTS, 'CachedImage.tsx'));
    expect(cached).toContain('ImageEmptyGraphic');
  });

  it('BoardEmptyGraphic exists', () => {
    expect(existsSync(join(COMPONENTS, 'profile/BoardEmptyGraphic.tsx'))).toBe(true);
  });

  it('FlagshipEmptyGraphic has multiple variants', () => {
    const src = read(join(COMPONENTS, 'flagship/FlagshipEmptyGraphic.tsx'));
    expect(src).toContain("variant?: 'bag' | 'box' | 'search' | 'chat' | 'image'");
  });

  it('SearchEmptyGraphic exists', () => {
    expect(existsSync(join(COMPONENTS, 'SearchEmptyGraphic.tsx'))).toBe(true);
  });

  it('OrdersEmptyGraphic exists', () => {
    expect(existsSync(join(COMPONENTS, 'OrdersEmptyGraphic.tsx'))).toBe(true);
  });

  // ── 6. ProfileTabRail has active visual transition support ──
  it('ProfileTabRail uses animated sliding indicator', () => {
    const src = read(join(COMPONENTS, 'profile/ProfileTabRail.tsx'));
    expect(src).toContain('indicatorX');
    expect(src).toContain('withSpring');
    expect(src).toContain('useAnimatedStyle');
  });

  // ── 7. No external placeholder providers ──
  it('no unsplash URLs in production screens/components/data', () => {
    for (const f of allProduction) {
      const src = read(f);
      expect(src).not.toContain('images.unsplash.com');
      expect(src).not.toContain('unsplash.com');
    }
  });

  it('no picsum URLs in production screens/components/data', () => {
    for (const f of allProduction) {
      const src = read(f);
      expect(src).not.toContain('picsum.photos');
    }
  });

  it('no placeholder.com in production screens', () => {
    for (const f of screenFiles) {
      const src = read(f);
      expect(src).not.toContain('placeholder.com');
    }
  });

  // ── 8. No fake users/stats/images ──
  it('no MOCK_USERS in production screens', () => {
    for (const f of screenFiles) {
      const src = read(f);
      expect(src).not.toContain('MOCK_USERS');
      expect(src).not.toContain('MOCK_CONTACTS');
    }
  });

  it('no MOCK_LISTINGS in production screens', () => {
    for (const f of screenFiles) {
      const src = read(f);
      expect(src).not.toContain('MOCK_LISTINGS');
    }
  });

  // ── 9. No gold/yellow/glass regressions ──
  it('no hardcoded gold hex in screens', () => {
    for (const f of screenFiles) {
      const src = read(f);
      expect(src).not.toContain('#F5A623');
      expect(src).not.toContain('#d7b98f');
      expect(src).not.toContain('#D4AF37');
    }
  });

  it('no glass/blur regressions in production screens', () => {
    for (const f of screenFiles) {
      const src = read(f);
      expect(src).not.toContain('GlassCard');
      expect(src).not.toContain('blurAmount');
      expect(src).not.toContain('backdrop-filter');
    }
  });

  // ── 10. No large unused motion components ──
  it('motion utilities are actually imported by production components', () => {
    const pressHook = read(join(SRC, 'hooks/usePremiumPressFeedback.ts'));
    expect(pressHook).toBeTruthy();

    // At least 3 production components import PressPresets
    let importCount = 0;
    for (const f of [...screenFiles, ...componentFiles]) {
      const src = read(f);
      if (src.includes('PressPresets')) importCount++;
    }
    expect(importCount).toBeGreaterThanOrEqual(3);
  });

  // ── 11. Entrance animations used on key screens ──
  it('BrowseScreen has FadeInDown entrance animations', () => {
    const src = read(join(SCREENS, 'BrowseScreen.tsx'));
    expect(src).toContain('FadeInDown');
  });

  it('ItemDetailScreen has FadeInDown entrance animations', () => {
    const src = read(join(SCREENS, 'ItemDetailScreen.tsx'));
    expect(src).toContain('FadeInDown');
  });

  it('MyOrdersScreen has FadeInDown entrance animations', () => {
    const src = read(join(SCREENS, 'MyOrdersScreen.tsx'));
    expect(src).toContain('FadeInDown');
  });

  // ── 12. Haptics wired to meaningful interactions ──
  it('ProductCardV2 has haptic on wishlist toggle', () => {
    const src = read(join(COMPONENTS, 'ProductCardV2.tsx'));
    expect(src).toContain('haptic.light');
    expect(src).toContain('haptic.success');
  });

  it('ProfileVisualHeader has haptic on follow and share', () => {
    const src = read(join(COMPONENTS, 'profile/ProfileVisualHeader.tsx'));
    expect(src).toContain('haptic.medium');
    expect(src).toContain('haptic.light');
  });

  it('ItemDetailScreen has haptic on share and save', () => {
    const src = read(join(SCREENS, 'ItemDetailScreen.tsx'));
    expect(src).toContain('haptic.light');
    expect(src).toContain('haptic.medium');
  });
});
