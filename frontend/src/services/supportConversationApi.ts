import { fetchJson } from '../lib/apiClient';
import type {
  SupportConversation,
  SupportMessage,
  SupportCase,
  SupportCaseEvent,
  SupportKnowledgeSearchResult,
  SupportArticle,
  SupportArticleVersion,
  SupportActionProposal,
  SupportHandoff,
  SupportFeedback,
  SupportEntryContext,
  SupportContextKind,
} from '../contracts/support';

// ============================================================================
// RESPONSE SHAPES
// ============================================================================

interface SupportBootstrapResponse {
  ok: true;
  context: Record<string, unknown> | null;
  recentConversations: SupportConversation[];
  recentCases: SupportCase[];
}

interface CreateSupportConversationResponse {
  ok: true;
  conversation: SupportConversation;
}

interface GetSupportConversationResponse {
  ok: true;
  conversation: SupportConversation;
}

interface ListSupportConversationsResponse {
  ok: true;
  items: SupportConversation[];
  nextCursor: string | null;
}

interface ListSupportMessagesResponse {
  ok: true;
  items: SupportMessage[];
  nextCursor: string | null;
}

interface SendSupportMessageResponse {
  ok: true;
  message: SupportMessage;
}

interface RequestSupportHandoffResponse {
  ok: true;
  handoff: SupportHandoff;
}

interface ConfirmSupportResolutionResponse {
  ok: true;
}

interface SubmitSupportFeedbackResponse {
  ok: true;
  feedback: SupportFeedback;
}

interface ListSupportCasesResponse {
  ok: true;
  items: SupportCase[];
  nextCursor: string | null;
}

interface GetSupportCaseResponse {
  ok: true;
  case: SupportCase;
  events: SupportCaseEvent[];
}

interface SendSupportCaseMessageResponse {
  ok: true;
  event: SupportCaseEvent;
}

interface AppealSupportCaseResponse {
  ok: true;
  event: SupportCaseEvent;
}

interface GetSupportActionResponse {
  ok: true;
  action: SupportActionProposal;
}

interface ConfirmSupportActionResponse {
  ok: true;
}

interface RejectSupportActionResponse {
  ok: true;
}

interface SearchSupportKnowledgeResponse {
  ok: true;
  results: SupportKnowledgeSearchResult[];
}

interface GetSupportArticleResponse {
  ok: true;
  article: SupportArticle;
  version: SupportArticleVersion;
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

export async function getSupportBootstrap(
  contextType?: SupportContextKind,
  contextId?: string
): Promise<{
  context: Record<string, unknown> | null;
  recentConversations: SupportConversation[];
  recentCases: SupportCase[];
}> {
  const params: string[] = [];
  if (contextType) params.push(`contextType=${encodeURIComponent(contextType)}`);
  if (contextId) params.push(`contextId=${encodeURIComponent(contextId)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const res = await fetchJson<SupportBootstrapResponse>(`/support/bootstrap${query}`);
  return {
    context: res.context,
    recentConversations: res.recentConversations,
    recentCases: res.recentCases,
  };
}

// ============================================================================
// CONVERSATIONS
// ============================================================================

export async function createSupportConversation(
  context: SupportEntryContext,
  locale?: string
): Promise<SupportConversation> {
  const res = await fetchJson<CreateSupportConversationResponse>('/support/conversations', {
    method: 'POST',
    body: JSON.stringify({ context, locale }),
  });
  return res.conversation;
}

export async function getSupportConversation(id: string): Promise<SupportConversation> {
  const res = await fetchJson<GetSupportConversationResponse>(
    `/support/conversations/${encodeURIComponent(id)}`
  );
  return res.conversation;
}

export async function listSupportConversations(
  limit?: number,
  cursor?: string | null
): Promise<{ items: SupportConversation[]; nextCursor: string | null }> {
  const params: string[] = [];
  if (limit !== undefined) params.push(`limit=${limit}`);
  if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const res = await fetchJson<ListSupportConversationsResponse>(`/support/conversations${query}`);
  return { items: res.items, nextCursor: res.nextCursor };
}

export async function listSupportMessages(
  conversationId: string,
  limit?: number,
  cursor?: string | null
): Promise<{ items: SupportMessage[]; nextCursor: string | null }> {
  const params: string[] = [];
  if (limit !== undefined) params.push(`limit=${limit}`);
  if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const res = await fetchJson<ListSupportMessagesResponse>(
    `/support/conversations/${encodeURIComponent(conversationId)}/messages${query}`
  );
  return { items: res.items, nextCursor: res.nextCursor };
}

export async function sendSupportMessage(
  conversationId: string,
  body: string,
  attachments?: string[]
): Promise<SupportMessage> {
  const res = await fetchJson<SendSupportMessageResponse>(
    `/support/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    }
  );
  return res.message;
}

export async function requestSupportHandoff(
  conversationId: string,
  reason?: string
): Promise<SupportHandoff> {
  const res = await fetchJson<RequestSupportHandoffResponse>(
    `/support/conversations/${encodeURIComponent(conversationId)}/handoff`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
  return res.handoff;
}

export async function confirmSupportResolution(
  conversationId: string,
  resolved: boolean
): Promise<void> {
  await fetchJson<ConfirmSupportResolutionResponse>(
    `/support/conversations/${encodeURIComponent(conversationId)}/resolution`,
    {
      method: 'POST',
      body: JSON.stringify({ resolved }),
    }
  );
}

export async function submitSupportFeedback(
  conversationId: string,
  rating: 'helpful' | 'unhelpful',
  reason?: string,
  messageId?: string
): Promise<SupportFeedback> {
  const res = await fetchJson<SubmitSupportFeedbackResponse>(
    `/support/conversations/${encodeURIComponent(conversationId)}/feedback`,
    {
      method: 'POST',
      body: JSON.stringify({ rating, reason, messageId }),
    }
  );
  return res.feedback;
}

// ============================================================================
// CASES
// ============================================================================

export async function listSupportCases(
  limit?: number,
  cursor?: string | null
): Promise<{ items: SupportCase[]; nextCursor: string | null }> {
  const params: string[] = [];
  if (limit !== undefined) params.push(`limit=${limit}`);
  if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const res = await fetchJson<ListSupportCasesResponse>(`/support/cases${query}`);
  return { items: res.items, nextCursor: res.nextCursor };
}

export async function getSupportCase(
  id: string
): Promise<{ case: SupportCase; events: SupportCaseEvent[] }> {
  const res = await fetchJson<GetSupportCaseResponse>(`/support/cases/${encodeURIComponent(id)}`);
  return { case: res.case, events: res.events };
}

export async function sendSupportCaseMessage(
  caseId: string,
  body: string
): Promise<SupportCaseEvent> {
  const res = await fetchJson<SendSupportCaseMessageResponse>(
    `/support/cases/${encodeURIComponent(caseId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    }
  );
  return res.event;
}

export async function appealSupportCase(
  caseId: string,
  reason: string
): Promise<SupportCaseEvent> {
  const res = await fetchJson<AppealSupportCaseResponse>(
    `/support/cases/${encodeURIComponent(caseId)}/appeal`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
  return res.event;
}

// ============================================================================
// ACTIONS
// ============================================================================

export async function getSupportAction(id: string): Promise<SupportActionProposal> {
  const res = await fetchJson<GetSupportActionResponse>(`/support/actions/${encodeURIComponent(id)}`);
  return res.action;
}

export async function confirmSupportAction(id: string): Promise<void> {
  await fetchJson<ConfirmSupportActionResponse>(
    `/support/actions/${encodeURIComponent(id)}/confirm`,
    {
      method: 'POST',
    }
  );
}

export async function rejectSupportAction(id: string): Promise<void> {
  await fetchJson<RejectSupportActionResponse>(
    `/support/actions/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
    }
  );
}

// ============================================================================
// KNOWLEDGE BASE
// ============================================================================

export async function searchSupportKnowledge(
  query: string,
  limit?: number
): Promise<SupportKnowledgeSearchResult[]> {
  const params: string[] = [`q=${encodeURIComponent(query)}`];
  if (limit !== undefined) params.push(`limit=${limit}`);
  const res = await fetchJson<SearchSupportKnowledgeResponse>(
    `/support/knowledge/search?${params.join('&')}`
  );
  return res.results;
}

export async function getSupportArticle(
  slug: string
): Promise<{ article: SupportArticle; version: SupportArticleVersion }> {
  const res = await fetchJson<GetSupportArticleResponse>(
    `/support/knowledge/articles/${encodeURIComponent(slug)}`
  );
  return { article: res.article, version: res.version };
}
