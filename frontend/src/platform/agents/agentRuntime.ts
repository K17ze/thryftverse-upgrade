/**
 * Agent Runtime — the execution layer that sits between the chat agent
 * service and the actual tool execution. Every agent action that would
 * affect the user's account, data, or external state MUST go through
 * this runtime, which checks the Capability Broker before executing.
 *
 * This is the ONLY path from agent → tool execution. The runtime:
 *  - Hydrates persisted grants from AsyncStorage on first use.
 *  - Honours existing `always_allow` grants for non-Tier-D capabilities.
 *  - Auto-approves Tier A reads when the caller opts in
 *    (`autoApproveTierA`), so read-only agents don't prompt on every call.
 *  - Defers Tier C / D capabilities to an explicit user approval, surfaced
 *    via the pending-approval map for the UI to present.
 *  - Never auto-approves Tier D, even if a stale grant exists.
 */

import {
  requestCapability,
  resolveApproval,
  getGrant,
  hydrateGrants,
  canAgentBypassCanonicalUI,
  isFinancialCapability,
  CAPABILITY_TIER,
  type AgentCapability,
  type ApprovalRequest,
} from './capabilityBroker';

export interface ToolCallRequest {
  agentId: string;
  capability: AgentCapability;
  summary: string;
  arguments?: Record<string, unknown>;
}

export interface ToolCallResult {
  approved: boolean;
  executed: boolean;
  result?: unknown;
  error?: string;
  reason?: string;
  approvalRequest?: ApprovalRequest;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

// Registry of tool executors keyed by capability.
const toolExecutors = new Map<AgentCapability, ToolExecutor>();

/**
 * Register an executor for a capability. Only one executor per capability
 * is supported; later registrations overwrite earlier ones.
 */
export function registerToolExecutor(
  capability: AgentCapability,
  executor: ToolExecutor,
): void {
  toolExecutors.set(capability, executor);
}

/** Remove a registered executor (primarily for tests). */
export function unregisterToolExecutor(capability: AgentCapability): void {
  toolExecutors.delete(capability);
}

// Pending approval requests, keyed by request id, for the UI to pick up.
const pendingApprovals = new Map<string, ApprovalRequest>();

export function getPendingApproval(
  requestId: string,
): ApprovalRequest | undefined {
  return pendingApprovals.get(requestId);
}

export function clearPendingApproval(requestId: string): void {
  pendingApprovals.delete(requestId);
}

/** Clear all pending approvals (primarily for tests). */
export function clearAllPendingApprovals(): void {
  pendingApprovals.clear();
}

/**
 * Execute a tool call through the capability broker.
 * This is the ONLY path from agent → tool execution.
 */
export async function executeToolCall(
  request: ToolCallRequest,
  options: { autoApproveTierA?: boolean } = {},
): Promise<ToolCallResult> {
  await hydrateGrants();

  const tier = CAPABILITY_TIER[request.capability];

  // Check for an existing always_allow grant. Tier D is never auto-allowed
  // even if a stale grant is present.
  const grant = getGrant(request.agentId, request.capability);
  if (grant?.policy === 'always_allow' && tier !== 'D') {
    const executor = toolExecutors.get(request.capability);
    if (executor && request.arguments) {
      try {
        const result = await executor(request.arguments);
        return { approved: true, executed: true, result };
      } catch (error) {
        return {
          approved: true,
          executed: false,
          error: error instanceof Error ? error.message : 'Execution failed',
        };
      }
    }
    // Fail closed: no executor or no arguments means the tool did not run.
    return {
      approved: true,
      executed: false,
      error: 'No executor registered for capability or missing arguments',
    };
  }

  // Request the capability from the broker. This records an
  // `approval_requested` ledger entry (or `tool_called` when auto-allowed
  // by a grant, which the branch above already handled).
  const approvalRequest = await requestCapability(
    request.agentId,
    request.capability,
    request.summary,
  );

  // For Tier A reads with `autoApproveTierA`, auto-approve and execute so
  // read-only agents don't prompt the user on every call.
  if (tier === 'A' && options.autoApproveTierA) {
    const result = await resolveApproval(approvalRequest, true, true);
    if (result.approved) {
      const executor = toolExecutors.get(request.capability);
      if (executor && request.arguments) {
        try {
          const execResult = await executor(request.arguments);
          return { approved: true, executed: true, result: execResult };
        } catch (error) {
          return {
            approved: true,
            executed: false,
            error: error instanceof Error ? error.message : 'Execution failed',
          };
        }
      }
      // Fail closed: no executor or no arguments means the tool did not run.
      return {
        approved: true,
        executed: false,
        error: 'No executor registered for capability or missing arguments',
      };
    }
  }

  // Otherwise, surface the approval request for the UI to present.
  pendingApprovals.set(approvalRequest.id, approvalRequest);

  return {
    approved: false,
    executed: false,
    reason: 'approval_required',
    approvalRequest,
  };
}

/**
 * Resolve a pending approval and execute the tool if approved.
 * The UI calls this after the user accepts or rejects the prompt.
 */
export async function resolveAndExecute(
  requestId: string,
  approved: boolean,
  alwaysAllow: boolean,
  args?: Record<string, unknown>,
): Promise<ToolCallResult> {
  const approvalRequest = pendingApprovals.get(requestId);
  if (!approvalRequest) {
    return {
      approved: false,
      executed: false,
      error: 'Approval request not found',
    };
  }

  const result = await resolveApproval(approvalRequest, approved, alwaysAllow);

  if (!result.approved) {
    clearPendingApproval(requestId);
    return { approved: false, executed: false, reason: result.reason };
  }

  // Execute the tool.
  const executor = toolExecutors.get(approvalRequest.capability);
  if (executor && args) {
    try {
      const execResult = await executor(args);
      clearPendingApproval(requestId);
      return { approved: true, executed: true, result: execResult };
    } catch (error) {
      clearPendingApproval(requestId);
      return {
        approved: true,
        executed: false,
        error: error instanceof Error ? error.message : 'Execution failed',
      };
    }
  }

  // Fail closed: no executor or no arguments means the tool did not run.
  clearPendingApproval(requestId);
  return {
    approved: true,
    executed: false,
    error: 'No executor registered for capability or missing arguments',
  };
}

// Re-export bypass / financial checks for callers that want them alongside
// the runtime.
export { canAgentBypassCanonicalUI, isFinancialCapability };
