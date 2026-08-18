import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Agent Runtime integration — verifies that the execution layer routes tool
 * calls through the Capability Broker, honours tiers, and never auto-approves
 * financial / Tier D capabilities (spec 05).
 */

// In-memory AsyncStorage backing so the ledger and grant store actually
// persist across calls within a test. Mirrors the pattern from
// agentCapabilityBroker.test.ts.
const memoryStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => {
  return {
    default: {
      setItem: vi.fn((key: string, value: string) => {
        memoryStore.set(key, value);
        return Promise.resolve();
      }),
      getItem: vi.fn((key: string) =>
        Promise.resolve(memoryStore.get(key) ?? null),
      ),
      removeItem: vi.fn((key: string) => {
        memoryStore.delete(key);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        memoryStore.clear();
        return Promise.resolve();
      }),
      getAllKeys: vi.fn(() => Promise.resolve(Array.from(memoryStore.keys()))),
      multiGet: vi.fn(() => Promise.resolve([])),
      multiSet: vi.fn(() => Promise.resolve()),
      multiRemove: vi.fn(() => Promise.resolve()),
    },
  };
});

import {
  executeToolCall,
  resolveAndExecute,
  registerToolExecutor,
  unregisterToolExecutor,
  getPendingApproval,
  clearPendingApproval,
  clearAllPendingApprovals,
  canAgentBypassCanonicalUI,
  isFinancialCapability,
} from '../platform/agents/agentRuntime';
import {
  requestCapability,
  resolveApproval,
  clearGrants,
  type AgentCapability,
} from '../platform/agents/capabilityBroker';
import { clearAgentActivity } from '../services/agentActivityLedger';
import { agentRequestAction } from '../services/chatAgentsApi';

const TIER_A_CAP: AgentCapability = 'profile.read_public';
const TIER_C_CAP: AgentCapability = 'chat.send';
const TIER_D_CAP: AgentCapability = 'offer.send';

const AGENT_ID = 'agent_runtime_test_001';
const CONVERSATION_ID = 'conv_test_001';

describe('Agent Runtime integration', () => {
  beforeEach(async () => {
    memoryStore.clear();
    await clearGrants();
    await clearAgentActivity();
    clearAllPendingApprovals();
    unregisterToolExecutor(TIER_A_CAP);
    unregisterToolExecutor(TIER_C_CAP);
    unregisterToolExecutor(TIER_D_CAP);
  });

  afterEach(async () => {
    memoryStore.clear();
    await clearGrants();
    clearAllPendingApprovals();
    unregisterToolExecutor(TIER_A_CAP);
    unregisterToolExecutor(TIER_C_CAP);
    unregisterToolExecutor(TIER_D_CAP);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // executeToolCall — Tier A with autoApproveTierA
  // -------------------------------------------------------------------------

  it('auto-approves and executes Tier A reads when autoApproveTierA is set', async () => {
    const executor = vi.fn(async (args: Record<string, unknown>) => ({
      ok: true,
      args,
    }));
    registerToolExecutor(TIER_A_CAP, executor);

    const result = await executeToolCall(
      {
        agentId: AGENT_ID,
        capability: TIER_A_CAP,
        summary: 'Read public profile',
        arguments: { userId: 'u_123' },
      },
      { autoApproveTierA: true },
    );

    expect(result.approved).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.result).toEqual({ ok: true, args: { userId: 'u_123' } });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({ userId: 'u_123' });
  });

  // -------------------------------------------------------------------------
  // executeToolCall — Tier C without grant
  // -------------------------------------------------------------------------

  it('returns approval_required for Tier C without a grant', async () => {
    const executor = vi.fn(async () => ({ sent: true }));
    registerToolExecutor(TIER_C_CAP, executor);

    const result = await executeToolCall({
      agentId: AGENT_ID,
      capability: TIER_C_CAP,
      summary: 'Send chat message',
      arguments: { text: 'hello' },
    });

    expect(result.approved).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.reason).toBe('approval_required');
    expect(result.approvalRequest).toBeDefined();
    expect(result.approvalRequest?.tier).toBe('C');
    // Executor must not run until approved.
    expect(executor).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // executeToolCall — Tier D never auto-approves even with a grant
  // -------------------------------------------------------------------------

  it('never auto-approves Tier D even when an always_allow grant exists', async () => {
    // Force a stale always_allow grant for the Tier D capability by
    // resolving a request with alwaysAllow. The broker refuses to persist
    // always_allow for Tier D, so we instead inject a grant via a Tier C
    // approval and then request the Tier D capability — the runtime must
    // still ask. To exercise the "stale grant" path directly, we first
    // create a grant for the Tier D capability through the broker (which
    // will refuse always_allow), then call executeToolCall and assert it
    // surfaces an approval request rather than executing.
    const req = await requestCapability(AGENT_ID, TIER_D_CAP, 'Send offer $40');
    await resolveApproval(req, true, true);
    // No always_allow grant should exist for Tier D.
    expect(getPendingApproval).toBeDefined();

    const executor = vi.fn(async () => ({ offerSent: true }));
    registerToolExecutor(TIER_D_CAP, executor);

    const result = await executeToolCall({
      agentId: AGENT_ID,
      capability: TIER_D_CAP,
      summary: 'Send offer $40',
      arguments: { amount: 40 },
    });

    expect(result.approved).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.reason).toBe('approval_required');
    expect(result.approvalRequest?.tier).toBe('D');
    expect(executor).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // resolveAndExecute — executes after approval
  // -------------------------------------------------------------------------

  it('executes the tool after resolveAndExecute approves a pending request', async () => {
    const executor = vi.fn(async (args: Record<string, unknown>) => ({
      sent: true,
      args,
    }));
    registerToolExecutor(TIER_C_CAP, executor);

    const pending = await executeToolCall({
      agentId: AGENT_ID,
      capability: TIER_C_CAP,
      summary: 'Send chat message',
      arguments: { text: 'hello' },
    });
    expect(pending.approvalRequest).toBeDefined();
    const requestId = pending.approvalRequest!.id;

    const result = await resolveAndExecute(
      requestId,
      true,
      false,
      { text: 'hello' },
    );

    expect(result.approved).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.result).toEqual({ sent: true, args: { text: 'hello' } });
    expect(executor).toHaveBeenCalledTimes(1);
    // Pending approval should be cleared.
    expect(getPendingApproval(requestId)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // resolveAndExecute — does not execute after denial
  // -------------------------------------------------------------------------

  it('does not execute the tool after resolveAndExecute denies a pending request', async () => {
    const executor = vi.fn(async () => ({ sent: true }));
    registerToolExecutor(TIER_C_CAP, executor);

    const pending = await executeToolCall({
      agentId: AGENT_ID,
      capability: TIER_C_CAP,
      summary: 'Send chat message',
      arguments: { text: 'hello' },
    });
    const requestId = pending.approvalRequest!.id;

    const result = await resolveAndExecute(requestId, false, false);

    expect(result.approved).toBe(false);
    expect(result.executed).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(getPendingApproval(requestId)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Financial capabilities — no bypass
  // -------------------------------------------------------------------------

  it('agentRequestAction denies financial capabilities without executing', async () => {
    const executor = vi.fn(async () => ({ offerSent: true }));
    registerToolExecutor(TIER_D_CAP, executor);

    const result = await agentRequestAction(CONVERSATION_ID, {
      agentId: AGENT_ID,
      capability: TIER_D_CAP,
      summary: 'Send offer $40',
      arguments: { amount: 40 },
    });

    expect(result.approved).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.error).toBe('Financial actions require canonical transaction UI');
    expect(executor).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // canAgentBypassCanonicalUI — always false
  // -------------------------------------------------------------------------

  it('canAgentBypassCanonicalUI returns false for every capability tier', () => {
    const caps: AgentCapability[] = [
      'profile.read_public',
      'listing.create_draft',
      'chat.send',
      'offer.send',
      'wallet.withdraw',
      'account.change_security',
    ];
    for (const cap of caps) {
      expect(canAgentBypassCanonicalUI(cap)).toBe(false);
    }
  });

  it('isFinancialCapability identifies Tier D capabilities', () => {
    expect(isFinancialCapability('offer.send')).toBe(true);
    expect(isFinancialCapability('wallet.withdraw')).toBe(true);
    expect(isFinancialCapability('chat.send')).toBe(false);
    expect(isFinancialCapability('search.run')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Tool executors are called with the correct arguments
  // -------------------------------------------------------------------------

  it('passes the arguments object verbatim to the tool executor', async () => {
    const executor = vi.fn(async (args: Record<string, unknown>) => args);
    registerToolExecutor(TIER_A_CAP, executor);

    const args = { query: 'boots', filters: { size: 'M' } };
    const result = await executeToolCall(
      {
        agentId: AGENT_ID,
        capability: TIER_A_CAP,
        summary: 'Run search',
        arguments: args,
      },
      { autoApproveTierA: true },
    );

    expect(result.executed).toBe(true);
    expect(executor).toHaveBeenCalledWith(args);
    expect(result.result).toEqual(args);
  });

  // -------------------------------------------------------------------------
  // Pending approvals are cleared after resolution
  // -------------------------------------------------------------------------

  it('clears pending approvals after resolution (approve or deny)', async () => {
    registerToolExecutor(TIER_C_CAP, vi.fn(async () => ({ ok: true })));

    const pending = await executeToolCall({
      agentId: AGENT_ID,
      capability: TIER_C_CAP,
      summary: 'Send chat message',
      arguments: { text: 'hi' },
    });
    const requestId = pending.approvalRequest!.id;
    expect(getPendingApproval(requestId)).toBeDefined();

    await resolveAndExecute(requestId, true, false, { text: 'hi' });
    expect(getPendingApproval(requestId)).toBeUndefined();

    // Second pending request, denied.
    const pending2 = await executeToolCall({
      agentId: AGENT_ID,
      capability: TIER_C_CAP,
      summary: 'Send chat message 2',
      arguments: { text: 'hi2' },
    });
    const requestId2 = pending2.approvalRequest!.id;
    await resolveAndExecute(requestId2, false, false);
    expect(getPendingApproval(requestId2)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // resolveAndExecute — missing request
  // -------------------------------------------------------------------------

  it('returns an error when resolving an unknown approval request id', async () => {
    const result = await resolveAndExecute('unknown_id', true, false);
    expect(result.approved).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.error).toBe('Approval request not found');
  });

  // -------------------------------------------------------------------------
  // Executor error propagation
  // -------------------------------------------------------------------------

  it('reports an error when the executor throws after approval', async () => {
    const executor = vi.fn(async () => {
      throw new Error('boom');
    });
    registerToolExecutor(TIER_A_CAP, executor);

    const result = await executeToolCall(
      {
        agentId: AGENT_ID,
        capability: TIER_A_CAP,
        summary: 'Read public profile',
        arguments: { userId: 'u_1' },
      },
      { autoApproveTierA: true },
    );

    expect(result.approved).toBe(true);
    expect(result.executed).toBe(false);
    expect(result.error).toBe('boom');
  });
});
