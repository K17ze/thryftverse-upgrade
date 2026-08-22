import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../lib/auth.js';
import { z } from 'zod';

type KeyName = 'profile' | 'message' | 'wallet';

type SecurityRouteDependencies = {
  app: FastifyInstance;
  ensureSecurityAdminAccess: (
    request: {
      headers: Record<string, string | string[] | undefined>;
      authUser?: AuthenticatedUser;
    },
    reply: { code: (statusCode: number) => unknown },
  ) => { ok: false; error: string } | null;
  rotateKeyVersion: (keyName: KeyName) => Promise<{ keyName: string; keyVersion: number }>;
  rewrapDomainRows: (
    keyName: KeyName,
    keyVersion: number,
    maxRows: number,
  ) => Promise<{ rowsScanned: number; rowsRewrapped: number }>;
};

export const registerSecurityRoutes = ({
  app,
  ensureSecurityAdminAccess,
  rotateKeyVersion,
  rewrapDomainRows,
}: SecurityRouteDependencies) => {
  app.post('/security/keys/:keyName/rotate', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({
      keyName: z.enum(['profile', 'message', 'wallet']),
    });
    const bodySchema = z.object({
      rewrapExisting: z.boolean().default(true),
      maxRows: z.number().int().min(1).max(5000).default(1000),
    });

    const { keyName } = paramsSchema.parse(request.params);
    const payload = bodySchema.parse(request.body ?? {});

    const securityAdminError = ensureSecurityAdminAccess(request, reply);
    if (securityAdminError) {
      return securityAdminError;
    }

    try {
      const rotated = await rotateKeyVersion(keyName);
      let rewrap = { rowsScanned: 0, rowsRewrapped: 0 };

      if (payload.rewrapExisting) {
        rewrap = await rewrapDomainRows(keyName, rotated.keyVersion, payload.maxRows);
      }

      return {
        ok: true,
        keyName,
        keyVersion: rotated.keyVersion,
        rewrap,
      };
    } catch (error) {
      reply.code(502);
      return {
        ok: false,
        error: `Key rotation failed: ${(error as Error).message}`,
      };
    }
  });
};
