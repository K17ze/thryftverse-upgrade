import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { categoryAliasTerms } from '../lib/taxonomyValidation.js';

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

  // GET /taxonomy/category-directory — the browse index the web /categories
  // page and department nav read: every top-level category with its live
  // listing count, a cover borrowed from its newest active listing, and
  // counted children. l.category/l.subcategory are mixed-vocabulary columns
  // (display names from mobile, node ids from web), so counts resolve
  // through the alias map rather than comparing one spelling.
  app.get('/taxonomy/category-directory', async (_request: FastifyRequest, reply: FastifyReply) => {
    let nodes: TaxonomyNodeRow[] = [];
    try {
      const result = await db.query<TaxonomyNodeRow>(
        `SELECT id, name, display_key, type, parent_id, sort_order, synonyms
         FROM taxonomy_nodes
         WHERE is_active = true AND type = 'category'
         ORDER BY sort_order, name`,
      );
      nodes = result.rows;
    } catch {
      reply.code(503);
      return {
        ok: false,
        error: 'Taxonomy table not available. Run migrations first.',
        code: 'TAXONOMY_UNAVAILABLE',
      };
    }

    const topLevel = nodes.filter((n) => n.parent_id === null);
    const childrenByParent = new Map<string, TaxonomyNodeRow[]>();
    for (const n of nodes) {
      if (!n.parent_id) continue;
      const list = childrenByParent.get(n.parent_id) ?? [];
      list.push(n);
      childrenByParent.set(n.parent_id, list);
    }

    const directory = await Promise.all(
      topLevel.map(async (node) => {
        // Storable spellings for this node — id / display_key / name —
        // so counts cover rows written by either client.
        const terms = await categoryAliasTerms(db, node.id);
        const countResult = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM listings
           WHERE status = 'active' AND LOWER(category) = ANY($1)`,
          [terms],
        );
        const coverResult = await db.query<{ image_url: string | null }>(
          `SELECT image_url FROM listings
           WHERE status = 'active' AND LOWER(category) = ANY($1)
             AND image_url IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
          [terms],
        );
        const children = await Promise.all(
          (childrenByParent.get(node.id) ?? []).map(async (child) => {
            const childTerms = await categoryAliasTerms(db, child.id);
            // Subcategory rows store the CHILD spelling in l.subcategory —
            // substring match covers 'women-clothing' ids and 'Clothing'
            // display names alike.
            const subResult = await db.query<{ count: string }>(
              `SELECT COUNT(*)::text AS count FROM listings
               WHERE status = 'active'
                 AND LOWER(category) = ANY($1)
                 AND subcategory ILIKE ANY($2)`,
              [terms, childTerms.map((t) => `%${t}%`)],
            );
            return {
              id: child.id,
              name: child.name,
              displayKey: child.display_key,
              count: Number(subResult.rows[0]?.count ?? 0),
            };
          }),
        );
        return {
          id: node.id,
          name: node.name,
          displayKey: node.display_key,
          sortOrder: node.sort_order,
          count: Number(countResult.rows[0]?.count ?? 0),
          cover: coverResult.rows[0]?.image_url ?? null,
          children,
        };
      }),
    );

    return { ok: true, directory };
  });
};
