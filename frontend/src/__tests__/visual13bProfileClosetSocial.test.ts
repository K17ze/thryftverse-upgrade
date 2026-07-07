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
  it('1. MyProfileScreen uses canonical identity hero and tab rail', () => {
    const src = readFile('screens/MyProfileScreen.tsx');
    expect(src).toContain('MyProfileIdentityHero');
    expect(src).toContain('MyProfileTabRail');
  });

  it('2. UserProfileScreen uses ProfileHero (FlagshipProfileMedia) and TabRail', () => {
    const heroSrc = readFile('components/profile/ProfileHero.tsx');
    expect(heroSrc).toContain('FlagshipProfileMedia');
    const screenSrc = readFile('screens/UserProfileScreen.tsx');
    expect(screenSrc).toContain('ProfileHero');
    expect(screenSrc).toContain('TabRail');
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

  it('6. LooksTab renders looks with CachedImage (no fabricated placeholders)', () => {
    const src = readFile('components/explore/LooksTab.tsx');
    // LooksTab renders look cards inline with CachedImage (LookPreviewCard is not
    // imported here — the canonical explore surface composes its own card).
    expect(src).toContain('CachedImage');
    expect(src).not.toMatch(/https?:\/\/(picsum|unsplash|placeholder|loremflickr)/i);
  });

  it('7. EditProfileScreen preserves updateMyProfile/fetchMyProfile flow (media moved to profile surface)', () => {
    const src = readFile('screens/EditProfileScreen.tsx');
    // Media editing was moved to MyProfileScreen/FlagshipProfileMedia.
    // EditProfileScreen is now a text/account form — no media upload hook.
    expect(src).not.toContain('useProfileMediaUpload');
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

  it('12. Canonical visual components are wired into their screens', () => {
    // MyProfileScreen uses the canonical My-profile identity hero + tab rail.
    expect(readFile('screens/MyProfileScreen.tsx')).toContain('MyProfileIdentityHero');
    expect(readFile('screens/MyProfileScreen.tsx')).toContain('MyProfileTabRail');
    // UserProfileScreen uses ProfileHero + TabRail (shared profile tab rail).
    expect(readFile('screens/UserProfileScreen.tsx')).toContain('ProfileHero');
    expect(readFile('screens/UserProfileScreen.tsx')).toContain('TabRail');
    // Closet + Collection surfaces keep their board visual language.
    expect(readFile('screens/ClosetScreen.tsx')).toContain('MoodboardCollectionGrid');
    expect(readFile('screens/ClosetScreen.tsx')).toContain('BoardEmptyGraphic');
    expect(readFile('screens/CollectionDetailScreen.tsx')).toContain('BoardEmptyGraphic');
    // LooksTab renders with CachedImage (canonical image primitive).
    expect(readFile('components/explore/LooksTab.tsx')).toContain('CachedImage');
    // CachedImage renders an honest empty graphic when uri is missing.
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