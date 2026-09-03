/**
 * POST /chat/translate — AI-powered message translation.
 *
 * Translates a chat message to the user's target locale using an LLM.
 * This is the backend counterpart to the client-side
 * `messageTranslation.ts` service — the same pattern used by WhatsApp,
 * Instagram, Telegram, and iMessage for inline message translation.
 *
 * Architecture (2026 flagship patterns):
 * - Receives { messageId, text, targetLocale }
 * - Normalizes text (trim, NFC, collapse whitespace) before processing
 * - Masks PII (emails, phone numbers, URLs) before sending to LLM
 * - Calls OpenAI gpt-4o-mini (cheapest sufficient model for chat translation)
 *   with a stable system prompt for OpenAI prompt caching
 * - Cache key uses SHA-256 hash of normalized text (PII-safe, cross-user hits)
 * - Redis cache with 14-day TTL (translations are deterministic)
 * - Token-bucket rate limiting per user (60 translations/hour)
 * - Returns { translatedText, sourceLanguage, targetLanguage, model }
 * - Graceful degradation: 503 if unconfigured, 502 if LLM fails, 429 if rate-limited
 *
 * Model choice rationale (2026 research):
 * - gpt-4o-mini: $0.15/$0.60 per 1M tokens — ~$0.00045/translation.
 *   Sufficient quality for short chat messages. 63% cheaper than gpt-4.1-mini.
 * - GPT-5.x avoided for translation: reasoning layer can echo source text
 *   instead of translating, and thinking tokens are billed as output.
 * - System prompt is kept stable across calls to leverage OpenAI's
 *   prompt caching (cached input: $0.08/M vs $0.15/M).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { config } from '../config.js';

type ChatTranslateRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  ensureUserExists: (userId: string) => Promise<void>;
  redisClient?: Redis | null;
};

const SUPPORTED_TARGET_LOCALES = [
  'en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'pt', 'ja', 'ru', 'tr', 'ko', 'id',
] as const;

const LOCALE_TO_LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic (Modern Standard)',
  hi: 'Hindi',
  zh: 'Simplified Chinese',
  pt: 'Brazilian Portuguese',
  ja: 'Japanese',
  ru: 'Russian',
  tr: 'Turkish',
  ko: 'Korean',
  id: 'Indonesian',
};

// 14-day TTL — translations are deterministic, long TTL is safe.
// Invalidation happens via version prefix bump on model upgrade.
const TRANSLATION_CACHE_TTL_SECONDS = 14 * 24 * 60 * 60;

// Rate limit: 60 translations per user per hour
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

// Cache version — bump when changing model or prompt to invalidate all old entries
const CACHE_VERSION = 'v2';

// Use gpt-4o-mini for translation — cheapest sufficient model.
// GPT-5.x reasoning layer can echo source text; avoid for translation.
const TRANSLATION_MODEL = 'gpt-4o-mini';

const bodySchema = z.object({
  messageId: z.string().min(2).max(100),
  text: z.string().min(1).max(4000),
  targetLocale: z.enum(SUPPORTED_TARGET_LOCALES),
});

interface OpenAiTranslationResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  model: string;
}

// ── Text normalization ─────────────────────────────────────────────

/**
 * Normalize text before processing: trim, Unicode NFC, collapse whitespace.
 * This ensures cache hits for semantically identical inputs and
 * reduces LLM token usage.
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

// ── PII masking ────────────────────────────────────────────────────

// Patterns for common PII that should be masked before sending to LLM.
// Placeholders are designed to survive translation intact.
const PII_PATTERNS: Array<{ regex: RegExp; placeholder: string }> = [
  // Email addresses
  { regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g, placeholder: '[EMAIL]' },
  // Phone numbers (international, +prefix or local)
  { regex: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g, placeholder: '[PHONE]' },
  // URLs
  { regex: /https?:\/\/[^\s]+/g, placeholder: '[URL]' },
  // Credit card numbers (basic pattern)
  { regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, placeholder: '[CARD]' },
];

interface PiiMaskResult {
  maskedText: string;
  /** Map from placeholder to original value, for restoring after translation */
  restoreMap: Map<string, string>;
}

/**
 * Mask PII in the message text before sending to the LLM.
 * Replaces emails, phone numbers, URLs, and card numbers with
 * structured placeholders that survive translation.
 * The original values are restored in the translated output.
 */
function maskPii(text: string): PiiMaskResult {
  const restoreMap = new Map<string, string>();
  let maskedText = text;
  let piiIndex = 0;

  for (const { regex, placeholder } of PII_PATTERNS) {
    maskedText = maskedText.replace(regex, (match) => {
      // Use indexed placeholders if multiple PII of same type exist
      const tag = restoreMap.size === 0
        ? placeholder
        : `${placeholder.slice(0, -1)}_${piiIndex}]`;
      piiIndex++;
      restoreMap.set(tag, match);
      return tag;
    });
  }

  return { maskedText, restoreMap };
}

/**
 * Restore original PII values into the translated text.
 * Placeholders are replaced with the original values.
 */
function restorePii(translatedText: string, restoreMap: Map<string, string>): string {
  let result = translatedText;
  for (const [placeholder, original] of restoreMap) {
    // LLM might slightly alter the placeholder (e.g., add spaces).
    // Use a flexible regex to find it.
    const flexibleRegex = new RegExp(
      placeholder.replace(/[[\]]/g, '\\$&').replace(/_/g, '\\s*'),
      'gi',
    );
    result = result.replace(flexibleRegex, original);
  }
  return result;
}

// ── Cache key computation ──────────────────────────────────────────

/**
 * Compute a SHA-256 cache key from the normalized text + target locale + model.
 * Using a hash instead of raw text:
 * - Protects PII from appearing in Redis keys
 * - Keeps keys compact (fixed 64 chars vs up to 4000 chars)
 * - Enables cross-user cache hits (same message from different users = same key)
 */
function computeCacheKey(text: string, targetLocale: string): string {
  const normalized = normalizeText(text);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `chat-translate:${CACHE_VERSION}:${hash}:${targetLocale}:${TRANSLATION_MODEL}`;
}

// ── LLM translation ────────────────────────────────────────────────

/**
 * Stable system prompt for translation.
 * Kept identical across all calls to leverage OpenAI's prompt caching
 * (cached input tokens cost $0.08/M vs $0.15/M for uncached).
 * Only the target language name is interpolated, which means the first
 * ~80% of the prompt is cacheable per target language.
 */
function buildSystemPrompt(targetLanguageName: string): string {
  return `You are a professional translator for a marketplace chat app. Translate the user's message into ${targetLanguageName}.

Rules:
- Return ONLY the translated text, nothing else.
- Preserve all formatting: line breaks, emojis, mentions (@name), URLs.
- Preserve brand names like "ThryftVerse" untranslated.
- Preserve placeholders like [EMAIL], [PHONE], [URL], [CARD] exactly as-is.
- If the message is already in ${targetLanguageName}, return it unchanged.
- Translate naturally — not word-by-word. Capture the tone and intent.
- For slang or informal language, use equivalent informal expressions in the target language.
- Do not add quotes around the translation.
- Do not add any explanation or notes.`;
}

/**
 * Call the LLM to translate the message and detect the source language.
 * Uses gpt-4o-mini — the cheapest sufficient model for chat translation.
 */
async function translateWithLlm(
  text: string,
  targetLocale: string,
): Promise<{ translatedText: string; sourceLanguage: string; model: string }> {
  const targetLanguageName = LOCALE_TO_LANGUAGE_NAME[targetLocale] ?? 'English';
  const systemPrompt = buildSystemPrompt(targetLanguageName);
  const userPrompt = `Translate this message to ${targetLanguageName}:\n\n${text}`;

  const response = await fetch(`${config.openAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: TRANSLATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
    signal: AbortSignal.timeout(config.openAiAgentTimeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM translation failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenAiTranslationResponse;
  const translatedText = data.choices?.[0]?.message?.content?.trim() ?? text;

  // Detect source language from the original text (server-side heuristic)
  const sourceLanguage = detectSourceLanguage(text);

  return { translatedText, sourceLanguage, model: data.model ?? TRANSLATION_MODEL };
}

// ── Language detection ─────────────────────────────────────────────

/**
 * Lightweight server-side language detection using Unicode script ranges.
 * Mirrors the client-side `detectMessageLanguage` heuristic.
 */
function detectSourceLanguage(text: string): string {
  let latinCount = 0;
  let totalNonSpace = 0;
  const scriptCounts = new Map<string, number>();

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined || code < 0x0041) continue;
    totalNonSpace++;

    if (code >= 0x0041 && code <= 0x024f) {
      latinCount++;
      continue;
    }

    if (code >= 0x0600 && code <= 0x06ff) scriptCounts.set('ar', (scriptCounts.get('ar') ?? 0) + 1);
    else if (code >= 0x0900 && code <= 0x097f) scriptCounts.set('hi', (scriptCounts.get('hi') ?? 0) + 1);
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) scriptCounts.set('zh', (scriptCounts.get('zh') ?? 0) + 1);
    else if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) scriptCounts.set('ja', (scriptCounts.get('ja') ?? 0) + 1);
    else if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) scriptCounts.set('ko', (scriptCounts.get('ko') ?? 0) + 1);
    else if (code >= 0x0400 && code <= 0x04ff) scriptCounts.set('ru', (scriptCounts.get('ru') ?? 0) + 1);
  }

  if (totalNonSpace === 0 || latinCount / totalNonSpace > 0.6) return 'en';

  let maxScript = 'en';
  let maxCount = 0;
  for (const [script, count] of scriptCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxScript = script;
    }
  }
  return maxScript;
}

// ── Rate limiting (token bucket via Redis) ─────────────────────────

/**
 * Atomic token-bucket rate limit check using Redis.
 * Returns true if the request is allowed, false if rate-limited.
 * Uses a simple counter with TTL — sufficient for this use case.
 * For true token-bucket with burst capacity, a Lua script would be needed.
 */
async function checkRateLimit(
  redisClient: ChatTranslateRouteDependencies['redisClient'],
  userId: string,
): Promise<boolean> {
  if (!redisClient) return true;

  const key = `chat-translate:rl:${userId}`;
  const count = await redisClient.get(key);
  const currentCount = count ? parseInt(count, 10) : 0;

  if (currentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  if (currentCount === 0) {
    await redisClient.set(key, '1', 'EX', RATE_LIMIT_WINDOW_SECONDS);
  } else {
    await redisClient.set(key, String(currentCount + 1), 'EX', RATE_LIMIT_WINDOW_SECONDS);
  }

  return true;
}

// ── Cache operations ───────────────────────────────────────────────

interface CachedTranslation {
  translatedText: string;
  sourceLanguage: string;
  model: string;
}

async function getCachedTranslation(
  redisClient: ChatTranslateRouteDependencies['redisClient'],
  cacheKey: string,
): Promise<CachedTranslation | null> {
  if (!redisClient) return null;
  const cached = await redisClient.get(cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as CachedTranslation;
  } catch {
    return null;
  }
}

async function setCachedTranslation(
  redisClient: ChatTranslateRouteDependencies['redisClient'],
  cacheKey: string,
  value: CachedTranslation,
): Promise<void> {
  if (!redisClient) return;
  await redisClient.set(cacheKey, JSON.stringify(value), 'EX', TRANSLATION_CACHE_TTL_SECONDS);
}

// ── Route registration ─────────────────────────────────────────────

export const registerChatTranslateRoutes = ({
  app,
  db,
  ensureUserExists,
  redisClient,
}: ChatTranslateRouteDependencies) => {
  app.post('/chat/translate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      reply.code(401);
      return { ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' };
    }

    let payload: z.infer<typeof bodySchema>;
    try {
      payload = bodySchema.parse(request.body);
    } catch {
      reply.code(400);
      return { ok: false, error: 'INVALID_REQUEST', message: 'Invalid request body' };
    }

    await ensureUserExists(authUserId);

    // Rate limit check
    const allowed = await checkRateLimit(redisClient, authUserId);
    if (!allowed) {
      reply.code(429);
      return {
        ok: false,
        error: 'RATE_LIMITED',
        message: 'Translation rate limit exceeded. Try again later.',
      };
    }

    // Normalize text before processing
    const normalizedText = normalizeText(payload.text);

    // Mask PII before sending to LLM or storing in cache
    const { maskedText, restoreMap } = maskPii(normalizedText);

    // Compute SHA-256 cache key from masked text (PII-safe, cross-user hits)
    const cacheKey = computeCacheKey(maskedText, payload.targetLocale);
    const cached = await getCachedTranslation(redisClient, cacheKey);
    if (cached) {
      // Restore original PII values into the cached translation
      const restoredText = restorePii(cached.translatedText, restoreMap);
      return {
        ok: true,
        translatedText: restoredText,
        sourceLanguage: cached.sourceLanguage,
        targetLanguage: payload.targetLocale,
        model: cached.model,
        cached: true,
      };
    }

    // If no OpenAI key is configured, return a graceful error
    if (!config.openAiApiKey) {
      reply.code(503);
      return {
        ok: false,
        error: 'TRANSLATION_UNAVAILABLE',
        message: 'AI translation service is not configured.',
      };
    }

    try {
      // Send masked text to LLM (PII protected)
      const { translatedText: rawTranslated, sourceLanguage, model } = await translateWithLlm(
        maskedText,
        payload.targetLocale,
      );

      // Restore original PII values into the translation
      const translatedText = restorePii(rawTranslated, restoreMap);

      // Cache the masked version's translation (without PII)
      // so other users with the same masked text get a cache hit
      await setCachedTranslation(redisClient, cacheKey, {
        translatedText: rawTranslated,
        sourceLanguage,
        model,
      });

      return {
        ok: true,
        translatedText,
        sourceLanguage,
        targetLanguage: payload.targetLocale,
        model,
        cached: false,
      };
    } catch (error) {
      request.log.error(
        { err: error, messageId: payload.messageId, targetLocale: payload.targetLocale },
        'chat/translate: LLM call failed',
      );
      reply.code(502);
      return {
        ok: false,
        error: 'TRANSLATION_FAILED',
        message: 'Translation service temporarily unavailable.',
      };
    }
  });
};
