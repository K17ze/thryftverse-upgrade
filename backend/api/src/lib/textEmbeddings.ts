/**
 * Text embeddings — the encoder used by agent memory (and any future
 * text-retrieval surface). Follows the repo's honest-degradation contract:
 * when no provider key is configured the functions return null and callers
 * fall back to non-vector behaviour rather than fabricating similarity.
 *
 * Transport: OpenAI-compatible `POST {baseUrl}/embeddings`. The platform
 * key is the default; a bound provider_connection credential may be passed
 * so BYOK agents pay their own embedding cost.
 */

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
const EMBEDDING_TIMEOUT_MS = Number(process.env.OPENAI_EMBEDDING_TIMEOUT_MS ?? 15_000);
// text-embedding-3-small context is 8k tokens; ~4 chars/token is a safe cap.
const MAX_INPUT_CHARS = 24_000;

export const TEXT_EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingCredential {
  apiKey: string;
  baseUrl: string;
}

function resolveCredential(credential?: EmbeddingCredential): EmbeddingCredential | null {
  if (credential?.apiKey) return credential;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
  };
}

export function textEmbeddingAvailable(credential?: EmbeddingCredential): boolean {
  return resolveCredential(credential) !== null;
}

/**
 * Embed a single text. Returns the float vector, or null when no provider is
 * configured or the request fails. Never throws — embedding is an
 * enhancement layer, and callers must degrade honestly when it is absent.
 */
export async function embedText(
  text: string,
  credential?: EmbeddingCredential,
): Promise<number[] | null> {
  const cred = resolveCredential(credential);
  if (!cred) return null;

  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!input) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    const response = await fetch(`${cred.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cred.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: unknown }>;
    };
    const vector = payload.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) return null;
    return vector.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** pgvector literal — '[0.1,0.2,...]' — or null when the vector is unusable. */
export function embeddingToVectorLiteral(embedding: number[] | null): string | null {
  if (!embedding || embedding.length === 0) return null;
  return `[${embedding.map((v) => {
    // Guard against precision/NaN leaking into the literal.
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }).join(',')}]`;
}
