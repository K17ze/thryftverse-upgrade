import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { assertUploadPolicy, createUploadUrl } from '../lib/s3.js';

type UploadRouteDependencies = {
  app: FastifyInstance;
  createApiError: (code: string, message: string) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
  folder: z
    .enum([
      'uploads',
      'listings',
      'avatars',
      'covers',
      'posters',
      'looks',
      'evidence',
      'review',
      'smoke',
    ])
    .default('uploads'),
});

export const registerUploadRoutes = ({
  app,
  createApiError,
  resolveAuthenticatedUserId,
}: UploadRouteDependencies) => {
  app.post('/uploads/presign', async (request) => {
    const payload = uploadRequestSchema.parse(request.body);
    const actorUserId = resolveAuthenticatedUserId(request);
    if (payload.folder === 'smoke' && config.nodeEnv === 'production') {
      throw createApiError(
        'UPLOAD_INVALID',
        'The smoke upload namespace is unavailable in production'
      );
    }

    try {
      assertUploadPolicy(payload.contentType, payload.sizeBytes);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      if (reason === 'UPLOAD_CONTENT_TYPE_NOT_ALLOWED') {
        throw createApiError('UPLOAD_INVALID', 'This media type is not allowed');
      }
      if (reason === 'UPLOAD_SIZE_NOT_ALLOWED') {
        throw createApiError(
          'UPLOAD_INVALID',
          'This file exceeds the upload limit for its media type'
        );
      }
      throw error;
    }

    const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${payload.folder}/${actorUserId}/${crypto.randomUUID()}_${safeName}`;
    return createUploadUrl(key, payload.contentType, payload.sizeBytes);
  });
};
