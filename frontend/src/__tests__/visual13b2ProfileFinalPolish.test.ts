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

describe('VISUAL-13B.2 Profile Final Polish', () => {
  it('1. MyProfileScreen uses canonical identity hero', () => {
    const src = readFile('screens/MyProfileScreen.tsx');
    // ProfileVisualHeader was retired in the VQ-09D profile declutter; the
    // canonical self-profile identity surface is MyProfileIdentityHero.
    expect(src).toContain('MyProfileIdentityHero');
  });

  it('2. MyProfileScreen does not contain old duplicated legacy hero markers', () => {
    const src = readFile('screens/MyProfileScreen.tsx');
    expect(src).not.toContain('Profile Hero - LinkedIn Style');
    expect(src).not.toContain('avatarWrapLinkedIn');
    expect(src).not.toContain('heroAvatarLinkedIn');
    expect(src).not.toContain('heroNameLinkedIn');
    expect(src).not.toContain('editAvatarChipLinkedIn');
  });

  it('3. MyProfileScreen uses canonical tab rail', () => {
    const src = readFile('screens/MyProfileScreen.tsx');
    // ProfileTabRail was retired for the self-profile; MyProfileTabRail is canonical.
    expect(src).toContain('MyProfileTabRail');
  });

  it('4. UserProfileScreen uses ProfileHero which renders FlagshipProfileMedia', () => {
    const heroSrc = readFile('components/profile/ProfileHero.tsx');
    expect(heroSrc).toContain('FlagshipProfileMedia');
    const screenSrc = readFile('screens/UserProfileScreen.tsx');
    expect(screenSrc).toContain('ProfileHero');
  });

  it('5. CollectionDetailScreen has board-style visual layout', () => {
    const src = readFile('screens/CollectionDetailScreen.tsx');
    expect(src).toContain('coverImage');
    expect(src).toContain('coverTitle');
    expect(src).toContain('MasonryGrid');
    expect(src).toContain('BoardEmptyGraphic');
  });

  it('6. ClosetScreen uses MoodboardCollectionGrid', () => {
    const src = readFile('screens/ClosetScreen.tsx');
    expect(src).toContain('MoodboardCollectionGrid');
    // ClosetBoardCard is used inside MoodboardCollectionGrid component
    const gridSrc = readFile('components/profile/MoodboardCollectionGrid.tsx');
    expect(gridSrc).toContain('ClosetBoardCard');
  });

  it('7. Looks/Edit/Pulse tabs use coherent visual components', () => {
    const looks = readFile('components/explore/LooksTab.tsx');
    const edit = readFile('components/explore/EditTab.tsx');
    const pulse = readFile('components/explore/PulseTab.tsx');

    // All use CachedImage with honest placeholders
    expect(looks).toContain('CachedImage');
    expect(edit).toContain('CachedImage');
    expect(pulse).toContain('CachedImage');

    // Looks renders with Reanimated entrance motion (canonical motion language)
    expect(looks).toContain('FadeInDown');
  });

  it('8. No fake followers/ratings/reviews in profile screens', () => {
    const screens = [
      'screens/MyProfileScreen.tsx',
      'screens/UserProfileScreen.tsx',
      'screens/EditProfileScreen.tsx',
    ];
    for (const s of screens) {
      const content = readFile(s);
      expect(content).not.toMatch(/followers?:\s*\d{2,}/);
      expect(content).not.toMatch(/following?:\s*\d{2,}/);
      expect(content).not.toMatch(/rating:\s*\d\.\d/);
      expect(content).not.toMatch(/reviewCount:\s*\d{3,}/);
    }
  });

  it('9. No Unsplash/picsum/placeholder providers', () => {
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

  it('11. ProfileVisualHeader supports hideCover prop', () => {
    const src = readFile('components/profile/ProfileVisualHeader.tsx');
    expect(src).toContain('hideCover');
  });

  it('12. MyProfileScreen tab content is modular (listings/looks/about)', () => {
    const src = readFile('screens/MyProfileScreen.tsx');
    // Canonical tabs after the VQ-09D profile declutter: listings / looks / about.
    // (edits/looks/pulse were retired in favour of the cleaner self-profile IA.)
    expect(src).toContain("activeTab === 'listings'");
    expect(src).toContain("activeTab === 'looks'");
    expect(src).toContain("activeTab === 'about'");
  });

  it('13. CachedImage renders honest placeholder when uri is empty', () => {
    const cached = readFile('components/CachedImage.tsx');
    expect(cached).toContain('ImageEmptyGraphic');
    expect(cached).toContain('if (!uri)');
  });
});