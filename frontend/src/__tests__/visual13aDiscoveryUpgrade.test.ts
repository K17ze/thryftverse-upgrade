import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

function readFile(rel: string) {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function fileExists(rel: string) {
  return fs.existsSync(path.join(SRC, rel));
}

describe('VISUAL-13A Discovery Visual Upgrade', () => {
  it('1. HomeScreen uses new editorial/visual discovery components', () => {
    const home = readFile('screens/HomeScreen.tsx');
    expect(home).toContain('EditorialDiscoveryHero');
    expect(home).toContain('DiscoverySectionHeader');
    expect(home).toContain('heroItems');
  });

  it('2. BrowseScreen uses PinterestMasonryGrid', () => {
    const browse = readFile('screens/BrowseScreen.tsx');
    expect(browse).toContain('PinterestMasonryGrid');
    expect(browse).toContain('DiscoverySectionHeader');
  });

  it('3. GlobalSearchScreen uses editorial discovery components', () => {
    const global = readFile('screens/GlobalSearchScreen.tsx');
    expect(global).toContain('HeroCarousel');
    expect(global).toContain('EditorialSection');
    expect(global).toContain('FeaturedBoardCard');
  });

  it('4. VisualSearchScreen does not look like a placeholder', () => {
    const visual = readFile('screens/VisualSearchScreen.tsx');
    expect(visual).toContain('sourceTitle');
    expect(visual).toContain('Find similar items with a photo');
    expect(visual).toContain('MasonryGrid');
  });

  it('5. CategoryTreeScreen uses VisualCategoryTile and no fake images', () => {
    const tree = readFile('screens/CategoryTreeScreen.tsx');
    expect(tree).toContain('VisualCategoryTile');
    expect(tree).toContain('DiscoverySectionHeader');
    // No hardcoded image URLs
    expect(tree).not.toMatch(/https?:\/\/(picsum|unsplash|placeholder)/i);
  });

  it('6. CategoryDetailScreen uses PinterestMasonryGrid', () => {
    const detail = readFile('screens/CategoryDetailScreen.tsx');
    expect(detail).toContain('PinterestMasonryGrid');
    expect(detail).toContain('DiscoverySectionHeader');
  });

  it('7. ProductCardV2 does not regress to heavy card treatment', () => {
    const card = readFile('components/ProductCardV2.tsx');
    // Should NOT have heavy Elevation.card on imageWrap
    const imageWrapMatch = card.match(/imageWrap:\s*\{[\s\S]*?\}/);
    expect(imageWrapMatch).toBeTruthy();
    const wrapBody = imageWrapMatch![0];
    expect(wrapBody).not.toContain('Elevation.card');
    expect(wrapBody).not.toContain('Radius.lg');
    expect(wrapBody).toContain('Radius.sm');
  });

  it('8. No Unsplash/picsum/placeholder providers in discovery screens', () => {
    const screens = [
      'screens/HomeScreen.tsx',
      'screens/BrowseScreen.tsx',
      'screens/SearchScreen.tsx',
      'screens/GlobalSearchScreen.tsx',
      'screens/VisualSearchScreen.tsx',
      'screens/CategoryTreeScreen.tsx',
      'screens/CategoryDetailScreen.tsx',
      'screens/ItemDetailScreen.tsx',
      'screens/PosterViewerScreen.tsx',
    ];
    for (const s of screens) {
      const content = readFile(s);
      expect(content).not.toMatch(/https?:\/\/(picsum|unsplash|placeholder|loremflickr)/i);
      expect(content).not.toMatch(/picsum-photos|unsplash-source|placehold\.co/i);
    }
  });

  it('9. No fake stats (ratings/reviews hardcoded)', () => {
    const screens = [
      'screens/HomeScreen.tsx',
      'screens/BrowseScreen.tsx',
      'screens/ItemDetailScreen.tsx',
      'screens/SearchScreen.tsx',
    ];
    for (const s of screens) {
      const content = readFile(s);
      expect(content).not.toMatch(/rating:\s*\d+\.\d+/);
      expect(content).not.toMatch(/reviewCount:\s*\d{3,}/);
    }
  });

  it('10. No gold/yellow/glass colors in new components', () => {
    const comps = [
      'components/discover/EditorialDiscoveryHero.tsx',
      'components/discover/PinterestMasonryGrid.tsx',
      'components/discover/VisualCategoryTile.tsx',
      'components/discover/DiscoverySectionHeader.tsx',
      'components/discover/PremiumSkeletonTile.tsx',
      'components/ImageEmptyGraphic.tsx',
    ];
    for (const c of comps) {
      if (!fileExists(c)) continue;
      const content = readFile(c);
      expect(content).not.toMatch(/#FFD700|#FFC107|#FFEB3B|gold|yellow/i);
      expect(content).not.toMatch(/backdrop-filter|blur\(|glassmorphism|glass/i);
    }
  });

  it('11. New visual components exist and are used', () => {
    expect(fileExists('components/discover/EditorialDiscoveryHero.tsx')).toBe(true);
    expect(fileExists('components/discover/PinterestMasonryGrid.tsx')).toBe(true);
    expect(fileExists('components/discover/VisualCategoryTile.tsx')).toBe(true);
    expect(fileExists('components/discover/DiscoverySectionHeader.tsx')).toBe(true);
    expect(fileExists('components/discover/PremiumSkeletonTile.tsx')).toBe(true);
    expect(fileExists('components/ImageEmptyGraphic.tsx')).toBe(true);
  });

  it('12. CachedImage renders honest placeholder when uri is empty', () => {
    const cached = readFile('components/CachedImage.tsx');
    expect(cached).toContain('ImageEmptyGraphic');
    expect(cached).toContain('if (!uri)');
  });

  it('13. No dead unused visual components', () => {
    // EditorialDiscoveryHero used in HomeScreen
    expect(readFile('screens/HomeScreen.tsx')).toContain('EditorialDiscoveryHero');
    // PinterestMasonryGrid used in BrowseScreen and CategoryDetailScreen
    expect(readFile('screens/BrowseScreen.tsx')).toContain('PinterestMasonryGrid');
    expect(readFile('screens/CategoryDetailScreen.tsx')).toContain('PinterestMasonryGrid');
    // VisualCategoryTile used in CategoryTreeScreen
    expect(readFile('screens/CategoryTreeScreen.tsx')).toContain('VisualCategoryTile');
    // DiscoverySectionHeader used in multiple screens
    expect(readFile('screens/HomeScreen.tsx')).toContain('DiscoverySectionHeader');
    expect(readFile('screens/ItemDetailScreen.tsx')).toContain('DiscoverySectionHeader');
    // PremiumSkeletonTile used in HomeScreen
    expect(readFile('screens/HomeScreen.tsx')).toContain('PremiumSkeletonTile');
    // ImageEmptyGraphic used in CachedImage which is used everywhere
    expect(readFile('components/CachedImage.tsx')).toContain('ImageEmptyGraphic');
  });

  it('14. Explore tabs feel like real social/visual modules', () => {
    const edit = readFile('components/explore/EditTab.tsx');
    const looks = readFile('components/explore/LooksTab.tsx');
    const pulse = readFile('components/explore/PulseTab.tsx');

    expect(edit).toContain('DiscoverySectionHeader');
    expect(looks).toContain('DiscoverySectionHeader');
    expect(pulse).toContain('DiscoverySectionHeader');

    // No blank/dead image cards assertion handled by CachedImage placeholder
    expect(edit).toContain('CachedImage');
    expect(looks).toContain('CachedImage');
    expect(pulse).toContain('CachedImage');
  });
});
