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

describe('VISUAL-13B Profile Closet Social Upgrade', () => {
  it('1. MyProfileScreen uses ProfileVisualHeader or ProfileTabRail', () => {
    const src = readFile('screens/MyProfileScreen.tsx');
    expect(src).toContain('ProfileVisualHeader');
    expect(src).toContain('ProfileTabRail');
  });

  it('2. UserProfileScreen uses ProfileVisualHeader or ProfileTabRail', () => {
    const src = readFile('screens/UserProfileScreen.tsx');
    expect(src).toContain('ProfileTabRail');
  });

  it('3. ClosetScreen uses MoodboardCollectionGrid', () => {
    const src = readFile('screens/ClosetScreen.tsx');
    expect(src).toContain('MoodboardCollectionGrid');
  });

  it('4. ClosetScreen uses BoardEmptyGraphic for collections empty state', () => {
    const src = readFile('screens/ClosetScreen.tsx');
    expect(src).toContain('BoardEmptyGraphic');
  });

  it('5. CollectionDetailScreen uses BoardEmptyGraphic', () => {
    const src = readFile('screens/CollectionDetailScreen.tsx');
    expect(src).toContain('BoardEmptyGraphic');
  });

  it('6. LooksTab uses LookPreviewCard', () => {
    const src = readFile('components/explore/LooksTab.tsx');
    expect(src).toContain('LookPreviewCard');
  });

  it('7. EditProfileScreen preserves uploadMedia/updateMyProfile/fetchMyProfile flow', () => {
    const src = readFile('screens/EditProfileScreen.tsx');
    expect(src).toContain('uploadMedia');
    expect(src).toContain('updateMyProfile');
    expect(src).toContain('fetchMyProfile');
    expect(src).not.toContain('file://');
  });

  it('8. No fake followers/ratings/reviews in profile screens', () => {
    const screens = [
      'screens/MyProfileScreen.tsx',
      'screens/UserProfileScreen.tsx',
      'screens/EditProfileScreen.tsx',
    ];
    for (const s of screens) {
      const content = readFile(s);
      expect(content).not.toMatch(/followers:\s*\d{3,}/);
      expect(content).not.toMatch(/followerCount:\s*\d{3,}/);
      expect(content).not.toMatch(/rating:\s*\d\.\d/);
      expect(content).not.toMatch(/reviewCount:\s*\d{3,}/);
    }
  });

  it('9. No Unsplash/picsum/placeholder providers in profile/closet screens', () => {
    const screens = [
      'screens/MyProfileScreen.tsx',
      'screens/UserProfileScreen.tsx',
      'screens/EditProfileScreen.tsx',
      'screens/ClosetScreen.tsx',
      'screens/CollectionDetailScreen.tsx',
      'components/explore/EditTab.tsx',
      'components/explore/LooksTab.tsx',
      'components/explore/PulseTab.tsx',
    ];
    for (const s of screens) {
      const content = readFile(s);
      expect(content).not.toMatch(/https?:\/\/(picsum|unsplash|placeholder|loremflickr)/i);
      expect(content).not.toMatch(/picsum-photos|unsplash-source|placehold\.co/i);
    }
  });

  it('10. No gold/yellow/glass colors in new profile components', () => {
    const comps = [
      'components/profile/ProfileVisualHeader.tsx',
      'components/profile/ProfileTabRail.tsx',
      'components/profile/ClosetBoardCard.tsx',
      'components/profile/MoodboardCollectionGrid.tsx',
      'components/profile/LookPreviewCard.tsx',
      'components/profile/BoardEmptyGraphic.tsx',
    ];
    for (const c of comps) {
      if (!fileExists(c)) continue;
      const content = readFile(c);
      expect(content).not.toMatch(/#FFD700|#FFC107|#FFEB3B|gold|yellow/i);
      expect(content).not.toMatch(/backdrop-filter|blur\(|glassmorphism|glass/i);
    }
  });

  it('11. New visual components exist and are used', () => {
    expect(fileExists('components/profile/ProfileVisualHeader.tsx')).toBe(true);
    expect(fileExists('components/profile/ProfileTabRail.tsx')).toBe(true);
    expect(fileExists('components/profile/ClosetBoardCard.tsx')).toBe(true);
    expect(fileExists('components/profile/MoodboardCollectionGrid.tsx')).toBe(true);
    expect(fileExists('components/profile/LookPreviewCard.tsx')).toBe(true);
    expect(fileExists('components/profile/BoardEmptyGraphic.tsx')).toBe(true);
    expect(fileExists('components/ImageEmptyGraphic.tsx')).toBe(true);
  });

  it('12. No dead unused visual components', () => {
    expect(readFile('screens/MyProfileScreen.tsx')).toContain('ProfileVisualHeader');
    expect(readFile('screens/MyProfileScreen.tsx')).toContain('ProfileTabRail');
    expect(readFile('screens/UserProfileScreen.tsx')).toContain('ProfileTabRail');
    expect(readFile('screens/ClosetScreen.tsx')).toContain('MoodboardCollectionGrid');
    expect(readFile('screens/ClosetScreen.tsx')).toContain('BoardEmptyGraphic');
    expect(readFile('screens/CollectionDetailScreen.tsx')).toContain('BoardEmptyGraphic');
    expect(readFile('components/explore/LooksTab.tsx')).toContain('LookPreviewCard');
    expect(readFile('components/CachedImage.tsx')).toContain('ImageEmptyGraphic');
  });

  it('13. CachedImage renders honest placeholder when uri is empty', () => {
    const cached = readFile('components/CachedImage.tsx');
    expect(cached).toContain('ImageEmptyGraphic');
    expect(cached).toContain('if (!uri)');
  });

  it('14. UserProfileScreen has no fake follower counts hardcoded', () => {
    const src = readFile('screens/UserProfileScreen.tsx');
    expect(src).not.toMatch(/followers?:\s*\d{2,}/);
    expect(src).not.toMatch(/following?:\s*\d{2,}/);
  });
});
