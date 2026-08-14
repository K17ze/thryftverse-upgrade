/**
 * Agent Activity Ledger — records material agent actions for user
 * transparency (spec 05: Capability Broker, Permissions & Approvals).
 *
 * Persists an append-only log of:
 *  - agent deployed
 *  - agent removed
 *  - tool called
 *  - approval requested
 *  - approval granted
 *  - approval denied
 *  - all agents paused
 *
 * Entries are stored in AsyncStorage (not secret) and exposed to the user
 * in plain language via the Agent Activity screen.
 *
 * Per AGENTS.md §11 (Truthful UI):
 *  - We never fabricate ledger entries. Every entry corresponds to a real
 *    action that actually occurred.
 *  - Sanitized argument summaries omit raw secrets and PII.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentActivityType =
  | 'agent_deployed'
  | 'agent_removed'
  | 'tool_called'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'all_agents_paused';

export interface AgentActivityEntry {
  /** Stable unique id (timestamp + counter). */
  id: string;
  /** What kind of material action occurred. */
  type: AgentActivityType;
  /** ISO timestamp of when the action occurred. */
  timestamp: string;
  /** Human-readable agent name or id involved in the action. */
  agent?: string;
  /** Conversation / session context where the action occurred. */
  session?: string;
  /** Runtime or provider involved (e.g. "openai", "demo"). */
  runtime?: string;
  /** Capability group exercised (e.g. "search.run", "chat.send"). */
  capability?: string;
  /** Policy tier that matched (A/B/C/D per spec 05). */
  policyTier?: 'A' | 'B' | 'C' | 'D';
  /** Approval decision when the action required user consent. */
  approval?: 'granted' | 'denied' | 'requested';
  /** Sanitized, human-readable summary of the action arguments. */
  summary: string;
  /** Outcome status of the action. */
  resultStatus: 'success' | 'failed' | 'paused' | 'denied';
  /** External resource id committed by the action, when applicable. */
  externalResourceId?: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const LEDGER_STORAGE_KEY = '@thryftverse_agent_activity_ledger/v1';
const MAX_ENTRIES = 500;

let idCounter = 0;

function makeEntryId(): string {
  idCounter += 1;
  return `activity_${Date.now()}_${idCounter}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a material agent action in the ledger. The entry is appended to
 * the persisted log immediately.
 */
export async function recordAgentActivity(
  entry: Omit<AgentActivityEntry, 'id' | 'timestamp'>,
): Promise<AgentActivityEntry> {
  const fullEntry: AgentActivityEntry = {
    id: makeEntryId(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    const existing = await getAgentActivity();
    const next = [fullEntry, ...existing].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Persistence failure is non-fatal — the entry is still returned to
    // the caller for in-memory use. We do not fabricate persistence.
  }

  return fullEntry;
}

/**
 * Retrieve all recorded agent activity entries, newest first.
 * Returns an empty array when nothing has been recorded yet.
 */
export async function getAgentActivity(): Promise<AgentActivityEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentActivityEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Clear all agent activity entries. Used when the user wants to reset the
 * ledger (e.g. from the Agent Activity screen).
 */
export async function clearAgentActivity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEDGER_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Human-readable labels for the UI
// ---------------------------------------------------------------------------

export const ACTIVITY_LABELS: Record<AgentActivityType, string> = {
  agent_deployed: 'Agent deployed',
  agent_removed: 'Agent removed',
  tool_called: 'Tool called',
  approval_requested: 'Approval requested',
  approval_granted: 'Approval granted',
  approval_denied: 'Approval denied',
  all_agents_paused: 'All agents paused',
};

export const ACTIVITY_ICONS: Record<AgentActivityType, string> = {
  agent_deployed: 'add-circle-outline',
  agent_removed: 'remove-circle-outline',
  tool_called: 'build-outline',
  approval_requested: 'hand-left-outline',
  approval_granted: 'checkmark-circle-outline',
  approval_denied: 'close-circle-outline',
  all_agents_paused: 'pause-circle-outline',
};
