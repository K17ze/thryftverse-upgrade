import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type TaxonomyRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
};

interface TaxonomyNodeRow {
  id: string;
  name: string;
  display_key: string;
  type: string;
  parent_id: string | null;
  sort_order: number;
  synonyms: string[];
}

interface TaxonomyNodeResponse {
  id: string;
  name: string;
  displayKey: string;
  type: 'category' | 'condition' | 'size' | 'brand' | 'colour' | 'material';
  parentId: string | null;
  sortOrder: number;
  synonyms: string[];
}

function mapRow(row: TaxonomyNodeRow): TaxonomyNodeResponse {
  return {
    id: row.id,
    name: row.name,
    displayKey: row.display_key,
    type: row.type as TaxonomyNodeResponse['type'],
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    synonyms: row.synonyms,
  };
}

export const registerTaxonomyRoutes = ({ app, db }: TaxonomyRouteDependencies) => {
  app.get('/taxonomy', async (_request: FastifyRequest, reply: FastifyReply) => {
    let rows: TaxonomyNodeRow[] = [];

    try {
      const result = await db.query<TaxonomyNodeRow>(
        `SELECT id, name, display_key, type, parent_id, sort_order, synonyms
         FROM taxonomy_nodes
         WHERE is_active = true
         ORDER BY type, sort_order, name`
      );
      rows = result.rows;
    } catch {
      reply.code(503);
      return {
        ok: false,
        error: 'Taxonomy table not available. Run migrations first.',
        code: 'TAXONOMY_UNAVAILABLE',
      };
    }

    return {
      ok: true,
      nodes: rows.map(mapRow),
    };
  });

  app.get('/taxonomy/:type', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({
      type: z.enum(['category', 'condition', 'size', 'brand', 'colour', 'material']),
    });

    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid taxonomy type',
        code: 'INVALID_TAXONOMY_TYPE',
      };
    }

    const { type } = parsed.data;

    let rows: TaxonomyNodeRow[] = [];

    try {
      const result = await db.query<TaxonomyNodeRow>(
        `SELECT id, name, display_key, type, parent_id, sort_order, synonyms
         FROM taxonomy_nodes
         WHERE is_active = true AND type = $1
         ORDER BY sort_order, name`,
        [type]
      );
      rows = result.rows;
    } catch {
      reply.code(503);
      return {
        ok: false,
        error: 'Taxonomy table not available. Run migrations first.',
        code: 'TAXONOMY_UNAVAILABLE',
      };
    }

    return {
      ok: true,
      nodes: rows.map(mapRow),
    };
  });
};
