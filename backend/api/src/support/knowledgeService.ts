import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type {
  ArticleAudience,
  SupportArticle,
  SupportArticleVersion,
  SupportKnowledgeSearchResult,
} from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface SupportArticleVersionRow {
  id: string;
  article_id: string;
  version: number;
  title: string;
  body_markdown: string;
  jurisdiction: string | null;
  effective_from: string;
  effective_to: string | null;
  approved_by: string | null;
  approved_at: string | null;
  checksum: string;
  created_at: string;
}

interface KnowledgeSearchRow {
  article_id: string;
  article_version_id: string;
  title: string;
  snippet: string;
  section_anchor: string | null;
  effective_date: string;
  jurisdiction: string | null;
  audience: ArticleAudience;
  rank: number;
}

interface ArticleWithVersionRow {
  art_id: string;
  art_slug: string;
  art_product_area: string;
  art_owner_team: string;
  art_audience: ArticleAudience;
  art_default_locale: string;
  art_state: string;
  art_created_at: string;
  art_updated_at: string;
  ver_id: string;
  ver_article_id: string;
  ver_version: number;
  ver_title: string;
  ver_body_markdown: string;
  ver_jurisdiction: string | null;
  ver_effective_from: string;
  ver_effective_to: string | null;
  ver_approved_by: string | null;
  ver_approved_at: string | null;
  ver_checksum: string;
  ver_created_at: string;
}

// ── Serializers ──

function serializeArticleVersion(row: SupportArticleVersionRow): SupportArticleVersion {
  return {
    id: row.id,
    articleId: row.article_id,
    version: row.version,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    jurisdiction: row.jurisdiction,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    checksum: row.checksum,
    createdAt: row.created_at,
  };
}

// ── Options ──

export interface KnowledgeSearchOptions {
  audience?: ArticleAudience;
  jurisdiction?: string;
  limit?: number;
}

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

function clampSearchLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT);
}

// ── Public API ──

/**
 * Lexical search over published knowledge articles. Uses
 * `websearch_to_tsquery('english', $1)` against the generated `search_vec`
 * column on `support_article_chunks`, joins to the currently-effective article
 * version (`effective_to IS NULL`) and published articles. Results are ranked
 * by `ts_rank_cd`. Optional audience and jurisdiction filters are applied.
 */
export async function searchKnowledge(
  db: Pool,
  query: string,
  opts: KnowledgeSearchOptions = {},
): Promise<SupportKnowledgeSearchResult[]> {
  const limit = clampSearchLimit(opts.limit);

  const conditions: string[] = [
    "a.state = 'published'",
    'av.effective_to IS NULL',
    "c.search_vec @@ websearch_to_tsquery('english', $1)",
  ];
  const params: unknown[] = [query];
  let paramIndex = 2;

  if (opts.audience) {
    conditions.push(`a.audience = $${paramIndex}`);
    params.push(opts.audience);
    paramIndex += 1;
  }

  if (opts.jurisdiction) {
    // Match either the requested jurisdiction or jurisdiction-null (global).
    conditions.push(`(av.jurisdiction = $${paramIndex} OR av.jurisdiction IS NULL)`);
    params.push(opts.jurisdiction);
    paramIndex += 1;
  }

  params.push(limit);

  const result = await db.query<KnowledgeSearchRow>(
    `
      SELECT
        a.id AS article_id,
        av.id AS article_version_id,
        av.title,
        LEFT(c.text, 280) AS snippet,
        CAST(c.ordinal AS TEXT) AS section_anchor,
        av.effective_from AS effective_date,
        av.jurisdiction,
        a.audience,
        ts_rank_cd(c.search_vec, websearch_to_tsquery('english', $1)) AS rank
      FROM support_article_chunks c
      JOIN support_article_versions av ON av.id = c.article_version_id
      JOIN support_articles a ON a.id = av.article_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY rank DESC, av.effective_from DESC
      LIMIT $${paramIndex}
    `,
    params,
  );

  return result.rows.map((row) => ({
    articleId: row.article_id,
    articleVersionId: row.article_version_id,
    title: row.title,
    snippet: row.snippet,
    sectionAnchor: row.section_anchor,
    effectiveDate: row.effective_date,
    jurisdiction: row.jurisdiction,
    audience: row.audience,
    rank: Number(row.rank),
  }));
}

/**
 * Returns the latest published version of an article identified by slug,
 * together with the article metadata. Returns null if the article does not
 * exist or is not published.
 */
export async function getArticleBySlug(
  db: Pool,
  slug: string,
): Promise<{ article: SupportArticle; version: SupportArticleVersion } | null> {
  const result = await db.query<ArticleWithVersionRow>(
    `
      SELECT
        a.id AS art_id,
        a.slug AS art_slug,
        a.product_area AS art_product_area,
        a.owner_team AS art_owner_team,
        a.audience AS art_audience,
        a.default_locale AS art_default_locale,
        a.state AS art_state,
        a.created_at AS art_created_at,
        a.updated_at AS art_updated_at,
        av.id AS ver_id,
        av.article_id AS ver_article_id,
        av.version AS ver_version,
        av.title AS ver_title,
        av.body_markdown AS ver_body_markdown,
        av.jurisdiction AS ver_jurisdiction,
        av.effective_from AS ver_effective_from,
        av.effective_to AS ver_effective_to,
        av.approved_by AS ver_approved_by,
        av.approved_at AS ver_approved_at,
        av.checksum AS ver_checksum,
        av.created_at AS ver_created_at
      FROM support_articles a
      JOIN support_article_versions av ON av.article_id = a.id
      WHERE a.slug = $1
        AND a.state = 'published'
        AND av.effective_to IS NULL
      ORDER BY av.effective_from DESC, av.version DESC
      LIMIT 1
    `,
    [slug],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const article: SupportArticle = {
    id: row.art_id,
    slug: row.art_slug,
    productArea: row.art_product_area,
    ownerTeam: row.art_owner_team,
    audience: row.art_audience,
    defaultLocale: row.art_default_locale,
    state: row.art_state as SupportArticle['state'],
    createdAt: row.art_created_at,
    updatedAt: row.art_updated_at,
  };
  const version: SupportArticleVersion = {
    id: row.ver_id,
    articleId: row.ver_article_id,
    version: row.ver_version,
    title: row.ver_title,
    bodyMarkdown: row.ver_body_markdown,
    jurisdiction: row.ver_jurisdiction,
    effectiveFrom: row.ver_effective_from,
    effectiveTo: row.ver_effective_to,
    approvedBy: row.ver_approved_by,
    approvedAt: row.ver_approved_at,
    checksum: row.ver_checksum,
    createdAt: row.ver_created_at,
  };

  return { article, version };
}

/**
 * Returns a specific article version by id, or null if not found.
 */
export async function getArticleVersion(
  db: Pool,
  articleVersionId: string,
): Promise<SupportArticleVersion | null> {
  const result = await db.query<SupportArticleVersionRow>(
    `
      SELECT id, article_id, version, title, body_markdown, jurisdiction,
             effective_from, effective_to, approved_by, approved_at, checksum,
             created_at
      FROM support_article_versions
      WHERE id = $1
    `,
    [articleVersionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeArticleVersion(result.rows[0]);
}

export { logger };
