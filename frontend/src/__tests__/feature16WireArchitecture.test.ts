import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../');
const SCREENS = resolve(SRC, 'screens');
const STORE = resolve(SRC, 'store');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('FEATURE-16 wire architecture into real product flows', () => {
  // ── 1. Support tickets are real store state ──
  it('useStore has SupportTicket type and real actions', () => {
    const src = read(resolve(STORE, 'useStore.ts'));
    expect(src).toContain('interface SupportTicket');
    expect(src).toContain('supportTickets: SupportTicket[]');
    expect(src).toContain('createSupportTicket:');
    expect(src).toContain('updateSupportTicketStatus:');
    expect(src).toContain("status: 'open' | 'resolved' | 'closed'");
  });

  it('support tickets are persisted in store partialize', () => {
    const src = read(resolve(STORE, 'useStore.ts'));
    expect(src).toContain('supportTickets: state.supportTickets');
  });

  // ── 2. OrderSupportScreen uses real store, not fake setTimeout ──
  it('OrderSupportScreen calls real createSupportTicket store action', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('createSupportTicket');
    expect(src).not.toContain('setTimeout(() => {');
    expect(src).not.toContain('// In a real app, this would POST');
    expect(src).toContain('isSubmitted');
    expect(src).toContain('submittedTicketId');
  });

  it('OrderSupportScreen shows success state after real store action', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('Request received');
    expect(src).toContain('successCard');
    expect(src).toContain('isSubmitted ? (');
  });

  // ── 3. OrderDetailScreen shows support ticket status ──
  it('OrderDetailScreen reads support tickets from store', () => {
    const src = read(resolve(SCREENS, 'OrderDetailScreen.tsx'));
    expect(src).toContain('getSupportTicketsForOrder');
    expect(src).toContain('supportTickets');
    expect(src).toContain('openTicket');
  });

  it('OrderDetailScreen renders support status card when ticket exists', () => {
    const src = read(resolve(SCREENS, 'OrderDetailScreen.tsx'));
    expect(src).toContain('Open support request');
    expect(src).toContain('supportCard');
  });

  // ── 4. ChatMediaPreview production hardening ──
  it('ChatMediaPreview handles missing URI', () => {
    const src = read(resolve(SCREENS, 'ChatMediaPreviewScreen.tsx'));
    expect(src).toContain('hasUri');
    expect(src).toContain('Media unavailable');
  });

  it('ChatMediaPreview uses real Video component for video', () => {
    const src = read(resolve(SCREENS, 'ChatMediaPreviewScreen.tsx'));
    expect(src).toContain("import { Video, ResizeMode } from '../components/compat/Video';");
    expect(src).toContain('<Video');
    expect(src).toContain('ResizeMode.CONTAIN');
    expect(src).not.toContain('videoPlaceholder');
    expect(src).not.toContain("name=\"play-circle\"");
  });

  // ── 5. ConversationInfo actions are real store-driven ──
  it('ConversationInfoScreen uses real store actions', () => {
    const src = read(resolve(SCREENS, 'ConversationInfoScreen.tsx'));
    expect(src).toContain('deleteConversation');
    expect(src).toContain('archiveConversation');
    expect(src).toContain('toggleMutedConversation');
    expect(src).toContain('toggleBlockedUser');
    expect(src).toContain('Alert.alert');
  });

  // ── 6. MessageRequests are real store-driven ──
  it('MessageRequestsScreen uses real store state and actions', () => {
    const src = read(resolve(SCREENS, 'MessageRequestsScreen.tsx'));
    expect(src).toContain('messageRequests');
    expect(src).toContain('acceptMessageRequest');
    expect(src).toContain('declineMessageRequest');
    expect(src).toContain('Alert.alert');
  });

  // ── 7. No fake data / placeholders ──
  it('no fake user names or emails in new screens', () => {
    const screens = [
      'ConversationInfoScreen.tsx',
      'MessageRequestsScreen.tsx',
      'CreateCollectionScreen.tsx',
      'OrderSupportScreen.tsx',
      'ChatMediaPreviewScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('user@example.com');
      expect(src).not.toContain('John Doe');
      expect(src).not.toContain('+44 7700');
      expect(src).not.toContain('picsum.photos');
      expect(src).not.toContain('unsplash.com');
    }
  });
});
