/**
 * Support Domain Contracts — Thryftverse Support / Help / Resolution
 *
 * Canonical typed contracts for the support domain: conversations, cases,
 * messages, knowledge base, action proposals, handoffs, and feedback.
 * These mirror the backend support contracts so the client never invents
 * shapes. The server is the source of truth; the client renders what it
 * receives.
 */

export type SupportContextKind =
  | 'general'
  | 'order'
  | 'listing'
  | 'payout'
  | 'report'
  | 'auction'
  | 'coown_asset'
  | 'catalog_import'
  | 'media_job';

export interface SupportEntryContext {
  kind: SupportContextKind;
  orderId?: string;
  listingId?: string;
  payoutId?: string;
  reportId?: string;
  auctionId?: string;
  assetId?: string;
  importJobId?: string;
  mediaJobId?: string;
}

export type ConversationOwnershipState =
  | 'ai_active'
  | 'human_queued'
  | 'human_active'
  | 'awaiting_customer'
  | 'resolved'
  | 'closed';

export type CaseOperationalState =
  | 'new'
  | 'triaged'
  | 'awaiting_customer'
  | 'queued'
  | 'in_review'
  | 'awaiting_external'
  | 'resolved'
  | 'closed';

export type CaseResolutionDisposition =
  | 'information_provided'
  | 'customer_withdrew'
  | 'seller_resolved'
  | 'refund_approved'
  | 'refund_denied'
  | 'return_approved'
  | 'not_eligible'
  | 'no_violation'
  | 'violation_actioned'
  | 'duplicate'
  | 'merged'
  | 'external_dispute'
  | 'unable_to_resolve';

export type MessageAuthorRole = 'customer' | 'agent_ai' | 'agent_human' | 'system';

export type ActionProposalState =
  | 'proposed'
  | 'confirmed'
  | 'rejected'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'unknown_outcome';

export interface SupportConversation {
  id: string;
  userId: string;
  contextKind: SupportContextKind;
  contextId: string | null;
  ownershipState: ConversationOwnershipState;
  title: string | null;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageCitation {
  articleId?: string;
  articleVersionId?: string;
  articleTitle?: string;
  sectionAnchor?: string;
  effectiveDate?: string;
  jurisdiction?: string;
  audience?: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorRole: MessageAuthorRole;
  body: string;
  citations: SupportMessageCitation[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SupportCase {
  id: string;
  conversationId: string | null;
  userId: string;
  issueType: string;
  requestedOutcome: string | null;
  operationalState: CaseOperationalState;
  resolutionDisposition: CaseResolutionDisposition | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  riskFlags: string[];
  assignedTeam: string | null;
  assignedOperatorId: string | null;
  policyVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportCaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  actorId: string | null;
  actorRole: string;
  payload: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
}

export interface SupportKnowledgeSearchResult {
  articleId: string;
  articleVersionId: string;
  title: string;
  snippet: string;
  sectionAnchor: string | null;
  effectiveDate: string;
  jurisdiction: string | null;
  audience: string;
  rank: number;
}

export interface SupportArticle {
  id: string;
  slug: string;
  productArea: string;
  ownerTeam: string;
  audience: string;
  defaultLocale: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportArticleVersion {
  id: string;
  articleId: string;
  version: number;
  title: string;
  bodyMarkdown: string;
  jurisdiction: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  checksum: string;
  createdAt: string;
}

export interface SupportActionProposal {
  id: string;
  conversationId: string;
  caseId: string | null;
  runId: string | null;
  toolName: string;
  canonicalArguments: Record<string, unknown>;
  argumentsHash: string;
  targetType: string;
  targetId: string;
  consequenceSummary: string;
  policyDecisionId: string | null;
  resourceVersion: string;
  expiresAt: string;
  state: ActionProposalState;
  createdAt: string;
  updatedAt: string;
}

export interface SupportHandoff {
  id: string;
  conversationId: string;
  caseId: string | null;
  reason: string;
  triggerKind: string;
  queueTeam: string | null;
  createdAt: string;
}

export interface SupportFeedback {
  id: string;
  conversationId: string;
  messageId: string | null;
  userId: string;
  rating: 'helpful' | 'unhelpful';
  reason: string | null;
  createdAt: string;
}

/**
 * Build a `SupportEntryContext` from common context params. The first
 * available identifier wins, in priority order. When none are supplied the
 * context is `general`.
 */
export function buildSupportEntryContext(params: {
  orderId?: string;
  listingId?: string;
  payoutId?: string;
  reportId?: string;
  auctionId?: string;
  assetId?: string;
  importJobId?: string;
  mediaJobId?: string;
}): SupportEntryContext {
  if (params.orderId) return { kind: 'order', orderId: params.orderId };
  if (params.listingId) return { kind: 'listing', listingId: params.listingId };
  if (params.payoutId) return { kind: 'payout', payoutId: params.payoutId };
  if (params.reportId) return { kind: 'report', reportId: params.reportId };
  if (params.auctionId) return { kind: 'auction', auctionId: params.auctionId };
  if (params.assetId) return { kind: 'coown_asset', assetId: params.assetId };
  if (params.importJobId) return { kind: 'catalog_import', importJobId: params.importJobId };
  if (params.mediaJobId) return { kind: 'media_job', mediaJobId: params.mediaJobId };
  return { kind: 'general' };
}
