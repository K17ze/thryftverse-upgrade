import type {
  SupportConversation,
  SupportMessage,
  SupportMessageCitation,
  MessageAuthorRole,
  ConversationOwnershipState,
  SupportContextKind } from '../../contracts/support';

// ─── Pending message (optimistic local state) ───────────────────────────────
export interface PendingMessage {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorRole: MessageAuthorRole;
  body: string;
  citations: SupportMessageCitation[];
  metadata: Record<string, unknown>;
  createdAt: string;
  status: 'sending' | 'failed';
}

export type DisplayMessage = SupportMessage | PendingMessage;

export function isPending(msg: DisplayMessage): msg is PendingMessage {
  return 'status' in msg;
}

// ─── FlashList item ──────────────────────────────────────────────────────────
export type ListItem =
  | { kind: 'loadMore' }
  | { kind: 'message'; message: DisplayMessage };

// ─── Context label mapping ───────────────────────────────────────────────────
export const CONTEXT_LABELS: Record<SupportContextKind, { label: string; icon: string }> = {
  general: { label: 'General enquiry', icon: 'help-circle-outline' },
  order: { label: 'Order', icon: 'bag-handle-outline' },
  listing: { label: 'Listing', icon: 'document-text-outline' },
  payout: { label: 'Payout', icon: 'card-outline' },
  report: { label: 'Report', icon: 'flag-outline' },
  auction: { label: 'Auction', icon: 'trophy-outline' },
  coown_asset: { label: 'Co-Own asset', icon: 'diamond-outline' },
  catalog_import: { label: 'Import', icon: 'download-outline' },
  media_job: { label: 'Media', icon: 'image-outline' } };

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function authorLabel(role: MessageAuthorRole): string {
  switch (role) {
    case 'customer': return 'You';
    case 'agent_ai': return 'AI assistant';
    case 'agent_human': return 'Support specialist';
    case 'system': return '';
  }
}

export function formatMessageTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatContextId(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}

// Header subtitle reflects who actually owns the conversation — never
// claims an AI assistant is answering after a human handoff or closure.
// 'awaiting_customer' is set by human operators awaiting a reply.
export function headerSubtitleFor(ownershipState: ConversationOwnershipState): string {
  return ownershipState === 'ai_active'
    ? 'AI assistant'
    : ownershipState === 'human_queued'
      ? 'Waiting for a specialist'
      : ownershipState === 'human_active' || ownershipState === 'awaiting_customer'
        ? 'Support specialist'
        : 'Resolved';
}

export function stateBannerTextFor(ownershipState: ConversationOwnershipState): string | null {
  const bannerText: Record<ConversationOwnershipState, string | null> = {
    ai_active: null,
    human_active: null,
    human_queued: 'A support specialist will continue here.',
    awaiting_customer: 'Waiting for your response.',
    resolved: null,
    closed: 'This conversation is closed.' };
  return bannerText[ownershipState];
}

export interface SupportContextBarModel {
  contextKind: SupportContextKind;
  contextId: string | null;
  hasContext: boolean;
  label: string;
  icon: string;
}

export function resolveSupportContext(
  conversation: SupportConversation | null,
  routeContextKind: SupportContextKind | undefined,
  routeContextId: string | undefined,
): SupportContextBarModel {
  const contextKind: SupportContextKind =
    conversation?.contextKind ?? routeContextKind ?? 'general';
  const contextId = conversation?.contextId ?? routeContextId ?? null;
  const hasContext = contextKind !== 'general' && contextId !== null;
  const config = CONTEXT_LABELS[contextKind];
  return {
    contextKind,
    contextId,
    hasContext,
    label: config.label,
    icon: config.icon };
}

export function buildListData(messages: DisplayMessage[], hasMore: boolean): ListItem[] {
  const items: ListItem[] = messages.map(m => ({ kind: 'message' as const, message: m }));
  if (hasMore) {
    items.unshift({ kind: 'loadMore' });
  }
  return items;
}

// ── Key extractor ──
export function listKeyExtractor(item: ListItem): string {
  if (item.kind === 'loadMore') return 'loadMore';
  return item.message.id;
}

// ── Item type (for FlashList recycling) ──
export function listItemType(item: ListItem): string {
  if (item.kind === 'loadMore') return 'loadMore';
  return item.message.authorRole;
}
