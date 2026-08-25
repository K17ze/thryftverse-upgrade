import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  decryptJsonPayload,
  encryptJsonPayload,
} from '../lib/keyService.js';

type SecureProfilesRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  ensureUserExists: (userId: string) => Promise<void>;
};

export const registerSecureProfilesRoutes = ({
  app,
  db,
  ensureUserExists,
}: SecureProfilesRouteDependencies) => {
  app.post('/secure-profiles', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      userId: z.string().min(2),
      fullName: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(6).max(40).optional(),
      address: z.string().min(5).max(220).optional(),
      countryCode: z.string().length(2).optional(),
      preferences: z.array(z.string().min(2).max(60)).max(20).optional(),
    });

    const payload = bodySchema.parse(request.body);
    await ensureUserExists(payload.userId);

    const aad = `secure-profile:${payload.userId}`;
    const encrypted = await encryptJsonPayload(
      'profile',
      {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        countryCode: payload.countryCode,
        preferences: payload.preferences ?? [],
        updatedAt: new Date().toISOString(),
      },
      aad
    );

    await db.query(
      `
      INSERT INTO user_secure_profiles (user_id, ciphertext, key_version)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE
      SET ciphertext = EXCLUDED.ciphertext,
          key_version = EXCLUDED.key_version,
          updated_at = NOW()
    `,
      [payload.userId, encrypted.ciphertext, encrypted.keyVersion]
    );

    reply.code(201);
    return {
      ok: true,
      userId: payload.userId,
      keyVersion: encrypted.keyVersion,
    };
  });

  app.get('/secure-profiles/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ userId: z.string().min(2) });
    const { userId } = paramsSchema.parse(request.params);

    const result = await db.query<{
      user_id: string;
      ciphertext: string;
      key_version: number;
      updated_at: string;
    }>(
      `
      SELECT user_id, ciphertext, key_version, updated_at
      FROM user_secure_profiles
      WHERE user_id = $1
      LIMIT 1
    `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      reply.code(404);
      return { ok: false, error: 'Secure profile not found' };
    }

    const profile = await decryptJsonPayload<{
      fullName: string;
      email: string;
      phone?: string;
      address?: string;
      countryCode?: string;
      preferences?: string[];
      updatedAt?: string;
    }>(row.ciphertext, `secure-profile:${userId}`);

    return {
      ok: true,
      userId,
      keyVersion: row.key_version,
      storedAt: row.updated_at,
      profile,
    };
  });
};
