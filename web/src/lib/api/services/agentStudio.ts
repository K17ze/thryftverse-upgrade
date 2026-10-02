/**
 * Agent Studio service — the verified server-side contract behind
 * /agents/studio. Mirrors frontend/src/services/botsApi.ts and
 * backend/api/src/routes/bots.ts 1:1:
 *
 *  - GET    /agent-connections            → the caller's provider
 *    connections. API keys are stored encrypted server-side and only the
 *    masked form ever crosses the wire.
 *  - POST   /agent-connections            → verifies the key against the
 *    provider (GET /models or equivalent) BEFORE storing — healthStatus
 *    is the provider's real answer, never assumed.
 *  - POST   /agent-connections/:id/reverify → a fresh provider round-trip;
 *    returns the updated connection row.
 *  - DELETE /agent-connections/:id        → deactivates the row and unbinds
 *    bots; returns the affected agent ids.
 *  - GET    /agent-approvals              → pending, unexpired approval
 *    requests only (the server lazily expires rows past their TTL).
 *  - POST   /agent-approvals/:id/approve  → single-use decision; resumes
 *    the parked run. APPROVAL_TERMINAL / APPROVAL_EXPIRED rejections
 *    propagate — a decided row must never read as decidable.
 *  - POST   /agent-approvals/:id/reject   → single-use decision.
 *
 * Every endpoint is auth-scoped — a guest 401 propagates to the sign-in
 * wall, never an empty list.
 */

import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Provider connections
// ---------------------------------------------------------------------------

export type ConnectionHealth =
  | 'unverified'
  | 'healthy'
  | 'degraded'
  | 'expired'
  | 'revoked'
  | 'failed';

export interface AgentStudioConnection {
  id: string;
  ownerId: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom' | string;
  label: string;
  environment: string;
  maskedKey: string;
  baseUrl: string | null;
  healthStatus: ConnectionHealth | string;
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

export async function fetchAgentConnections(
  signal?: AbortSignal,
): Promise<AgentStudioConnection[]> {
  const payload = await fetchJson<{ ok: true; items: AgentStudioConnection[] }>(
    '/agent-connections',
    undefined,
    { signal },
  );
  return payload.items;
}

export async function createAgentConnection(input: {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  apiKey: string;
  label?: string;
  baseUrl?: string;
  environment?: 'production' | 'staging' | 'development';
}): Promise<AgentStudioConnection> {
  const payload = await fetchJson<{ ok: true; connection: AgentStudioConnection }>(
    '/agent-connections',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return payload.connection;
}

export async function reverifyAgentConnection(
  connectionId: string,
): Promise<AgentStudioConnection> {
  const payload = await fetchJson<{ ok: true; connection: AgentStudioConnection }>(
    `/agent-connections/${encodeURIComponent(connectionId)}/reverify`,
    { method: 'POST' },
  );
  return payload.connection;
}

export async function deleteAgentConnection(connectionId: string): Promise<{
  affectedAgents: string[];
}> {
  const payload = await fetchJson<{ ok: true; affectedAgents: string[] }>(
    `/agent-connections/${encodeURIComponent(connectionId)}`,
    { method: 'DELETE' },
  );
  return { affectedAgents: payload.affectedAgents };
}

// ---------------------------------------------------------------------------
// Approval requests
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'superseded';

export interface AgentStudioApproval {
  id: string;
  runId: string;
  botId: string;
  conversationId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  status: ApprovalStatus | string;
  expiresAt: string | null;
  createdAt: string;
}

export async function fetchAgentApprovals(
  signal?: AbortSignal,
): Promise<AgentStudioApproval[]> {
  const payload = await fetchJson<{ ok: true; items: AgentStudioApproval[] }>(
    '/agent-approvals',
    undefined,
    { signal },
  );
  return payload.items;
}

export async function approveAgentRequest(
  approvalId: string,
  editedArguments?: Record<string, unknown>,
): Promise<{ approvalId: string; status: string; resumed: boolean }> {
  const payload = await fetchJson<{
    ok: true;
    approvalId: string;
    status: string;
    resumed?: boolean;
  }>(`/agent-approvals/${encodeURIComponent(approvalId)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editedArguments ? { editedArguments } : {}),
  });
  return {
    approvalId: payload.approvalId,
    status: payload.status,
    resumed: payload.resumed === true,
  };
}

export async function rejectAgentRequest(
  approvalId: string,
): Promise<{ approvalId: string; status: string }> {
  const payload = await fetchJson<{
    ok: true;
    approvalId: string;
    status: string;
  }>(`/agent-approvals/${encodeURIComponent(approvalId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return { approvalId: payload.approvalId, status: payload.status };
}
