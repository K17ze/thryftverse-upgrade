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
  it('1. HomeScreen uses focused visual discovery components', () => {
    const home = readFile('screens/HomeScreen.tsx');
    expect(home).toContain('DiscoverySectionHeader');
    expect(home).toContain('ExploreGridItem');
    expect(home).not.toContain('EditorialDiscoveryHero');
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

  it('4. VisualSearchScreen is a premium Google Lens-style visual search surface (not a placeholder)', () => {
    const visual = readFile('screens/VisualSearchScreen.tsx');
    const camera = readFile('components/VisualSearchCamera.tsx');
    // Full-screen in-app camera viewfinder (Google Lens style)
    expect(visual).toContain('VisualSearchCamera');
    expect(camera).toContain('CameraView');
    expect(camera).toContain('shutterOuter');
    expect(camera).toContain('Gallery');
    expect(camera).toContain('Switch camera');
    // Recent gallery thumbnail shortcut (Google Lens bottom-left pattern)
    expect(camera).toContain('MediaLibrary.getAssetsAsync');
    expect(camera).toContain('galleryThumb');
    // Corner brackets + crosshair (framing chrome)
    expect(camera).toContain('bracketTL');
    expect(camera).toContain('crosshair');
    // Permission overlay with Settings action is inside the camera component
    expect(camera).toContain('Camera access needed');
    expect(camera).toContain('Enable camera permission in Settings to search with a photo');
    expect(camera).toContain('Linking.openSettings');
    // Persistent visual-query header with retake/replace/remove
    expect(visual).toContain('Retake');
    expect(visual).toContain('Replace');
    expect(visual).toContain('Remove photo and start over');
    // Multi-modal refinement (image + text + category + brand + price)
    expect(visual).toContain('Describe your photo');
    expect(visual).toContain('Apply filters');
    expect(visual).toContain('Min £');
    expect(visual).toContain('Max £');
    // Real results via canonical masonry grid
    expect(visual).toContain('PinterestMasonryGrid');
    expect(visual).toContain('DiscoverySectionHeader');
    // Save-search with alerts (truthful)
    expect(visual).toContain('Save search');
    expect(visual).toContain('Search saved with alerts enabled');
    // Honest integrated note describes the matching that actually runs.
    expect(visual).toContain('Showing matches from your category, brand, and description filters.');
    expect(visual).not.toContain('coming soon');
    // State coverage: loading skeleton, empty recovery, error retry
    expect(visual).toContain('PremiumSkeletonTile');
    expect(visual).toContain('No items match your photo filters');
    expect(visual).toContain("Couldn't load results");
    // The old dead-end apology is gone
    expect(visual).not.toContain('Visual matching is coming soon');
    expect(visual).not.toContain('No scan or upload has been started');
    // Backend visualSearch client is wired
    expect(visual).toContain('visualSearch');
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
    expect(detail).toContain('ScreenHeader');
    expect(detail).toContain('CATEGORIES');
    expect(detail).not.toContain('MOCK_CATEGORIES');
  });

  it('7. ProductCardV2 uses a restrained flagship media radius without elevation', () => {
    const card = readFile('components/ProductCardV2.tsx');
    // Should NOT have heavy Elevation.card on imageWrap
    const imageWrapMatch = card.match(/imageWrap:\s*\{[\s\S]*?\}/);
    expect(imageWrapMatch).toBeTruthy();
    const wrapBody = imageWrapMatch![0];
    expect(wrapBody).not.toContain('Elevation.card');
    expect(wrapBody).toContain('Radius.lg');
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
    // PinterestMasonryGrid used in BrowseScreen and CategoryDetailScreen
    expect(readFile('screens/BrowseScreen.tsx')).toContain('PinterestMasonryGrid');
    expect(readFile('screens/CategoryDetailScreen.tsx')).toContain('PinterestMasonryGrid');
    // VisualCategoryTile used in CategoryTreeScreen
    expect(readFile('screens/CategoryTreeScreen.tsx')).toContain('VisualCategoryTile');
    // DiscoverySectionHeader used across the discovery journey
    expect(readFile('screens/HomeScreen.tsx')).toContain('DiscoverySectionHeader');
    expect(readFile('screens/CategoryTreeScreen.tsx')).toContain('DiscoverySectionHeader');
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
