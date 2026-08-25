// Shared TypeScript contracts for the support subsystem.
//
// These types are consumed by the support service modules and the HTTP/RPC
// routes that expose them. Row-level (snake_case) types live alongside each
// service; this file only exports the camelCase domain contracts.

// ── Entry context ──

export type SupportEntryContext =
  | { kind: 'general' }
  | { kind: 'order'; orderId: string }
  | { kind: 'listing'; listingId: string }
  | { kind: 'payout'; payoutId: string }
  | { kind: 'report'; reportId: string }
  | { kind: 'auction'; auctionId: string }
  | { kind: 'coown_asset'; assetId: string }
  | { kind: 'catalog_import'; importJobId: string }
  | { kind: 'media_job'; mediaJobId: string };

export const SUPPORT_CONTEXT_KINDS = [
  'general',
  'order',
  'listing',
  'payout',
  'report',
  'auction',
  'coown_asset',
  'catalog_import',
  'media_job',
] as const;

// ── Enumerations ──

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

export type CaseEventActorRole =
  | 'customer'
  | 'agent_ai'
  | 'agent_human'
  | 'system'
  | 'operator';

export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';

export type HandoffTriggerKind =
  | 'user_request'
  | 'risk_rule'
  | 'procedure_failure'
  | 'clarification_exhausted'
  | 'negative_resolution'
  | 'integration_unavailable'
  | 'attachment_unprocessable'
  | 'manual';

export type FeedbackRating = 'helpful' | 'unhelpful';

export type ArticleState = 'draft' | 'published' | 'archived';

export type ArticleAudience = 'public' | 'seller' | 'buyer' | 'internal';

export type ActionProposalState =
  | 'proposed'
  | 'confirmed'
  | 'rejected'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'unknown_outcome';

export type ActionExecutionResultState = 'succeeded' | 'failed' | 'unknown_outcome';

// ── Domain records ──

export interface SupportConversation {
  id: string;
  userId: string;
  contextKind: SupportEntryContext['kind'];
  contextId: string | null;
  ownershipState: ConversationOwnershipState;
  title: string | null;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorRole: MessageAuthorRole;
  body: string;
  citations: unknown[];
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
  priority: CasePriority;
  riskFlags: unknown[];
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
  actorRole: CaseEventActorRole;
  payload: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
}

export interface SupportHandoff {
  id: string;
  conversationId: string;
  caseId: string | null;
  reason: string;
  triggerKind: HandoffTriggerKind;
  handoffBundle: Record<string, unknown>;
  queueTeam: string | null;
  createdAt: string;
}

export interface SupportFeedback {
  id: string;
  conversationId: string;
  messageId: string | null;
  userId: string;
  rating: FeedbackRating;
  reason: string | null;
  createdAt: string;
}

export interface SupportArticle {
  id: string;
  slug: string;
  productArea: string;
  ownerTeam: string;
  audience: ArticleAudience;
  defaultLocale: string;
  state: ArticleState;
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
  approvedBy: string | null;
  approvedAt: string | null;
  checksum: string;
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
  audience: ArticleAudience;
  rank: number;
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

// ── Context projection shapes ──

export interface SupportOrderParcelState {
  lastEventType: string | null;
  lastEventOccurredAt: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
}

export interface SupportOrderEligibility {
  code: string;
  nextActionAt: string | null;
  policyVersionId: string | null;
}

export interface ProjectedOrderContext {
  kind: 'order';
  id: string;
  status: string;
  totalGbp: string;
  buyerProtectionFeeGbp: string;
  deliveredAt: string | null;
  createdAt: string;
  role: 'buyer' | 'seller';
  parcel: SupportOrderParcelState;
  supportEligibility: SupportOrderEligibility;
}

export interface ProjectedListingContext {
  kind: 'listing';
  id: string;
  title: string;
  status: string;
  priceGbp: string;
  sellerId: string;
}

export interface ProjectedPayoutContext {
  kind: 'payout';
  id: string;
  status: string;
  amountGbp: string;
  createdAt: string;
}

export type ProjectedSupportContext =
  | ProjectedOrderContext
  | ProjectedListingContext
  | ProjectedPayoutContext
  | null;
