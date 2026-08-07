import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  buildAiHealth,
  validateAiDeployReadiness,
  AI_RATE_LIMITS,
  aiCapabilityLabel,
  resolveAiCapabilityLevel,
  type AiHealthCheck,
} from '../lib/aiTruth.js';

/**
 * P0-9: AI/ML truth routes.
 *
 * Public, honest endpoints that report what AI/ML capability this
 * deployment actually has. The frontend reads these to decide whether
 * to label the assistant "AI assistant" vs. "Heuristic assistant" and
 * whether to expose image-classification UI.
 *
 * These routes never expose secrets (API keys, base URLs with tokens).
 * They expose capability flags, labels and guard configuration only.
 */

type AiTruthRouteDependencies = {
  app: FastifyInstance;
  authorizeAdminRequest: (request: FastifyRequest) => boolean;
};

export const registerAiTruthRoutes = ({
  app,
  authorizeAdminRequest,
}: AiTruthRouteDependencies) => {
  /**
   * GET /ai/health
   *
   * Returns the current AI/ML capability snapshot. Probes the provider
   * and decision service. Publicly readable so the frontend can decide
   * how to label the assistant before the user opens a conversation.
   */
  app.get('/ai/health', async () => {
    const health = await buildAiHealth(false);
    return { ok: true, health };
  });

  /**
   * GET /ai/capability
   *
   * Lightweight capability summary — no network probes. Returns the
   * configured state only. Use this on app cold-start where probing
   * would block the launch screen.
   */
  app.get('/ai/capability', async () => {
    const health = await buildAiHealth(true);
    return {
      ok: true,
      capabilityLevel: health.capabilityLevel,
      label: health.label,
      capabilities: health.capabilities,
      imageClassificationAvailable: health.imageClassificationAvailable,
      configuredModel: health.configuredModel,
    };
  });

  /**
   * GET /ai/deploy-readiness
   *
   * Admin-only deploy validation. Returns blocking errors and warnings
   * that prevent the deployment from claiming AI capability. Intended
   * for the deploy pipeline and for ops dashboards.
   */
  app.get('/ai/deploy-readiness', async (request, reply) => {
    if (!authorizeAdminRequest(request)) {
      reply.code(403);
      return {
        ok: false,
        error: 'Administrator and security-token authorization are required',
        code: 'AI_DEPLOY_READINESS_FORBIDDEN',
      };
    }
    const result = await validateAiDeployReadiness();
    return result;
  });

  /**
   * GET /ai/labels
   *
   * Returns the honest UI labels for each capability level. The
   * frontend uses these so the product never markets heuristic
   * baselines as trained ML.
   */
  app.get('/ai/labels', async () => {
    return {
      ok: true,
      labels: {
        provider_backed: aiCapabilityLabel('provider_backed'),
        heuristic_baseline: aiCapabilityLabel('heuristic_baseline'),
        unavailable: aiCapabilityLabel('unavailable'),
      },
      // The product must never use these phrases for heuristic baselines.
      forbiddenForHeuristicBaseline: [
        'AI-powered',
        'AI powered',
        'AI-driven',
        'AI driven',
        'trained ML',
        'trained model',
        'machine learning',
        'neural network',
      ],
    };
  });

  /**
   * GET /ai/guards
   *
   * Returns the active rate-limit / cost / retry guard configuration.
   * Non-secret. The frontend uses this to surface honest "you have N
   * assistant messages left this hour" indicators.
   */
  app.get('/ai/guards', async () => {
    return {
      ok: true,
      guards: {
        perUserPerHourLimit: AI_RATE_LIMITS.perUserPerHour,
        perConversationPerHourLimit: AI_RATE_LIMITS.perConversationPerHour,
        maxRetries: AI_RATE_LIMITS.maxRetries,
        maxOutputTokens: AI_RATE_LIMITS.hardMaxOutputTokens,
        defaultConfidenceThreshold: AI_RATE_LIMITS.defaultConfidenceThreshold,
      },
    };
  });

  /**
   * POST /ai/classify-image
   *
   * P0-9: Image classification gate. The decision baseline service
   * returns 501 on /classify-image and no real provider is wired. This
   * endpoint honestly refuses rather than pretending to classify. When
   * a real provider is wired, replace the body with a real call and
   * flip `imageClassificationAvailable` in `aiTruth.ts`.
   */
  app.post('/ai/classify-image', async (_request, reply) => {
    reply.code(501);
    return {
      ok: false,
      error: 'Image classification is not available on this deployment.',
      capabilityLevel: resolveAiCapabilityLevel(false, false),
      label: aiCapabilityLabel('unavailable'),
    };
  });
};

export type { AiHealthCheck };
