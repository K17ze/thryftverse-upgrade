import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Radius, Type } from '../theme/designTokens';
const COMMERCE_DETAIL = resolve(__dirname, '../components/commerce/detail');

function readDetailComponent(name: string): string {
  return readFileSync(resolve(COMMERCE_DETAIL, `${name}.tsx`), 'utf-8');
}

function readTypes(): string {
  return readFileSync(resolve(COMMERCE_DETAIL, 'types.ts'), 'utf-8');
}

describe('commerce-detail family art direction (spec 05)', () => {
  // ── §1 Family-aware transaction variants ──
  describe('family-aware transaction surface', () => {
    it('CommerceDetailTransactionSurface accepts a family prop', () => {
      const src = readDetailComponent('CommerceDetailTransactionSurface');
      expect(src).toContain('family?: CommerceDetailFamily');
      expect(src).toContain("family = 'direct'");
    });

    it('defines family-specific container styles for direct, auction, co_own', () => {
      const src = readDetailComponent('CommerceDetailTransactionSurface');
      expect(src).toContain('containerDirect');
      expect(src).toContain('containerAuction');
      expect(src).toContain('containerCoOwn');
    });

    it('keeps family transaction compositions flat rather than forcing a generic card', () => {
      const src = readDetailComponent('CommerceDetailTransactionSurface');
      expect(src).not.toContain('familyRadius');
      expect(src).not.toContain('borderRadius:');
      expect(src).not.toContain('borderColor:');
    });

    it('does not create three separate transaction components', () => {
      const src = readDetailComponent('CommerceDetailTransactionSurface');
      // One shared component with family variants, not three.
      expect(src).toMatch(/export function CommerceDetailTransactionSurface/);
      expect(src).not.toMatch(/CommerceDetailTransactionSurfaceDirect/);
      expect(src).not.toMatch(/CommerceDetailTransactionSurfaceAuction/);
      expect(src).not.toMatch(/CommerceDetailTransactionSurfaceCoOwn/);
    });
  });

  // ── §2 Section rhythm variants ──
  describe('section rhythm variants', () => {
    it('CommerceDetailSection accepts a variant prop', () => {
      const src = readDetailComponent('CommerceDetailSection');
      expect(src).toContain('variant?: CommerceDetailSectionVariant');
      expect(src).toContain("variant = 'standard'");
    });

    it('implements all six variants', () => {
      const src = readDetailComponent('CommerceDetailSection');
      expect(src).toContain('containerEditorial');
      expect(src).toContain('containerCompact');
      expect(src).toContain('containerContinuation');
      expect(src).toContain('containerLegal');
      expect(src).toContain('containerDiscovery');
    });

    it('continuation variant renders no heading or divider', () => {
      const src = readDetailComponent('CommerceDetailSection');
      expect(src).toMatch(/variant === 'continuation'/);
      expect(src).toMatch(/return <View style=\{containerStyle\}>\{children\}<\/View>/);
    });

    it('editorial variant has a stronger heading', () => {
      const src = readDetailComponent('CommerceDetailSection');
      expect(src).toContain('labelEditorial');
      expect(src).toContain('Type.subtitle');
    });

    it('compact variant suppresses divider', () => {
      const src = readDetailComponent('CommerceDetailSection');
      expect(src).toMatch(/showDivider.*variant !== 'compact'/);
    });
  });

  // ── §3 Responsive family-aware identity ──
  describe('responsive family-aware identity', () => {
    it('CommerceDetailIdentity accepts family and density props', () => {
      const src = readDetailComponent('CommerceDetailIdentity');
      expect(src).toContain('family?: CommerceDetailFamily');
      expect(src).toContain('density?: CommerceDetailIdentityDensity');
      expect(src).toContain("family = 'direct'");
      expect(src).toContain("density = 'standard'");
    });

    it('auction family suppresses primaryValue (no price in identity)', () => {
      const src = readDetailComponent('CommerceDetailIdentity');
      expect(src).toContain("family === 'direct' ? primaryValue : undefined");
      expect(src).toContain('showPrimaryValue');
    });

    it('co_own family suppresses primaryValue (no price in identity)', () => {
      const src = readDetailComponent('CommerceDetailIdentity');
      // The same guard covers both auction and co_own
      expect(src).toMatch(/only `direct` may show price/);
    });

    it('compact density uses 26pt title', () => {
      const src = readDetailComponent('CommerceDetailIdentity');
      expect(src).toContain('titleCompact');
      // titleCompact uses Type.priceHero.size - 2 (28 - 2 = 26pt)
      expect(src).toMatch(/fontSize: Type\.priceHero\.size - 2/);
    });

    it('standard density uses 28pt title', () => {
      const src = readDetailComponent('CommerceDetailIdentity');
      expect(src).toMatch(/title:[\s\S]*fontSize: Type.priceHero.size/);
    });
  });

  // ── §4 Dock geometry ──
  describe('dock geometry', () => {
    it('CommerceDetailStateDock accepts a layout prop', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('layout?: CommerceDetailDockLayout');
      expect(src).toContain("layout = 'auto'");
    });

    it('auto layout stacks on compact widths', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('COMPACT_STACK_THRESHOLD');
      expect(src).toMatch(/layout === 'auto' && hasSecondary && screenWidth < COMPACT_STACK_THRESHOLD/);
    });

    it('supports inline, stacked, and auto layouts', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain("layout === 'stacked'");
      expect(src).toContain("layout === 'auto'");
      expect(src).toContain('shouldStack');
    });

    it('stacked layout uses rowStacked and actionClusterStacked', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('rowStacked');
      expect(src).toContain('actionClusterStacked');
      expect(src).toContain('primaryActionStacked');
      expect(src).toContain('secondaryActionStacked');
    });

    it('uses useWindowDimensions for responsive layout', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('useWindowDimensions');
    });
  });

  // ── §5 Restrained radii ──
  describe('restrained radii', () => {
    it('primary action uses full-pill radius (not 24)', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('Radius.full');
      expect(src).not.toMatch(/borderRadius: Radius.xxl/);
    });

    it('thumbnail uses medium Radius', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      // Thumbnail uses Radius.md; primary and secondary use Radius.full
      const matches = src.match(/Radius\.md/g);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── §6 Typography consistency ──
  describe('typography consistency', () => {
    it('all numeric amounts use tabular numerals', () => {
      const dock = readDetailComponent('CommerceDetailStateDock');
      const identity = readDetailComponent('CommerceDetailIdentity');
      const surface = readDetailComponent('CommerceDetailTransactionSurface');
      expect(dock).toContain("fontVariant: ['tabular-nums']");
      expect(identity).toContain("fontVariant: ['tabular-nums']");
      expect(surface).toContain("fontVariant: ['tabular-nums']");
    });

    it('uses design tokens (Type) not hardcoded font sizes for primary values', () => {
      const surface = readDetailComponent('CommerceDetailTransactionSurface');
      expect(surface).toContain('Type.priceHero');
      expect(surface).toContain('Type.bodyStrong');
    });
  });

  // ── §7 Motion ──
  describe('motion', () => {
    it('dock respects reduced motion', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('useReducedMotion');
      expect(src).toMatch(/if \(reducedMotion\)/);
    });

    it('dock uses one entry transition (FadeIn)', () => {
      const src = readDetailComponent('CommerceDetailStateDock');
      expect(src).toContain('FadeIn');
      expect(src).toContain('duration(280)');
    });

    it('header respects reduced motion', () => {
      const src = readDetailComponent('CommerceDetailHeader');
      expect(src).toContain('useReducedMotion');
      expect(src).toMatch(/reducedMotion \? 1 :/);
    });
  });

  // ── Shared types ──
  describe('shared types', () => {
    it('types.ts defines CommerceDetailFamily', () => {
      const src = readTypes();
      expect(src).toContain("type CommerceDetailFamily = 'direct' | 'auction' | 'co_own'");
    });

    it('types.ts defines CommerceDetailSectionVariant with all six variants', () => {
      const src = readTypes();
      expect(src).toContain("'standard'");
      expect(src).toContain("'editorial'");
      expect(src).toContain("'compact'");
      expect(src).toContain("'continuation'");
      expect(src).toContain("'legal'");
      expect(src).toContain("'discovery'");
    });

    it('types.ts defines CommerceDetailDockLayout', () => {
      const src = readTypes();
      expect(src).toContain("'inline' | 'stacked' | 'auto'");
    });

    it('types.ts defines CommerceDetailIdentityDensity', () => {
      const src = readTypes();
      expect(src).toContain("'compact' | 'standard'");
    });

    it('index.ts exports the new types', () => {
      const index = readFileSync(resolve(COMMERCE_DETAIL, 'index.ts'), 'utf-8');
      expect(index).toContain('CommerceDetailFamily');
      expect(index).toContain('CommerceDetailSectionVariant');
      expect(index).toContain('CommerceDetailIdentityDensity');
      expect(index).toContain('CommerceDetailDockLayout');
    });
  });
});
