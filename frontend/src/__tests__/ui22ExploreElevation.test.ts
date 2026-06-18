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

describe('UI-22R.6B Explore Experience Elevation', () => {
  it('1. New screens exist', () => {
    expect(fileExists('screens/LookDetailScreen.tsx')).toBe(true);
    expect(fileExists('screens/PulseFeedScreen.tsx')).toBe(true);
    expect(fileExists('screens/ExploreCollectionScreen.tsx')).toBe(true);
    expect(fileExists('screens/StyleQuizScreen.tsx')).toBe(true);
  });

  it('2. Navigation routes registered in AppNavigator', () => {
    const nav = readFile('navigation/AppNavigator.tsx');
    expect(nav).toContain("LookDetailScreen");
    expect(nav).toContain("PulseFeedScreen");
    expect(nav).toContain("ExploreCollectionScreen");
    expect(nav).toContain("StyleQuizScreen");
    expect(nav).toContain('name="LookDetail"');
    expect(nav).toContain('name="PulseFeed"');
    expect(nav).toContain('name="ExploreCollection"');
    expect(nav).toContain('name="StyleQuiz"');
  });

  it('3. Navigation types include new routes', () => {
    const types = readFile('navigation/types.ts');
    expect(types).toContain('LookDetail:');
    expect(types).toContain('PulseFeed:');
    expect(types).toContain('ExploreCollection:');
    expect(types).toContain('StyleQuiz:');
  });

  it('4. PulseTab has no fabricated sellers or trending tags', () => {
    const pulse = readFile('components/explore/PulseTab.tsx');
    expect(pulse).not.toContain('HOT_SELLERS');
    expect(pulse).not.toContain('TRENDING_TAGS');
    expect(pulse).not.toContain('mariefullery');
    expect(pulse).not.toContain('scott_art');
    expect(pulse).not.toContain('dankdunksuk');
    expect(pulse).not.toContain('just_sold');
    expect(pulse).not.toContain('viewers:');
    expect(pulse).not.toContain('sales:');
  });

  it('5. LooksTab has no seed looks', () => {
    const looks = readFile('components/explore/LooksTab.tsx');
    expect(looks).not.toContain('LOOKS_SEED');
    expect(looks).not.toContain('Winter Layers');
    expect(looks).not.toContain('Minimal Monochrome');
    expect(looks).not.toContain('Streetwear Daily');
    expect(looks).not.toContain('mariefullery');
    expect(looks).not.toContain("'Comments coming soon'");
  });

  it('6. LooksTab navigates to LookDetail', () => {
    const looks = readFile('components/explore/LooksTab.tsx');
    expect(looks).toContain("'LookDetail'");
  });

  it('7. EditTab has no fabricated editorial content', () => {
    const edit = readFile('components/explore/EditTab.tsx');
    expect(edit).not.toContain('HERO_ITEMS');
    expect(edit).not.toContain('FEATURED_BOARDS');
    expect(edit).not.toContain('EDITORIAL_SECTIONS');
    expect(edit).not.toContain('DROP_CALENDAR');
    expect(edit).not.toContain('Summer Essentials');
    expect(edit).not.toContain('Comme des Garçons');
    expect(edit).not.toContain('Brand Spotlight');
    expect(edit).not.toContain('Drop Calendar');
    expect(edit).not.toContain("'Style Quiz coming soon'");
  });

  it('8. EditTab uses real data modules', () => {
    const edit = readFile('components/explore/EditTab.tsx');
    expect(edit).toContain('newestListings');
    expect(edit).toContain('priceDropListings');
    expect(edit).toContain('ExploreCollection');
    expect(edit).toContain("'StyleQuiz'");
  });

  it('9. SearchScreen has no seed looks', () => {
    const search = readFile('screens/SearchScreen.tsx');
    expect(search).not.toContain('SAVED_LOOKS_SEED');
    expect(search).not.toContain('LOOKS_SEED');
    expect(search).not.toContain('Winter Layers');
  });

  it('10. CreateLookScreen adds to store and navigates to LookDetail on publish', () => {
    const create = readFile('screens/CreateLookScreen.tsx');
    expect(create).toContain('addUserLook');
    expect(create).toContain("'LookDetail'");
    // After successful publish, navigate to LookDetail instead of goBack
    const publishIndex = create.indexOf("show('Look published'");
    const afterPublish = create.slice(publishIndex, publishIndex + 200);
    expect(afterPublish).toContain("'LookDetail'");
  });

  it('11. PulseFeedScreen uses only real data', () => {
    const feed = readFile('screens/PulseFeedScreen.tsx');
    expect(feed).toContain('customAuctions');
    expect(feed).toContain('listings');
    expect(feed).not.toContain('HOT_SELLERS');
    expect(feed).not.toContain('TRENDING_TAGS');
  });

  it('12. ExploreCollectionScreen uses real listings filter', () => {
    const collection = readFile('screens/ExploreCollectionScreen.tsx');
    expect(collection).toContain('listings');
    expect(collection).toContain('MasonryGrid');
    expect(collection).toContain('EmptyState');
  });

  it('13. StyleQuizScreen navigates truthfully', () => {
    const quiz = readFile('screens/StyleQuizScreen.tsx');
    expect(quiz).toContain('updatePersonalisationPreferences');
    expect(quiz).not.toContain('coming soon');
    expect(quiz).not.toContain('AI analysis');
  });
});
