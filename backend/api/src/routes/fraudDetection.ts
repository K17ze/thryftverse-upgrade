/**
 * Fraud detection API routes.
 *
 * Exposes endpoints for checking events, retrieving risk scores and
 * signals, and submitting user-facing fraud reports.
 *
 * - POST /fraud/check — check an event (admin/internal)
 * - GET  /fraud/score/:userId — get current risk score for a user
 * - GET  /fraud/signals/:userId — get risk signals for a user
 * - POST /fraud/report — report a fraudulent event (user-facing, authenticated)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import {
  checkFraud,
  getUserRiskProfile,
  getUserRiskSignals,
  submitFraudReport,
  type FraudEventType,
  type VelocityLimits,
  DEFAULT_VELOCITY_LIMITS,
} from '../lib/fraudDetection.js';

export interface FraudRouteDependencies {
  app: FastifyInstance;
  redis: Redis;
}

const checkEventSchema = z.object({
  eventType: z.enum(['signup', 'listing', 'message', 'transaction']),
  userId: z.string().min(2).max(120).optional(),
  email: z.string().email().max(320).optional(),
  accountAgeSeconds: z.number().min(0).optional(),
  amountGbp: z.number().min(0).optional(),
  headers: z.record(z.string()).optional(),
  ip: z.string().min(1).max(80),
  velocityOverrides: z
    .object({
      accountCreationMax: z.number().int().min(1).optional(),
      listingCreationMax: z.number().int().min(1).optional(),
      messageMax: z.number().int().min(1).optional(),
      loginAttemptMax: z.number().int().min(1).optional(),
      windowSeconds: z.number().int().min(60).optional(),
    })
    .optional(),
});

const reportSchema = z.object({
  reportedUserId: z.string().min(2).max(120),
  eventType: z.enum(['signup', 'listing', 'message', 'transaction']),
  reason: z.string().trim().min(3).max(500),
  details: z.string().max(2000).optional(),
  referenceId: z.string().min(2).max(120).optional(),
});

const userIdParamsSchema = z.object({
  userId: z.string().min(2).max(120),
});

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
};

const forbidden = (reply: FastifyReply) => {
  reply.code(403);
  return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
};

export const registerFraudDetectionRoutes = ({
  app,
  redis,
}: FraudRouteDependencies) => {
  /**
   * POST /fraud/check
   *
   * Check an event for fraud risk. Intended for admin/internal use —
   * requires admin role. Returns the full risk assessment with
   * explainable signals.
   */
  app.post('/fraud/check', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }
    if (authUser.role !== 'admin') {
      return forbidden(reply);
    }

    const payload = checkEventSchema.parse(request.body ?? {});

    // Merge request headers with any explicitly provided headers
    const requestHeaders: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      requestHeaders[key] = value;
    }
    if (payload.headers) {
      for (const [key, value] of Object.entries(payload.headers)) {
        if (!requestHeaders[key.toLowerCase()]) {
          requestHeaders[key.toLowerCase()] = value;
        }
      }
    }

    const limits: VelocityLimits = {
      ...DEFAULT_VELOCITY_LIMITS,
      ...payload.velocityOverrides,
    };

    const result = await checkFraud(
      redis,
      {
        eventType: payload.eventType as FraudEventType,
        userId: payload.userId,
        email: payload.email,
        accountAgeSeconds: payload.accountAgeSeconds,
        amountGbp: payload.amountGbp,
        headers: requestHeaders,
        ip: payload.ip,
        velocityOverrides: payload.velocityOverrides,
      },
      limits
    );

    return {
      ok: true,
      result: {
        eventId: result.eventId,
        eventType: result.eventType,
        userId: result.userId,
        deviceFingerprint: result.deviceFingerprint,
        ipAddress: result.ipAddress,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        action: result.action,
        signals: result.signals,
        checkedAt: result.checkedAt,
      },
    };
  });

  /**
   * GET /fraud/score/:userId
   *
   * Get the current risk score and profile for a user. Admins can
   * query any user; regular users can only query their own score.
   */
  app.get('/fraud/score/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }

    const { userId } = userIdParamsSchema.parse(request.params);

    if (authUser.role !== 'admin' && userId !== authUser.userId) {
      return forbidden(reply);
    }

    const profile = await getUserRiskProfile(redis, userId);

    if (!profile) {
      return {
        ok: true,
        profile: null,
        message: 'No fraud checks have been recorded for this user',
      };
    }

    return {
      ok: true,
      profile: {
        userId: profile.userId,
        currentScore: profile.currentScore,
        riskLevel: profile.riskLevel,
        lastCheckedAt: profile.lastCheckedAt,
        eventCount: profile.eventCount,
        deviceFingerprints: profile.deviceFingerprints,
      },
    };
  });

  /**
   * GET /fraud/signals/:userId
   *
   * Get the aggregated risk signals for a user from recent fraud checks.
   * Admins can query any user; regular users can only query their own.
   */
  app.get('/fraud/signals/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }

    const { userId } = userIdParamsSchema.parse(request.params);

    if (authUser.role !== 'admin' && userId !== authUser.userId) {
      return forbidden(reply);
    }

    const signals = await getUserRiskSignals(redis, userId);

    return {
      ok: true,
      userId,
      signals,
    };
  });

  /**
   * POST /fraud/report
   *
   * Submit a user-facing fraud report. Any authenticated user can
   * report another user for fraudulent activity. Reports are stored
   * for moderator review.
   */
  app.post('/fraud/report', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }

    const payload = reportSchema.parse(request.body ?? {});

    if (payload.reportedUserId === authUser.userId) {
      reply.code(400);
      return { ok: false, error: 'Cannot report yourself', code: 'SELF_REPORT' };
    }

    const result = await submitFraudReport(redis, {
      reporterUserId: authUser.userId,
      reportedUserId: payload.reportedUserId,
      eventType: payload.eventType as FraudEventType,
      reason: payload.reason,
      details: payload.details,
      referenceId: payload.referenceId,
    });

    reply.code(201);
    return {
      ok: true,
      reportId: result.reportId,
      status: result.status,
      createdAt: result.createdAt,
    };
  });
};
