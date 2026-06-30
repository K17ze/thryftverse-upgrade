import crypto from 'node:crypto';

export function hashGroupCreatePayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

export interface IdempotencyRecord {
  creatorId: string;
  idempotencyKey: string;
  requestHash: string;
  conversationId: string;
  responsePayload: Record<string, unknown>;
}

export interface IdempotencyLookup {
  requestHash: string;
  responsePayload: Record<string, unknown>;
}

export type IdempotencyConflictError = {
  code: 'IDEMPOTENCY_KEY_REUSED';
  message: string;
};

export function resolveIdempotentResponse(
  existing: IdempotencyLookup | null,
  incomingHash: string
): { kind: 'miss' } | { kind: 'hit'; response: Record<string, unknown> } | { kind: 'conflict'; error: IdempotencyConflictError } {
  if (!existing) {
    return { kind: 'miss' };
  }

  if (existing.requestHash !== incomingHash) {
    return {
      kind: 'conflict',
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different request payload',
      },
    };
  }

  return { kind: 'hit', response: existing.responsePayload };
}

export function buildIdempotencyRecord(
  creatorId: string,
  idempotencyKey: string,
  requestHash: string,
  conversationId: string,
  responsePayload: Record<string, unknown>
): IdempotencyRecord {
  return {
    creatorId,
    idempotencyKey,
    requestHash,
    conversationId,
    responsePayload,
  };
}
