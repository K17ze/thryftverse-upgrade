import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../');
const SCREENS = resolve(SRC, 'screens');
const NAV = resolve(SRC, 'navigation');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('VISUAL-15 UI Architecture + Feature Depth', () => {
  // ── 1. New routes registered in navigation types ──
  it('navigation types include VISUAL-15 routes', () => {
    const src = read(resolve(NAV, 'types.ts'));
    expect(src).toContain('ConversationInfo:');
    expect(src).toContain('MessageRequests:');
    expect(src).toContain('CreateCollection:');
    expect(src).toContain('OrderSupport:');
    expect(src).toContain('ChatMediaPreview:');
  });

  it('AppNavigator registers VISUAL-15 screens', () => {
    const src = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(src).toContain('ConversationInfo');
    expect(src).toContain('MessageRequests');
    expect(src).toContain('CreateCollection');
    expect(src).toContain('OrderSupport');
    expect(src).toContain('ChatMediaPreview');
  });

  // ── 2. New subpages exist and are production-quality ──
  it('ConversationInfoScreen exists with user profile actions', () => {
    const src = read(resolve(SCREENS, 'ConversationInfoScreen.tsx'));
    expect(src).toContain('ConversationInfo');
    expect(src).toContain('View profile');
    expect(src).toContain('Block user');
    expect(src).toContain('Mute notifications');
    expect(src).toContain('Archive chat');
    expect(src).toContain('Delete chat');
    expect(src).toContain('FadeInDown');
  });

  it('MessageRequestsScreen exists with accept/decline actions', () => {
    const src = read(resolve(SCREENS, 'MessageRequestsScreen.tsx'));
    expect(src).toContain('Message Requests');
    expect(src).toContain('Accept');
    expect(src).toContain('Decline');
    expect(src).toContain('FadeInDown');
  });

  it('CreateCollectionScreen exists with name, description, privacy', () => {
    const src = read(resolve(SCREENS, 'CreateCollectionScreen.tsx'));
    expect(src).toContain('New Collection');
    expect(src).toContain('Collection name');
    expect(src).toContain('Describe your collection');
    expect(src).toContain('Private collection');
    expect(src).toContain('FadeInDown');
  });

  it('OrderSupportScreen exists with topic selection and details', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('Order Support');
    expect(src).toContain('SELECT TOPIC');
    expect(src).toContain('Item not received');
    expect(src).toContain('Not as described');
    expect(src).toContain('Submit Request');
    expect(src).toContain('FadeInDown');
  });

  it('ChatMediaPreviewScreen exists for fullscreen media', () => {
    const src = read(resolve(SCREENS, 'ChatMediaPreviewScreen.tsx'));
    expect(src).toContain('ChatMediaPreview');
    expect(src).toContain('mediaUri');
    expect(src).toContain('close');
  });

  // ── 3. Existing screens structurally improved ──
  it('ChatScreen wires ConversationInfo for DMs', () => {
    const src = read(resolve(SCREENS, 'ChatScreen.tsx'));
    expect(src).toContain('ConversationInfo');
    expect(src).toContain('ChatMediaPreview');
  });

  it('InboxScreen wires MessageRequestsScreen with banner', () => {
    const src = read(resolve(SCREENS, 'InboxScreen.tsx'));
    expect(src).toContain('MessageRequests');
    expect(src).toContain('requestsBanner');
  });

  it('ClosetScreen wires CreateCollectionScreen', () => {
    const src = read(resolve(SCREENS, 'ClosetScreen.tsx'));
    expect(src).toContain('CreateCollection');
    expect(src).not.toContain("createCollection('New Collection')");
  });

  it('OrderDetailScreen wires OrderSupportScreen', () => {
    const src = read(resolve(SCREENS, 'OrderDetailScreen.tsx'));
    expect(src).toContain('OrderSupport');
  });

  // ── 4. Store updated for collection privacy ──
  it('store supports collection isPrivate field', () => {
    const src = read(resolve(SRC, 'store/useStore.ts'));
    expect(src).toContain('isPrivate?: boolean');
    expect(src).toContain('createCollection: (name: string, description?: string, isPrivate?: boolean)');
  });

  // ── 5. Product truth — no fake data ──
  it('no fake users/messages in new screens', () => {
    const screens = [
      'ConversationInfoScreen.tsx',
      'MessageRequestsScreen.tsx',
      'CreateCollectionScreen.tsx',
      'OrderSupportScreen.tsx',
      'ChatMediaPreviewScreen.tsx',
    ];
    for (const s of screens) {
      const src = read(resolve(SCREENS, s));
      expect(src).not.toContain('images.unsplash.com');
      expect(src).not.toContain('picsum.photos');
      expect(src).not.toContain('fake');
      expect(src).not.toContain('mock');
    }
  });

  it('OrderSupportScreen shows honest support timeline', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('24 hours');
    expect(src).not.toContain('instant');
    expect(src).not.toContain('immediately');
  });

  // ── 6. Premium components used in new screens ──
  it('new screens use ScreenHeader', () => {
    const screens = [
      'ConversationInfoScreen.tsx',
      'MessageRequestsScreen.tsx',
      'CreateCollectionScreen.tsx',
      'OrderSupportScreen.tsx',
    ];
    for (const s of screens) {
      const src = read(resolve(SCREENS, s));
      expect(src).toContain('ScreenHeader');
    }
  });

  it('new screens use AnimatedPressable with haptics', () => {
    const screens = [
      'ConversationInfoScreen.tsx',
      'MessageRequestsScreen.tsx',
      'CreateCollectionScreen.tsx',
      'OrderSupportScreen.tsx',
      'ChatMediaPreviewScreen.tsx',
    ];
    for (const s of screens) {
      const src = read(resolve(SCREENS, s));
      expect(src).toContain('hapticFeedback');
    }
  });

  // ── 7. No gold/yellow/glass regressions ──
  it('no hardcoded gold hex in new screens', () => {
    const screens = [
      'ConversationInfoScreen.tsx',
      'MessageRequestsScreen.tsx',
      'CreateCollectionScreen.tsx',
      'OrderSupportScreen.tsx',
      'ChatMediaPreviewScreen.tsx',
    ];
    for (const s of screens) {
      const src = read(resolve(SCREENS, s));
      expect(src).not.toContain('#F5A623');
      expect(src).not.toContain('#d7b98f');
      expect(src).not.toContain('#D4AF37');
      expect(src).not.toContain('GlassCard');
    }
  });

  // ── 8. No unused components ──
  it('all new screens are registered in AppNavigator', () => {
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(nav).toContain('ConversationInfoScreen');
    expect(nav).toContain('MessageRequestsScreen');
    expect(nav).toContain('CreateCollectionScreen');
    expect(nav).toContain('OrderSupportScreen');
    expect(nav).toContain('ChatMediaPreviewScreen');
  });
});
