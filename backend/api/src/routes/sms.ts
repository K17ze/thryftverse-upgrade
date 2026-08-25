import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { sendSms } from '../lib/sms/smsProvider.js';
import {
  sendSecurityCode,
  isValidE164PhoneNumber,
} from '../lib/sms/notificationService.js';
import {
  renderSmsTemplate,
  type SmsTemplate,
  type SmsTemplateParams,
} from '../lib/sms/templates.js';

type SmsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
};

const forbidden = (reply: FastifyReply) => {
  reply.code(403);
  return { ok: false, error: 'Forbidden: admin role required', code: 'FORBIDDEN' };
};

const sendSmsBodySchema = z.object({
  to: z.string().min(8).max(20),
  template: z.enum([
    'ORDER_SHIPPED',
    'ORDER_DELIVERED',
    'ORDER_EXCEPTION',
    'SECURITY_CODE',
    'ACCOUNT_ALERT',
  ]) as z.ZodType<SmsTemplate>,
  params: z.record(z.unknown()),
});

const securityCodeBodySchema = z.object({
  phoneNumber: z.string().min(8).max(20),
});

const messageIdParamsSchema = z.object({
  messageId: z.string().min(3).max(180),
});

const SECURITY_CODE_RATE_LIMIT_MS = 60_000;
const securityCodeLastSent = new Map<string, number>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const lastSent = securityCodeLastSent.get(userId);
  if (lastSent !== undefined && now - lastSent < SECURITY_CODE_RATE_LIMIT_MS) {
    return true;
  }
  securityCodeLastSent.set(userId, now);
  return false;
}

export const registerSmsRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: SmsRouteDependencies) => {
  app.post('/sms/send', async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }
    if (request.authUser.role !== 'admin') {
      return forbidden(reply);
    }

    const payload = sendSmsBodySchema.parse(request.body ?? {});
    if (!isValidE164PhoneNumber(payload.to)) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid phone number (must be E.164: + and 8-15 digits)',
        code: 'INVALID_PHONE_NUMBER',
      };
    }

    const template = payload.template;
    const params = payload.params as unknown as SmsTemplateParams[SmsTemplate];
    const body = renderSmsTemplate(template, params);

    const result = await sendSms({ to: payload.to, body });

    if (!result.success) {
      reply.code(502);
      return {
        ok: false,
        error: result.error ?? 'SMS provider error',
        provider: result.provider,
      };
    }

    reply.code(202);
    return {
      ok: true,
      messageId: result.messageId,
      provider: result.provider,
    };
  });

  app.post('/sms/security-code', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const payload = securityCodeBodySchema.parse(request.body ?? {});

    if (!isValidE164PhoneNumber(payload.phoneNumber)) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid phone number (must be E.164: + and 8-15 digits)',
        code: 'INVALID_PHONE_NUMBER',
      };
    }

    if (isRateLimited(userId)) {
      reply.code(429);
      return {
        ok: false,
        error: `Rate limit: wait ${SECURITY_CODE_RATE_LIMIT_MS / 1000}s between security code requests`,
        code: 'RATE_LIMITED',
      };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const result = await sendSecurityCode(payload.phoneNumber, code);

    if (!result.success) {
      reply.code(502);
      return { ok: false, error: result.error ?? 'SMS provider error' };
    }

    reply.code(202);
    return { ok: true, status: 'sent' };
  });

  app.get('/sms/status/:messageId', async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }
    if (request.authUser.role !== 'admin') {
      return forbidden(reply);
    }

    const { messageId } = messageIdParamsSchema.parse(request.params);

    return {
      ok: true,
      messageId,
      status: 'unknown',
      note: 'Twilio callback webhooks are not configured; delivery status is unavailable.',
    };
  });
};
