import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');
const NAV = resolve(__dirname, '../navigation');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('UI-18 reference-perfect product UX', () => {
  // ── 1. At least 8 screens/flows have real UI/UX source changes ──
  it('CollectionDetailScreen has share action and edit navigation', () => {
    const src = read(resolve(SCREENS, 'CollectionDetailScreen.tsx'));
    expect(src).toContain('ShareSheet');
    expect(src).toContain('EditCollection');
    expect(src).toContain('settings-outline');
    expect(src).toContain('share-outline');
  });

  it('ItemDetailScreen has trust badge', () => {
    const src = read(resolve(SCREENS, 'ItemDetailScreen.tsx'));
    expect(src).toContain('Thryft Buyer Protection');
    expect(src).toContain('trustBadge');
    expect(src).toContain('shield-checkmark');
  });

  it('ItemDetailScreen has upgraded empty state with FlagshipEmptyGraphic', () => {
    const src = read(resolve(SCREENS, 'ItemDetailScreen.tsx'));
    expect(src).toContain('FlagshipEmptyGraphic');
    expect(src).toContain('variant="box"');
  });

  it('OrderDetailScreen has tappable support card', () => {
    const src = read(resolve(SCREENS, 'OrderDetailScreen.tsx'));
    expect(src).toContain('SupportTicketDetail');
    expect(src).toContain('Open support request details');
  });

  it('InboxScreen has improved request banner', () => {
    const src = read(resolve(SCREENS, 'InboxScreen.tsx'));
    expect(src).toContain('requestsIconWrap');
    expect(src).toContain('mail-unread-outline');
    expect(src).toContain('requestsBannerSub');
  });

  it('OrderSupportScreen has visual success state', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('successCard');
    expect(src).toContain('Request received');
  });

  it('ChatMediaPreviewScreen has video support and error handling', () => {
    const src = read(resolve(SCREENS, 'ChatMediaPreviewScreen.tsx'));
    expect(src).toContain('Video');
    expect(src).toContain('Media unavailable');
  });

  it('CreateCollectionScreen has backend submit with error handling', () => {
    const src = read(resolve(SCREENS, 'CreateCollectionScreen.tsx'));
    expect(src).toContain('createCollectionOnApi');
    expect(src).toContain('Unable to create collection');
  });

  // ── 2. At least 2 new subpages/modals/routes are registered and reachable ──
  it('EditCollectionScreen is registered in navigation', () => {
    const types = read(resolve(NAV, 'types.ts'));
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(types).toContain('EditCollection:');
    expect(nav).toContain("name=\"EditCollection\"");
    expect(nav).toContain('EditCollectionScreen');
  });

  it('SupportTicketDetailScreen is registered in navigation', () => {
    const types = read(resolve(NAV, 'types.ts'));
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(types).toContain('SupportTicketDetail:');
    expect(nav).toContain("name=\"SupportTicketDetail\"");
    expect(nav).toContain('SupportTicketDetailScreen');
  });

  // ── 3. New screens use premium visual primitives ──
  it('EditCollectionScreen uses ScreenHeader, AppInput, AppButton', () => {
    const src = read(resolve(SCREENS, 'EditCollectionScreen.tsx'));
    expect(src).toContain('ScreenHeader');
    expect(src).toContain('AppInput');
    expect(src).toContain('AppButton');
    expect(src).toContain('FadeInDown');
  });

  it('SupportTicketDetailScreen uses PremiumStatusPill, ScreenHeader, FadeInDown', () => {
    const src = read(resolve(SCREENS, 'SupportTicketDetailScreen.tsx'));
    expect(src).toContain('PremiumStatusPill');
    expect(src).toContain('ScreenHeader');
    expect(src).toContain('FadeInDown');
    expect(src).toContain('AppButton');
  });

  // ── 4. No fake data or fake success introduced ──
  it('no fake user data in new screens', () => {
    const screens = [
      'EditCollectionScreen.tsx',
      'SupportTicketDetailScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('user@example.com');
      expect(src).not.toContain('John Doe');
      expect(src).not.toContain('picsum.photos');
      expect(src).not.toContain('unsplash.com');
    }
  });

  // ── 5. No gold/yellow/glass regressions ──
  it('no gold or yellow color regressions in new screens', () => {
    const screens = [
      'EditCollectionScreen.tsx',
      'SupportTicketDetailScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('#FFD700');
      expect(src).not.toContain('gold');
      expect(src).not.toContain('yellow');
    }
  });

  // ── 6. BACKEND-17 APIs remain intact ──
  it('supportApi and collectionsApi imports remain in store', () => {
    const src = read(resolve(__dirname, '../store/useStore.ts'));
    expect(src).toContain('supportApi');
    expect(src).toContain('collectionsApi');
  });
});