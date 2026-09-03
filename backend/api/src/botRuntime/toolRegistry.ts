/**
 * Tool Registry — typed server-side tool definitions for AI agent execution.
 *
 * Tools are the only way an agent can perform external actions. Each tool has:
 * - A stable name and version
 * - A JSON Schema for input validation
 * - A risk classification (read, reversible_write, consequential_write, destructive)
 * - A required backend permission
 * - A policy (automatic, ask_once, ask_each_time, blocked)
 *
 * The policy engine decides whether a proposed tool call is allowed, requires
 * approval, or is denied. Downstream domain services still enforce authorization
 * independently — tool policy is a precondition, not a substitute.
 */

import type { Pool } from 'pg';

export type ToolRisk = 'read' | 'reversible_write' | 'consequential_write' | 'destructive';
export type ToolPolicy = 'automatic' | 'ask_once' | 'ask_each_time' | 'blocked';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: ToolRisk;
  requiredPermission: string | null;
  isEnabled: boolean;
  version: string;
}

export interface ToolBinding {
  toolName: string;
  policy: ToolPolicy;
}

export interface PolicyDecision {
  decision: 'allow' | 'deny' | 'require_approval';
  reason: string;
}

/**
 * Load all enabled tools from the database.
 */
export async function loadEnabledTools(db: Pool): Promise<ToolDefinition[]> {
  const result = await db.query<{
    name: string;
    description: string;
    input_schema: unknown;
    risk: ToolRisk;
    required_permission: string | null;
    is_enabled: boolean;
    version: string;
  }>(`SELECT name, description, input_schema, risk, required_permission, is_enabled, version FROM agent_tools WHERE is_enabled = TRUE`);

  return result.rows.map((row) => ({
    name: row.name,
    description: row.description,
    inputSchema: row.input_schema as Record<string, unknown>,
    risk: row.risk,
    requiredPermission: row.required_permission,
    isEnabled: row.is_enabled,
    version: row.version,
  }));
}

/**
 * Load tool bindings for a specific bot.
 */
export async function loadToolBindings(db: Pool, botId: string): Promise<ToolBinding[]> {
  const result = await db.query<{ tool_name: string; policy: ToolPolicy }>(
    `SELECT tool_name, policy FROM agent_tool_bindings WHERE bot_id = $1`,
    [botId]
  );
  return result.rows.map((row) => ({
    toolName: row.tool_name,
    policy: row.policy,
  }));
}

/**
 * Convert tool definitions to OpenAI function tool format.
 */
export function toolsToOpenAIFormat(tools: ToolDefinition[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/**
 * Evaluate policy for a proposed tool call.
 */
export function evaluateToolPolicy(
  tool: ToolDefinition,
  binding: ToolBinding | undefined,
  agentPermissions: string[],
  hasApproval: boolean
): PolicyDecision {
  // Check if tool is blocked by binding
  if (binding?.policy === 'blocked') {
    return { decision: 'deny', reason: 'Tool is blocked for this agent' };
  }

  // Check required permission
  if (tool.requiredPermission && !agentPermissions.includes(tool.requiredPermission)) {
    return { decision: 'deny', reason: `Agent lacks required permission: ${tool.requiredPermission}` };
  }

  // Check binding policy
  if (binding?.policy === 'ask_each_time' && !hasApproval) {
    return { decision: 'require_approval', reason: 'Tool requires explicit approval for each use' };
  }

  if (binding?.policy === 'ask_once' && !hasApproval) {
    // ask_once means the first use requires approval, subsequent uses are automatic
    // For simplicity in this phase, we treat ask_once as require_approval on first use
    return { decision: 'require_approval', reason: 'Tool requires one-time approval' };
  }

  // Risk-based default: consequential and destructive always require approval
  if ((tool.risk === 'consequential_write' || tool.risk === 'destructive') && !hasApproval) {
    return { decision: 'require_approval', reason: `Tool risk level (${tool.risk}) requires approval` };
  }

  return { decision: 'allow', reason: 'Tool is allowed' };
}

/**
 * Execute a tool call with a placeholder result.
 * This is a test-only stub — real tool execution will be implemented
 * in future phases with proper domain service integration.
 */
export function executeToolStub(
  toolName: string,
  _args: Record<string, unknown>
): { result: string; success: boolean } {
  switch (toolName) {
    case 'search_listings':
      return { result: 'No listings found matching the query.', success: true };
    case 'read_conversation':
      return { result: 'No recent messages available in playground mode.', success: true };
    case 'draft_reply':
      return { result: 'Draft reply prepared but not sent (playground mode).', success: true };
    case 'get_listing_details':
      return { result: 'Listing not found in playground mode.', success: true };
    case 'check_price_history':
      return { result: 'No price history available in playground mode.', success: true };
    default:
      return { result: `Tool '${toolName}' is not implemented in playground mode.`, success: false };
  }
}
