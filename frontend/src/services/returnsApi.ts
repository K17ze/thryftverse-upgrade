import { fetchJson, ApiRequestError } from '../lib/apiClient';

/**
 * Returns domain client — mirrors backend `routes/returns.ts`.
 *
 * A return case is the authoritative record of a buyer's return/refund
 * request and its resolution state machine. The server is the source of
 * truth: the client renders the fields it receives and never invents
 * labels, windows, or amounts.
 */

/** Mirror of backend SELLER_RESPONSE_WINDOW_HOURS. The authoritative value
 * is always the server-provided `stepInEligibleAt` on the return case —
 * this constant exists for tests and copy that must state the window. */
export const SELLER_RESPONSE_WINDOW_HOURS = 72;

export type ReturnBasis = 'statutory' | 'protection' | 'voluntary';

export type ReturnCaseStatus =
  | 'requested'
  | 'evidence_review'
  | 'approved'
  | 'rejected'
  | 'reverse_shipped'
  | 'received'
  | 'inspected'
  | 'remedy_proposed'
  | 'remedy_accepted'
  | 'refund_confirmed'
  | 'appealed'
  | 'closed';

export type ReturnRemedy =
  | 'full_refund'
  | 'partial_refund'
  | 'replacement'
  | 'repair'
  | 'reject';

export interface ReturnCase {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  basis: ReturnBasis;
  status: ReturnCaseStatus;
  reason: string;
  description: string | null;
  evidenceMediaUrls: string[];
  returnWindowDeadline: string | null;
  returnCarrier: string | null;
  returnTrackingNumber: string | null;
  /** Platform/seller-issued return label. Null until one is provided —
   * render only when present, never fabricate. */
  returnLabelUrl: string | null;
  inspectionNotes: string | null;
  inspectionCondition: string | null;
  proposedRemedy: ReturnRemedy | null;
  remedyAmountGbp: number | null;
  /** Buyer's requested refund amount. Null means a full refund request. */
  requestedAmountGbp: number | null;
  /** When the platform step-in becomes available (seller response window
   * elapsed). Null once the seller has responded or the case has moved on. */
  stepInEligibleAt: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  appealReason: string | null;
  appealedAt: string | null;
  operatorId: string | null;
  operatorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnCaseEvent {
  id: string;
  returnCaseId: string;
  fromStatus: ReturnCaseStatus | null;
  toStatus: ReturnCaseStatus;
  actorId: string;
  actorRole: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RequestReturnInput {
  reason: string;
  description?: string;
  evidenceMediaUrls?: string[];
  /** Partial refund request in GBP. Omit for a full refund request. */
  requestedAmountGbp?: number;
}

interface ReturnRequestResponse {
  ok: true;
  returnCaseId: string;
  status: ReturnCaseStatus;
  basis: ReturnBasis;
  returnWindowDeadline: string;
  requestedAmountGbp: number | null;
  stepInEligibleAt: string | null;
}

interface OrderReturnCaseResponse {
  ok: true;
  returnCase: ReturnCase;
  events: ReturnCaseEvent[];
}

interface StepInResponse {
  ok: true;
  returnCaseId: string;
  status: ReturnCaseStatus;
  appealedAt: string;
}

/** Buyer initiates a return. `requestedAmountGbp` bounds a partial refund
 * request to the paid order total; the server validates it again. */
export async function requestReturn(
  orderId: string,
  input: RequestReturnInput,
): Promise<ReturnRequestResponse> {
  return fetchJson<ReturnRequestResponse>(
    `/orders/${encodeURIComponent(orderId)}/return-request`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Fetches the active return case for an order. Returns null when the
 * order has no return case (404) so callers can render the no-case state. */
export async function getOrderReturnCase(
  orderId: string,
): Promise<{ returnCase: ReturnCase; events: ReturnCaseEvent[] } | null> {
  try {
    const payload = await fetchJson<OrderReturnCaseResponse>(
      `/orders/${encodeURIComponent(orderId)}/return-case`,
    );
    return { returnCase: payload.returnCase, events: payload.events };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Buyer asks the platform to step in after the seller response window.
 * The server rejects with STEP_IN_NOT_YET_ELIGIBLE until the
 * `stepInEligibleAt` timestamp has passed. */
export async function requestReturnStepIn(
  returnCaseId: string,
  reason?: string,
): Promise<StepInResponse> {
  return fetchJson<StepInResponse>(
    `/return-cases/${encodeURIComponent(returnCaseId)}/step-in`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}
