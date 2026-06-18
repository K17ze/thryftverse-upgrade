import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('co-own truth rules', () => {
  it('tradeHub has empty MOCK_CO_OWN_ASSETS', () => {
    const src = readSrc('data/tradeHub.ts');
    expect(src).toMatch(/export const MOCK_CO_OWN_ASSETS: CoOwnAsset\[\] = \[\];/);
  });

  it('marketApi exports fetchCoOwnHoldings', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toContain('export async function fetchCoOwnHoldings');
  });

  it('marketApi exports createCoOwnAsset', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toContain('export async function createCoOwnAsset');
  });

  it('SyndicateScreen fetches real holdings from backend', () => {
    const src = readSrc('screens/SyndicateScreen.tsx');
    expect(src).toContain('fetchCoOwnHoldings');
    expect(src).not.toContain('coOwnRuntime');
  });

  it('SyndicateHubScreen fetches real assets from backend', () => {
    const src = readSrc('screens/SyndicateHubScreen.tsx');
    expect(src).toContain('listCoOwnAssets');
    expect(src).not.toContain('customCoOwns');
  });

  it('CreateSyndicateScreen calls real backend API', () => {
    const src = readSrc('screens/CreateSyndicateScreen.tsx');
    expect(src).toContain('createCoOwnAsset');
    expect(src).not.toContain('addCoOwn');
  });

  it('AssetDetailScreen does not contain fake synthetic holder handles', () => {
    const src = readSrc('screens/AssetDetailScreen.tsx');
    expect(src).not.toContain('@holder1');
    expect(src).not.toContain('@holder2');
    expect(src).not.toContain('@holder3');
    expect(src).not.toContain('fallbackHandles');
    expect(src).not.toContain('syntheticOwners');
  });

  it('SyndicateOrderHistoryScreen does not import mock order history', () => {
    const src = readSrc('screens/SyndicateOrderHistoryScreen.tsx');
    expect(src).not.toContain('getOrderHistoryForAsset');
  });

  it('CoOwnAssetCard does not use picsum fallback images', () => {
    const src = readSrc('components/trade/CoOwnAssetCard.tsx');
    expect(src).not.toContain('picsum.photos');
  });
});