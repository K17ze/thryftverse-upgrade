// Deterministic state machine for support case operational state transitions.
//
// The case lifecycle is a directed graph:
//
//   new → triaged → awaiting_customer | queued | in_review | awaiting_external
//       → resolved → closed
//
// Reopens are supported from `resolved` (→ queued or triaged) and from
// `closed` (→ reopened-equivalent: triaged or queued). Every transition must
// pass through `assertTransition` so that invalid jumps are rejected before
// any database mutation.
//
// This module is pure: it performs no I/O and depends only on the
// `CaseOperationalState` contract. It is the single source of truth for which
// state changes are legal.

import type { CaseOperationalState } from './contracts.js';

/**
 * The complete set of legal transitions keyed by source state. Each value is
 * the list of states the source may transition *to*. A state that maps to an
 * empty array is terminal (no outbound transitions).
 */
export const VALID_TRANSITIONS: Record<CaseOperationalState, CaseOperationalState[]> = {
  new: ['triaged'],
  triaged: ['awaiting_customer', 'queued', 'in_review', 'awaiting_external', 'resolved'],
  awaiting_customer: ['queued', 'triaged', 'in_review', 'resolved'],
  queued: ['in_review', 'awaiting_customer', 'awaiting_external', 'resolved'],
  in_review: ['queued', 'awaiting_customer', 'awaiting_external', 'resolved'],
  awaiting_external: ['queued', 'in_review', 'awaiting_customer', 'resolved'],
  // `resolved` may close or be reopened back into an active work state.
  resolved: ['closed', 'queued', 'triaged'],
  // `closed` is near-terminal but supports reopen for appeals / escalations.
  closed: ['triaged', 'queued'],
};

/**
 * Returns true when a transition from `from` to `to` is permitted by the
 * state machine. Self-transitions are not allowed — a state change must move
 * to a different state.
 */
export function isValidTransition(
  from: CaseOperationalState,
  to: CaseOperationalState,
): boolean {
  if (from === to) {
    return false;
  }
  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Throws an Error (with a stable `code` property) when the transition is not
 * permitted. Use this at the boundary of any mutation that changes a case's
 * operational state so that invalid transitions surface as 409 responses
 * rather than silently corrupting the timeline.
 */
export function assertTransition(
  from: CaseOperationalState,
  to: CaseOperationalState,
): void {
  if (!isValidTransition(from, to)) {
    const error = new Error(
      `Invalid case state transition: ${from} → ${to}`,
    ) as Error & { code: string; statusCode: number };
    error.code = 'INVALID_STATE_TRANSITION';
    error.statusCode = 409;
    throw error;
  }
}
