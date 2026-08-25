import type { Pool } from 'pg';
import { deleteObject } from './s3.js';
import { logger } from './logger.js';

const GRACE_PERIOD_HOURS = 24;

interface MediaAssetRow {
  id: string;
  object_key: string;
  declared_size_bytes: number;
}

export async function runMediaGarbageCollection(
  db: Pool,
): Promise<{ objectsDeleted: number; bytesFreed: number }> {
  const candidates = await db.query<MediaAssetRow>(
    `
      SELECT id, object_key, declared_size_bytes
      FROM media_assets
      WHERE status IN ('deleted', 'orphaned')
        AND (deleted_at IS NULL OR deleted_at < NOW() - INTERVAL '${GRACE_PERIOD_HOURS} hours')
        AND updated_at < NOW() - INTERVAL '${GRACE_PERIOD_HOURS} hours'
    `,
  );

  let objectsDeleted = 0;
  let bytesFreed = 0;

  for (const asset of candidates.rows) {
    const activeBindings = await db.query<{ count: string }>(
      `
        SELECT COUNT(*)::TEXT AS count
        FROM media_bindings
        WHERE media_asset_id = $1 AND removed_at IS NULL
      `,
      [asset.id],
    );

    const bindingCount = parseInt(activeBindings.rows[0]?.count ?? '0', 10);
    if (bindingCount > 0) {
      continue;
    }

    try {
      await deleteObject(asset.object_key);

      await db.query('DELETE FROM media_derivatives WHERE media_asset_id = $1', [
        asset.id,
      ]);
      await db.query('DELETE FROM media_assets WHERE id = $1', [asset.id]);

      objectsDeleted++;
      bytesFreed += asset.declared_size_bytes;

      logger.info(
        { assetId: asset.id, objectKey: asset.object_key },
        'mediaGc.deleted',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { assetId: asset.id, objectKey: asset.object_key, err: message },
        'mediaGc.deleteFailed',
      );
    }
  }

  logger.info(
    { objectsDeleted, bytesFreed },
    'mediaGc.complete',
  );

  return { objectsDeleted, bytesFreed };
}
