import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from './logger.js';

export interface AuditLogEntry {
  id: string;
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  admin_user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AdminAuditLogInput {
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Logs an administrative action to the admin_audit_logs table. This
 * function never throws — errors are logged but do not block the
 * calling operation (fire-and-forget).
 */
export async function logAdminAction(db: Pool, entry: AdminAuditLogInput): Promise<void> {
  const id = crypto.randomUUID();
  const metadata = entry.metadata ?? {};

  try {
    await db.query(
      `
        INSERT INTO admin_audit_logs
          (id, admin_user_id, action, resource_type, resource_id, metadata, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        entry.adminUserId,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        JSON.stringify(metadata),
        entry.ipAddress ?? null,
      ],
    );
  } catch (err) {
    logger.warn(
      {
        err: (err as Error).message,
        adminUserId: entry.adminUserId,
        action: entry.action,
        resourceType: entry.resourceType,
      },
      '[auditLog] failed to log admin action',
    );
  }
}

export interface AuditLogQueryFilters {
  adminUserId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Queries admin audit logs with optional filters and pagination.
 * Returns matching entries and the total count for pagination.
 */
export async function queryAuditLogs(
  db: Pool,
  filters: AuditLogQueryFilters,
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.adminUserId) {
    conditions.push(`admin_user_id = $${paramIndex}`);
    params.push(filters.adminUserId);
    paramIndex += 1;
  }

  if (filters.action) {
    conditions.push(`action = $${paramIndex}`);
    params.push(filters.action);
    paramIndex += 1;
  }

  if (filters.resourceType) {
    conditions.push(`resource_type = $${paramIndex}`);
    params.push(filters.resourceType);
    paramIndex += 1;
  }

  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(filters.startDate.toISOString());
    paramIndex += 1;
  }

  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(filters.endDate.toISOString());
    paramIndex += 1;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM admin_audit_logs ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataParams = [...params, limit, offset];
  const dataResult = await db.query<AuditLogRow>(
    `
      SELECT id, admin_user_id, action, resource_type, resource_id,
             metadata, ip_address, created_at
      FROM admin_audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    dataParams,
  );

  const entries: AuditLogEntry[] = dataResult.rows.map((row) => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }));

  return { entries, total };
}
