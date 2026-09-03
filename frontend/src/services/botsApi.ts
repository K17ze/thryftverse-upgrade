import { fetchJson } from '../lib/apiClient';
import type { ChatAgentConfig, ChatBot, ConversationBotDeployment } from '../domain';

interface ApiBotPayload {
  id: string;
  slug: string;
  name: string;
  description: string;
  commandHint: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  type: 'system' | 'custom';
  status: string;
  runtimeMode: string;
  isDraft: boolean;
  permissions: string[];
  icon: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  agentConfig?: ChatAgentConfig | null;
  runtimeReady?: boolean;
  runtimeReadinessReason?: string | null;
}

function mapApiBotToChatBot(item: ApiBotPayload): ChatBot {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    commandHint: item.commandHint,
    category: item.category,
    type: item.type,
    status: item.status as 'available' | 'local-only' | 'backend-required',
    runtimeMode: item.runtimeMode,
    isDraft: item.isDraft,
    permissions: item.permissions,
    icon: item.icon ?? undefined,
    ownerId: item.ownerId ?? undefined,
    agentConfig: item.agentConfig ?? undefined,
    runtimeReady: item.runtimeReady ?? item.runtimeMode !== 'ai',
    runtimeReadinessReason: item.runtimeReadinessReason ?? undefined,
  };
}

export async function fetchSystemBotsFromApi(): Promise<ChatBot[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiBotPayload[];
  }>('/bots/system');

  return payload.items.map(mapApiBotToChatBot);
}

export async function fetchCustomBotsFromApi(): Promise<ChatBot[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiBotPayload[];
  }>('/bots');

  return payload.items.map(mapApiBotToChatBot);
}

export async function fetchBotByIdFromApi(botId: string): Promise<ChatBot> {
  const payload = await fetchJson<{
    ok: true;
    item: ApiBotPayload;
  }>(`/bots/${encodeURIComponent(botId)}`);

  return mapApiBotToChatBot(payload.item);
}

export async function createCustomBotOnApi(input: {
  name: string;
  slug?: string;
  description: string;
  commandHint: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  permissions?: string[];
  icon?: string;
  isDraft?: boolean;
  agentConfig?: ChatAgentConfig;
}): Promise<{ id: string; slug: string; name: string; type: string; status: string; runtimeMode: string; isDraft: boolean }> {
  const payload = await fetchJson<{
    ok: true;
    id: string;
    slug: string;
    name: string;
    type: string;
    status: string;
    runtimeMode: string;
    isDraft: boolean;
  }>('/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return payload;
}

export async function updateCustomBotOnApi(
  botId: string,
  updates: Partial<{
    name: string;
    description: string;
    commandHint: string;
    category: string;
    permissions: string[];
    icon: string;
    isDraft: boolean;
    status: string;
    runtimeMode: string;
    agentConfig: ChatAgentConfig;
  }>
): Promise<void> {
  await fetchJson<{ ok: true }>(`/bots/${encodeURIComponent(botId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteCustomBotOnApi(botId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/bots/${encodeURIComponent(botId)}`, {
    method: 'DELETE',
  });
}

export async function fetchConversationDeploymentsFromApi(conversationId: string): Promise<ConversationBotDeployment[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ConversationBotDeployment[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/bots`);
  return payload.items;
}

export async function publishBotFromApi(botId: string, publishNotes?: string): Promise<{
  ok: true;
  botId: string;
  versionId: string;
  versionNumber: number;
  configChecksum: string;
  permissionsChecksum: string;
}> {
  return fetchJson(`/bots/${encodeURIComponent(botId)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishNotes }),
  });
}

export async function fetchBotVersionsFromApi(botId: string): Promise<Array<{
  id: string;
  versionNumber: number;
  publisherId: string;
  configChecksum: string;
  permissionsChecksum: string;
  publishNotes: string | null;
  createdAt: string;
}>> {
  const payload = await fetchJson<{
    ok: true;
    botId: string;
    items: Array<{
      id: string;
      versionNumber: number;
      publisherId: string;
      configChecksum: string;
      permissionsChecksum: string;
      publishNotes: string | null;
      createdAt: string;
    }>;
  }>(`/bots/${encodeURIComponent(botId)}/versions`);
  return payload.items;
}

export async function rollbackBotFromApi(botId: string, versionId: string): Promise<{
  ok: true;
  botId: string;
  versionId: string;
  versionNumber: number;
}> {
  return fetchJson(`/bots/${encodeURIComponent(botId)}/versions/${encodeURIComponent(versionId)}/rollback`, {
    method: 'POST',
  });
}

export async function validateBotFromApi(input: {
  name: string;
  description: string;
  commandHint: string;
  category: string;
  permissions: string[];
  isDraft: boolean;
  agentConfig?: ChatAgentConfig;
}): Promise<{
  ok: true;
  valid: boolean;
  validationError: string | null;
  checks: Array<{ key: string; passed: boolean }>;
  runtimeReady: boolean;
  runtimeReadinessReason: string | null;
}> {
  return fetchJson('/bots/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Server-backed provider connections (Phase 3)
//
// The backend stores API keys encrypted server-side and returns only masked
// keys to the client. These functions mirror the /agent-connections endpoints.
// ---------------------------------------------------------------------------

export interface ProviderConnectionInfo {
  id: string;
  ownerId: string;
  provider: string;
  label: string;
  environment: string;
  maskedKey: string;
  baseUrl: string | null;
  healthStatus: 'unverified' | 'healthy' | 'degraded' | 'expired' | 'revoked' | 'failed';
  lastVerifiedAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  discoveredModels: Array<{
    providerModelId: string;
    displayName: string;
    deprecated?: boolean;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function createConnectionFromApi(input: {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  apiKey: string;
  label?: string;
  baseUrl?: string;
  environment?: string;
}): Promise<{ ok: true; connection: ProviderConnectionInfo }> {
  return fetchJson('/agent-connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function fetchConnectionsFromApi(): Promise<ProviderConnectionInfo[]> {
  const payload = await fetchJson<{ ok: true; items: ProviderConnectionInfo[] }>('/agent-connections');
  return payload.items;
}

export async function fetchConnectionCapabilitiesFromApi(connectionId: string): Promise<{
  ok: true;
  models: Array<{ providerModelId: string; displayName: string; deprecated?: boolean }>;
}> {
  return fetchJson(`/agent-connections/${encodeURIComponent(connectionId)}/capabilities`);
}

export async function deleteConnectionFromApi(connectionId: string): Promise<{
  ok: true;
  affectedAgents: string[];
}> {
  return fetchJson(`/agent-connections/${encodeURIComponent(connectionId)}`, {
    method: 'DELETE',
  });
}

export async function reverifyConnectionFromApi(connectionId: string): Promise<{
  ok: true;
  connection: ProviderConnectionInfo;
}> {
  return fetchJson(`/agent-connections/${encodeURIComponent(connectionId)}/reverify`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Durable agent runs (Phase 4)
//
// The backend records every agent execution as a durable run with status,
// token usage, and timing. These functions mirror the /agent-runs endpoints.
// ---------------------------------------------------------------------------

export interface AgentRunInfo {
  id: string;
  botId: string;
  conversationId: string;
  actorUserId: string;
  triggerType: string;
  triggerMessageId: string | null;
  status: 'queued' | 'running' | 'waiting_for_approval' | 'waiting_for_input' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'unknown_outcome';
  resultMessageId: string | null;
  errorMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function fetchAgentRunsFromApi(params?: {
  conversationId?: string;
  botId?: string;
  status?: string;
  limit?: number;
}): Promise<AgentRunInfo[]> {
  const searchParams = new URLSearchParams();
  if (params?.conversationId) searchParams.set('conversationId', params.conversationId);
  if (params?.botId) searchParams.set('botId', params.botId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  const payload = await fetchJson<{ ok: true; items: AgentRunInfo[] }>(
    qs ? `/agent-runs?${qs}` : '/agent-runs'
  );
  return payload.items;
}

export async function fetchAgentRunFromApi(runId: string): Promise<{
  ok: true;
  run: AgentRunInfo & {
    agentVersionId: string | null;
    resultText: string | null;
    metadata: Record<string, unknown>;
  };
}> {
  return fetchJson(`/agent-runs/${encodeURIComponent(runId)}`);
}

export async function cancelAgentRunFromApi(runId: string): Promise<{
  ok: true;
  runId: string;
  status: string;
}> {
  return fetchJson(`/agent-runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Approval requests (Phase 5)
//
// When an agent proposes a consequential action (drafting a reply, making an
// offer, etc.) the server creates an approval request. The user must approve
// or reject it before the action executes. These functions mirror the
// /agent-approvals endpoints.
// ---------------------------------------------------------------------------

export interface ApprovalRequestInfo {
  id: string;
  runId: string;
  botId: string;
  conversationId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'superseded';
  expiresAt: string | null;
  createdAt: string;
}

export async function fetchPendingApprovalsFromApi(): Promise<ApprovalRequestInfo[]> {
  const payload = await fetchJson<{ ok: true; items: ApprovalRequestInfo[] }>('/agent-approvals');
  return payload.items;
}

export async function approveRequestFromApi(
  approvalId: string,
  editedArguments?: Record<string, unknown>
): Promise<{ ok: true; approvalId: string; status: string }> {
  return fetchJson(`/agent-approvals/${encodeURIComponent(approvalId)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editedArguments }),
  });
}

export async function rejectRequestFromApi(
  approvalId: string
): Promise<{ ok: true; approvalId: string; status: string }> {
  return fetchJson(`/agent-approvals/${encodeURIComponent(approvalId)}/reject`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Playground & run trace (Phase 6)
//
// The playground lets an owner test an agent with an ad-hoc message outside a
// conversation. The backend executes the agent synchronously and returns the
// response plus a durable runId that can be inspected via the trace endpoint.
// ---------------------------------------------------------------------------

export interface PlaygroundResult {
  ok: true;
  playground: true;
  runId: string;
  response: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  confidence: number | null;
}

export async function runPlaygroundFromApi(
  botId: string,
  message: string,
  conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<PlaygroundResult> {
  return fetchJson(`/bots/${encodeURIComponent(botId)}/playground`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationContext: conversationContext ?? [] }),
  });
}

export interface RunTraceStep {
  id: string;
  stepNumber: number;
  stepType: string;
  status: string;
  inputSummary: string | null;
  outputSummary: string | null;
  durationMs: number | null;
  tokensUsed: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RunTraceApproval {
  id: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export async function fetchRunTraceFromApi(runId: string): Promise<{
  ok: true;
  runId: string;
  steps: RunTraceStep[];
  approvals: RunTraceApproval[];
}> {
  return fetchJson(`/agent-runs/${encodeURIComponent(runId)}/trace`);
}
