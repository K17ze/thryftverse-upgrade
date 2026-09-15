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

// ── State-machine transitions ────────────────────────────────────────────
// Each wrapper mirrors one backend route in routes/returns.ts. The server
// validates role + transition legality (409 on an illegal move) — the
// client only renders actions the current status/role permits.

/** Buyer uploads additional evidence while the case is open
 *  (requested / evidence_review). */
export async function submitReturnEvidence(
  returnCaseId: string,
  evidenceMediaUrls: string[],
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/evidence`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceMediaUrls }),
    },
  );
}

/** Seller decision on a pending return request — approved moves the case
 *  to 'approved' (awaiting reverse shipment); rejected to 'rejected'
 *  (buyer may then appeal). */
export async function respondToReturnCase(
  returnCaseId: string,
  input: { decision: 'approved' | 'rejected'; reason: string },
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus; decision: 'approved' | 'rejected' }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/decision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Seller provides return shipping details — carrier + tracking, and
 *  optionally a hosted return label URL. Moves the case to
 *  'reverse_shipped'. */
export async function provideReturnShipment(
  returnCaseId: string,
  input: { carrier: string; trackingNumber: string; labelUrl?: string },
): Promise<{
  ok: true;
  returnCaseId: string;
  status: ReturnCaseStatus;
  returnCarrier: string;
  returnTrackingNumber: string;
}> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/reverse-shipment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Seller confirms the returned item has arrived. */
export async function confirmReturnReceipt(
  returnCaseId: string,
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/receipt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}

/** Seller records the inspection outcome (notes + condition) before
 *  proposing a remedy. */
export async function recordReturnInspection(
  returnCaseId: string,
  input: { notes: string; condition: string },
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/inspection`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Seller proposes a remedy after inspection. `amountGbp` is required for
 *  'partial_refund' and must not be sent for any other remedy — the server
 *  rejects a non-partial remedy that carries an explicit amount. */
export async function proposeReturnRemedy(
  returnCaseId: string,
  input: { remedy: ReturnRemedy; amountGbp?: number; notes?: string },
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/remedy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Buyer accepts the proposed remedy — moves to 'remedy_accepted' while
 *  the refund/replacement executes. */
export async function acceptReturnRemedy(
  returnCaseId: string,
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/remedy/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}

/** Buyer rejects the proposed remedy — escalates the case to 'appealed'
 *  for platform review. */
export async function rejectReturnRemedy(
  returnCaseId: string,
  reason: string,
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/remedy/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
}

/** Buyer appeals a rejected return — moves the case to 'appealed' for
 *  platform review. */
export async function appealReturnCase(
  returnCaseId: string,
  reason: string,
): Promise<{ ok: true; returnCaseId: string; status: ReturnCaseStatus }> {
  return fetchJson(
    `/return-cases/${encodeURIComponent(returnCaseId)}/appeal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
}
