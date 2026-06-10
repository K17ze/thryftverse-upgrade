import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const NAV = resolve(__dirname, '../navigation');
const SERVICES = resolve(__dirname, '../services');
const STORE = resolve(__dirname, '../store');
const ROOT = resolve(process.cwd(), '..');
const BACKEND = resolve(ROOT, 'backend/api/src');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('UI-19 sell co-own and chat marketplace context UX', () => {
  // ── 1. Backend collection PATCH/DELETE endpoints exist ──
  it('backend has collection PATCH endpoint', () => {
    const src = read(resolve(BACKEND, 'index.ts'));
    expect(src).toContain("app.patch('/collections/:collectionId'");
  });

  it('backend has collection DELETE endpoint', () => {
    const src = read(resolve(BACKEND, 'index.ts'));
    expect(src).toContain("app.delete('/collections/:collectionId'");
  });

  // ── 2. Frontend collectionsApi has update/delete methods ──
  it('frontend collectionsApi has updateCollection', () => {
    const src = read(resolve(SERVICES, 'collectionsApi.ts'));
    expect(src).toContain('export async function updateCollection');
  });

  it('frontend collectionsApi has deleteCollectionOnApi', () => {
    const src = read(resolve(SERVICES, 'collectionsApi.ts'));
    expect(src).toContain('export async function deleteCollectionOnApi');
  });

  // ── 3. useStore has backend-aware collection update/delete ──
  it('useStore has updateCollectionOnApi', () => {
    const src = read(resolve(STORE, 'useStore.ts'));
    expect(src).toContain('updateCollectionOnApi:');
    expect(src).toContain('deleteCollectionOnApi:');
  });

  // ── 4. EditCollectionScreen uses backend update/delete ──
  it('EditCollectionScreen calls updateCollectionOnApi on save', () => {
    const src = read(resolve(SCREENS, 'EditCollectionScreen.tsx'));
    expect(src).toContain('updateCollectionOnApi');
    expect(src).toContain('deleteCollectionOnApi');
    expect(src).toContain('Unable to update collection');
    expect(src).toContain('Unable to delete collection');
  });

  // ── 5. ListingPreviewScreen is registered and uses premium primitives ──
  it('ListingPreviewScreen is registered in navigation', () => {
    const types = read(resolve(NAV, 'types.ts'));
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(types).toContain('ListingPreview:');
    expect(nav).toContain("name=\"ListingPreview\"");
    expect(nav).toContain('ListingPreviewScreen');
  });

  it('ListingPreviewScreen uses premium visual primitives', () => {
    const src = read(resolve(SCREENS, 'ListingPreviewScreen.tsx'));
    expect(src).toContain('ScreenHeader');
    expect(src).toContain('CachedImage');
    expect(src).toContain('PremiumStatusPill');
    expect(src).toContain('FadeInDown');
  });

  // ── 6. SellScreenV2 navigates to ListingPreview ──
  it('SellScreenV2 has Preview button leading to ListingPreview', () => {
    const src = read(resolve(SCREENS, 'SellScreenV2.tsx'));
    expect(src).toContain('ListingPreview');
    expect(src).toContain('Preview');
    expect(src).toContain('previewBtn');
  });

  // ── 7. TradeConfirmScreen is registered and uses premium primitives ──
  it('TradeConfirmScreen is registered in navigation', () => {
    const types = read(resolve(NAV, 'types.ts'));
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(types).toContain('TradeConfirm:');
    expect(nav).toContain("name=\"TradeConfirm\"");
    expect(nav).toContain('TradeConfirmScreen');
  });

  it('TradeConfirmScreen uses premium visual primitives', () => {
    const src = read(resolve(SCREENS, 'TradeConfirmScreen.tsx'));
    expect(src).toContain('ScreenHeader');
    expect(src).toContain('PremiumStatusPill');
    expect(src).toContain('FadeInDown');
  });

  // ── 8. TradeScreen navigates to TradeConfirm before submission ──
  it('TradeScreen navigates to TradeConfirm with order summary', () => {
    const src = read(resolve(SCREENS, 'TradeScreen.tsx'));
    expect(src).toContain('TradeConfirm');
    expect(src).toContain('feeGbp');
    expect(src).toContain('totalGbp');
  });

  // ── 9. ManageListingScreen uses FlagshipActionCluster ──
  it('ManageListingScreen has upgraded action cluster', () => {
    const src = read(resolve(SCREENS, 'ManageListingScreen.tsx'));
    expect(src).toContain('FlagshipActionCluster');
    expect(src).toContain('healthCard');
    expect(src).toContain('healthRow');
  });

  // ── 10. ChatScreen has upgraded marketplace context card ──
  it('ChatScreen TaggedItemCard has quick action buttons', () => {
    const src = read(resolve(SCREENS, 'ChatScreen.tsx'));
    expect(src).toContain('itemQuickActions');
    expect(src).toContain('itemQuickBtn');
    expect(src).toContain('Buy');
    expect(src).toContain('Offer');
  });

  // ── 11. CreateAuctionScreen uses real backend API and has terms ──
  it('CreateAuctionScreen calls createAuction backend API', () => {
    const src = read(resolve(SCREENS, 'CreateAuctionScreen.tsx'));
    expect(src).toContain('createAuction');
    expect(src).not.toContain('addAuction');
    expect(src).not.toContain("from '../data/mockData'");
    expect(src).not.toContain("from '../data/tradeHub'");
  });

  it('CreateAuctionScreen has terms and fees section', () => {
    const src = read(resolve(SCREENS, 'CreateAuctionScreen.tsx'));
    expect(src).toContain('TERMS & FEES');
    expect(src).toContain('Platform fee');
    expect(src).toContain('Duration');
  });

  // ── 12. No fake data or regressions ──
  it('no fake user data in new screens', () => {
    const screens = [
      'ListingPreviewScreen.tsx',
      'TradeConfirmScreen.tsx',
      'CreateAuctionScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('user@example.com');
      expect(src).not.toContain('John Doe');
      expect(src).not.toContain('picsum.photos');
      expect(src).not.toContain('unsplash.com');
    }
  });

  it('no gold or yellow color regressions in new screens', () => {
    const screens = [
      'ListingPreviewScreen.tsx',
      'TradeConfirmScreen.tsx',
      'CreateAuctionScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('#FFD700');
      expect(src).not.toMatch(/color:\s*['"]gold['"]/i);
      expect(src).not.toMatch(/color:\s*['"]yellow['"]/i);
      expect(src).not.toMatch(/backgroundColor:\s*['"]gold['"]/i);
      expect(src).not.toMatch(/backgroundColor:\s*['"]yellow['"]/i);
    }
  });
});
