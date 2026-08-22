import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type PoliciesRouteDependencies = {
  app: FastifyInstance;
  readDb: Pool;
};

export const registerPoliciesRoutes = ({ app, readDb }: PoliciesRouteDependencies) => {
  // T04: Policy/protection versioning — authoritative policy endpoint.
  // Returns the currently published version of a policy document by key.
  // The product detail screen references this instead of hardcoding terms.
  app.get('/policies/:policyKey', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ policyKey: z.string().min(2).max(80) });
    const { policyKey } = paramsSchema.parse(request.params);

    let policyRow: {
      id: string;
      version: number;
      title: string;
      summary: string;
      body: string;
      jurisdiction: string | null;
      effective_at: string;
      published_at: string | null;
    } | null = null;

    try {
      const result = await readDb.query<{
        id: string;
        version: number;
        title: string;
        summary: string;
        body: string;
        jurisdiction: string | null;
        effective_at: string;
        published_at: string | null;
      }>(
        `
        SELECT id, version, title, summary, body, jurisdiction, effective_at, published_at
        FROM policy_documents
        WHERE policy_key = $1 AND status = 'published'
        ORDER BY version DESC
        LIMIT 1
      `,
        [policyKey]
      );
      policyRow = result.rows[0] ?? null;
    } catch {
      // Table may not exist yet — fall through to null.
      policyRow = null;
    }

    if (!policyRow) {
      reply.code(404);
      return { ok: false, error: 'Policy not found', code: 'POLICY_NOT_FOUND' };
    }

    return {
      ok: true,
      policy: {
        id: policyRow.id,
        policyKey,
        version: policyRow.version,
        title: policyRow.title,
        summary: policyRow.summary,
        body: policyRow.body,
        jurisdiction: policyRow.jurisdiction,
        effectiveAt: policyRow.effective_at,
        publishedAt: policyRow.published_at,
      },
    };
  });
};
