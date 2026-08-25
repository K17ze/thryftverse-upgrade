/**
 * Catalogue Import — State Machine
 *
 * Pure functions that validate state transitions for connections, batches,
 * and items. No side effects, no database access. The domain service calls
 * these before mutating any row so invalid transitions are rejected at the
 * source of truth.
 *
 * Per blueprint §6: "State transitions must be validated in the domain
 * service. Do not let route handlers write arbitrary status strings."
 */

import type {
  BatchState,
  ConnectionState,
  ItemReadiness,
} from './catalogImportTypes.js';
import {
  BATCH_STATES,
  BATCH_TERMINAL_STATES,
  BATCH_TRANSITIONS,
  CONNECTION_STATES,
  CONNECTION_TRANSITIONS,
  ITEM_READINESS_STATES,
} from './catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Connection state machine
// ---------------------------------------------------------------------------

export function isValidConnectionTransition(
  from: ConnectionState,
  to: ConnectionState,
): boolean {
  const allowed = CONNECTION_TRANSITIONS[from];
  return allowed.includes(to);
}

export function assertConnectionTransition(
  from: ConnectionState,
  to: ConnectionState,
): void {
  if (!isValidConnectionTransition(from, to)) {
    throw new Error(
      `Invalid connection state transition: ${from} → ${to}`,
    );
  }
}

export function isConnectionState(value: unknown): value is ConnectionState {
  return typeof value === 'string' && (CONNECTION_STATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Batch state machine
// ---------------------------------------------------------------------------

export function isValidBatchTransition(
  from: BatchState,
  to: BatchState,
): boolean {
  const allowed = BATCH_TRANSITIONS[from];
  return allowed.includes(to);
}

export function assertBatchTransition(
  from: BatchState,
  to: BatchState,
): void {
  if (!isValidBatchTransition(from, to)) {
    throw new Error(
      `Invalid batch state transition: ${from} → ${to}`,
    );
  }
}

export function isBatchTerminal(state: BatchState): boolean {
  return BATCH_TERMINAL_STATES.includes(state);
}

export function isBatchState(value: unknown): value is BatchState {
  return typeof value === 'string' && (BATCH_STATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Item readiness state machine
// ---------------------------------------------------------------------------

/**
 * Item readiness follows a linear progression through the pipeline stages,
 * then settles into one of the review states. Transitions are validated
 * to prevent a worker from regressing an item to an earlier stage without
 * an explicit recovery reason.
 */
const ITEM_READINESS_TRANSITIONS: Record<ItemReadiness, readonly ItemReadiness[]> = {
  discovered: ['hydrated', 'excluded', 'source_changed'],
  hydrated: ['media_pending', 'excluded', 'source_changed'],
  media_pending: ['mapping_pending', 'excluded', 'source_changed'],
  mapping_pending: ['ready', 'needs_input', 'probable_duplicate', 'excluded', 'source_changed'],
  ready: ['needs_input', 'probable_duplicate', 'excluded', 'source_changed'],
  needs_input: ['ready', 'probable_duplicate', 'excluded'],
  probable_duplicate: ['ready', 'excluded'],
  excluded: [],
  source_changed: ['ready', 'excluded'],
} as const;

export function isValidItemReadinessTransition(
  from: ItemReadiness,
  to: ItemReadiness,
): boolean {
  const allowed = ITEM_READINESS_TRANSITIONS[from];
  return allowed.includes(to);
}

export function assertItemReadinessTransition(
  from: ItemReadiness,
  to: ItemReadiness,
): void {
  if (!isValidItemReadinessTransition(from, to)) {
    throw new Error(
      `Invalid item readiness transition: ${from} → ${to}`,
    );
  }
}

export function isItemReadiness(value: unknown): value is ItemReadiness {
  return typeof value === 'string' && (ITEM_READINESS_STATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Batch phase derivation
// ---------------------------------------------------------------------------

/**
 * Derives the human-readable progress phase from the batch state. The
 * frontend uses these for truthful progress copy — never fake percentages.
 */
export type BatchPhase =
  | 'connecting'
  | 'finding_listings'
  | 'copying_photos'
  | 'preparing_details'
  | 'ready_to_review'
  | 'needs_input'
  | 'publishing'
  | 'completed'
  | 'cancelled'
  | 'paused'
  | 'failed';

export function batchPhaseFromState(state: BatchState): BatchPhase {
  switch (state) {
    case 'created':
    case 'discovering':
      return 'connecting';
    case 'hydrating':
      return 'finding_listings';
    case 'ingesting_media':
      return 'copying_photos';
    case 'normalising':
      return 'preparing_details';
    case 'awaiting_operator':
    case 'awaiting_seller':
      return 'ready_to_review';
    case 'approved':
    case 'publishing':
      return 'publishing';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'cancelling':
      return 'cancelled';
    case 'paused_rate_limit':
    case 'paused_reauth':
      return 'paused';
    case 'failed_recoverable':
      return 'failed';
    default:
      return 'connecting';
  }
}
