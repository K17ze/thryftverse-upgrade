import { fetchJson, ApiRequestError } from '../lib/apiClient';

/**
 * Creator document service — client for the canonical server document
 * store (POST/GET /creator/documents).
 *
 * This closes the P0 gap where the publish flow called
 * `publishCreatorDocument(workingDoc.id, ...)` without first persisting
 * the canonical `creator_documents` row. The publication orchestrator
 * reads `document_json` from that row to build the public projection;
 * if the row is missing or stale, the published content diverges from
 * what the creator authored.
 *
 * The backend POST endpoint is an upsert: it creates the row if absent
 * (lock_version = 1) or updates it conditionally when If-Match matches
 * the current lock_version (incrementing it). A 409 signals a concurrent
 * edit on another device.
 */

export interface CreatorDocumentSaveResult {
  documentId: string;
  lockVersion: number;
  documentHash: string;
  headRevision: number;
  updatedAt: string;
}

export interface CreatorDocumentFetchResult {
  documentId: string;
  lockVersion: number;
  documentHash: string;
  headRevision: number;
  documentJson: unknown;
  updatedAt: string;
}

/**
 * Raised when the server rejects a save because the document was
 * concurrently edited on another device (HTTP 409 with code
 * CREATOR_DOCUMENT_VERSION_CONFLICT). The caller should offer the user
 * a reload-or-duplicate choice rather than blindly retrying.
 */
export class CreatorDocumentConflictError extends Error {
  constructor(
    message: string,
    public code: string,
    public serverVersion?: number,
  ) {
    super(message);
    this.name = 'CreatorDocumentConflictError';
  }
}

// ── SHA-256 (client-side change detection) ───────────────────────────
// The server owns the authoritative canonical document hash and returns it
// in every save/fetch response. The client-side `computeDocumentHash` below
// is used ONLY for the pre-publish change-detection heuristic (deciding
// whether a re-save is needed). It uses the Web Crypto API (`subtle.digest`)
// which is available in modern React Native / Hermes runtimes and browsers.
//
// If the runtime does not expose `crypto.subtle`, the function falls back to
// a stable non-cryptographic fingerprint. This is safe because the
// authoritative hash always comes from the server — a fallback mismatch
// merely causes an unnecessary (but correct) re-save before publish.

function bufferToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function fnv1aHex(text: string): string {
  // FNV-1a 32-bit — a stable, fast, non-cryptographic fingerprint used only
  // when crypto.subtle is unavailable.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Compute a SHA-256 hex digest of the document JSON using the Web Crypto
 * API. Async because `crypto.subtle.digest` returns a Promise.
 *
 * NOTE: This is for client-side change detection only. The authoritative
 * document hash is computed and returned by the server.
 */
export async function computeDocumentHash(documentJson: unknown): Promise<string> {
  const text = JSON.stringify(documentJson);
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle && typeof subtle.digest === 'function') {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await subtle.digest('SHA-256', data);
    return bufferToHex(new Uint8Array(hashBuffer));
  }
  return fnv1aHex(text);
}

/**
 * Parse the server save response into the client-side save result.
 * The server owns the canonical document hash, head revision, and
 * updatedAt — the client must NOT reconstruct these from `new Date()`
 * or locally serialized objects.
 */
function parseSaveResponse(
  body: {
    ok: boolean;
    documentId: string;
    serverVersion: number;
    documentHash: string;
    headRevision: number;
    etag: string;
    updatedAt: string;
  },
): CreatorDocumentSaveResult {
  return {
    documentId: body.documentId,
    lockVersion: body.serverVersion,
    documentHash: body.documentHash,
    headRevision: body.headRevision,
    updatedAt: body.updatedAt,
  };
}

/**
 * Create a new server document. The document must NOT already exist on
 * the server (if it does, the backend returns 428 If-Match required).
 */
export async function createCreatorDocument(params: {
  documentType: 'poster' | 'look';
  documentJson: unknown;
}): Promise<CreatorDocumentSaveResult> {
  const body = await fetchJson<{
    ok: boolean;
    documentId: string;
    serverVersion: number;
    documentHash: string;
    headRevision: number;
    etag: string;
    updatedAt: string;
  }>(
    '/creator/documents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.documentJson),
    },
  );
  return parseSaveResponse(body);
}

/**
 * Update an existing server document with optimistic concurrency
 * (If-Match). Throws `CreatorDocumentConflictError` on 409.
 */
export async function updateCreatorDocument(params: {
  documentId: string;
  documentJson: unknown;
  expectedLockVersion: number;
}): Promise<CreatorDocumentSaveResult> {
  try {
    const body = await fetchJson<{
      ok: boolean;
      documentId: string;
      serverVersion: number;
      documentHash: string;
      headRevision: number;
      etag: string;
      updatedAt: string;
    }>(
      '/creator/documents',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': String(params.expectedLockVersion),
        },
        body: JSON.stringify(params.documentJson),
      },
    );
    return parseSaveResponse(body);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 409) {
      const details = error.details as { code?: string; serverVersion?: number; error?: string } | undefined;
      throw new CreatorDocumentConflictError(
        details?.error ?? 'Document was edited elsewhere',
        details?.code ?? 'CREATOR_DOCUMENT_VERSION_CONFLICT',
        details?.serverVersion,
      );
    }
    throw error;
  }
}

/**
 * Fetch a server document by ID. Returns the document JSON plus
 * server-side metadata (lock version, hash, updated_at).
 */
export async function fetchCreatorDocument(documentId: string): Promise<CreatorDocumentFetchResult> {
  const body = await fetchJson<{
    ok: boolean;
    document: Record<string, unknown> & {
      serverVersion: number;
      serverUpdatedAt: string;
      documentHash: string;
      headRevision: number;
    };
  }>(`/creator/documents/${documentId}`);

  const { serverVersion, serverUpdatedAt, documentHash, headRevision, ...documentJson } = body.document;
  return {
    documentId: documentJson.id as string,
    lockVersion: serverVersion,
    documentHash,
    headRevision,
    documentJson,
    updatedAt: serverUpdatedAt,
  };
}
