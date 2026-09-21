import crypto from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { appendDomainEvent } from './domainOutbox.js';
import { logger } from './logger.js';
import {
  listingTextGateAction,
  moderateListingText,
} from './moderation/moderationService.js';
import {
  validateListingAttributes,
  type AttributeValidationError,
  type ListingAttributes,
} from './categoryAttributes.js';

/**
 * Structured category attributes (listings.attributes JSONB, migration
 * 326) — scalar label/value pairs validated against the category-attribute
 * registry in lib/categoryAttributes.ts.
 */
export const listingAttributesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

// ── Field patch contract ────────────────────────────────────────────────
//
// `listingPatchSchema` is the single source of truth for the field
// whitelist accepted by PATCH /listings/:listingId. The seller-hub
// batch-command 'edit' command reuses the same whitelist via
// `listingEditPatchSchema` so the bulk-edit surface can never drift from
// the single-listing contract.

export const listingPatchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  priceGbp: z.number().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  coverFinalizationId: z.string().min(2).max(120).optional(),
  status: z.enum(['draft', 'active', 'paused', 'sold', 'deleted']).optional(),
  category: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  originalPriceGbp: z.number().nonnegative().optional(),
  shippingMethod: z.string().min(1).optional(),
  shippingPayer: z.string().min(1).optional(),
  // Optimistic-concurrency token: the `updatedAt` the editor read. When
  // present the UPDATE is refused with 409 LISTING_STALE if the row has
  // moved since — prevents silent last-write-wins between devices.
  expectedUpdatedAt: z.string().min(10).max(60).optional(),
});

export type ListingPatchBody = z.infer<typeof listingPatchSchema>;

/**
 * Bulk-edit patch — the same allowed-field subset minus fields that cannot
 * be applied through a batch field edit:
 *  - `status` — lifecycle transitions must go through the canonical listing
 *    command service (pause/resume/delete) so search-index sync, offer
 *    cancellation and audit side effects stay consistent. A raw status
 *    write here would bypass all of them (the P0-10 defect class).
 *  - `imageUrl` / `coverFinalizationId` — cover changes require the
 *    verified upload-finalization flow, which is inherently single-listing.
 */
export const listingEditPatchSchema = listingPatchSchema
  .omit({
    status: true,
    imageUrl: true,
    coverFinalizationId: true,
    expectedUpdatedAt: true,
  })
  .extend({
    // Batch-edit surface only: `subcategory` and `attributes` are applied
    // by applyListingFieldPatch below (which validates the merged result
    // against the category-attribute registry). The single-PATCH route in
    // index.ts applies a hand-mapped `add()` column list — wiring these
    // keys there requires the corresponding `add()` calls in that handler.
    subcategory: z.string().min(1).max(120).optional(),
    attributes: listingAttributesSchema.optional(),
  });

export type ListingEditPatch = z.infer<typeof listingEditPatchSchema>;

/** camelCase patch key → listings column. Mirrors the `add()` mapping in
 *  the PATCH /listings/:listingId route. */
export const LISTING_EDIT_PATCH_COLUMNS: Record<keyof ListingEditPatch, string> = {
  title: 'title',
  description: 'description',
  priceGbp: 'price_gbp',
  category: 'category',
  subcategory: 'subcategory',
  brand: 'brand',
  size: 'size',
  condition: 'condition',
  attributes: 'attributes',
  originalPriceGbp: 'original_price_gbp',
  shippingMethod: 'shipping_method',
  shippingPayer: 'shipping_payer',
};

export type ListingFieldPatchResult =
  | {
      status: 'applied';
      listingId: string;
      appliedFields: string[];
      currentStatus: string;
      /** Status the row landed on when the patch itself moved it — set only
       *  when a moderation hold flipped a live listing to 'risk_pending'
       *  mid-edit (same hold the single-PATCH route writes). */
      newStatus?: string;
      previousPriceGbp?: number;
      newPriceGbp?: number;
      updatedAt?: string;
    }
  | {
      status: 'rejected';
      listingId: string;
      reason: string;
      currentStatus: string;
      /** Category-attribute registry violations when reason is
       *  'attribute_validation_failed'. */
      attributeErrors?: AttributeValidationError[];
    }
  | { status: 'conflict'; listingId: string; reason: string; currentStatus: string };

interface ListingEditLockRow {
  id: string;
  seller_id: string;
  price_gbp: number | string;
  status: string;
  title: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  condition: string | null;
  attributes: ListingAttributes | null;
}

/**
 * Apply a validated field patch to a single listing inside a transaction.
 * Mirrors the semantics of PATCH /listings/:listingId:
 *  1. Row-level `FOR UPDATE` lock so concurrent edits serialize.
 *  2. Ownership re-checked inside the lock (defense in depth — the batch
 *     endpoint also checks ownership before dispatching).
 *  3. Field mutation + `updated_at` bump committed atomically. Like the
 *     single-PATCH route, status is not consulted — field edits are
 *     permitted on any non-deleted status (a sold listing's price can be
 *     corrected for order-history accuracy, same as single PATCH).
 *  4. A price change records a durable `listing_price_events` row and a
 *     `listing.price_changed` outbox event — the same durable trail the
 *     single-PATCH route writes — so price-alert evaluation and buyer
 *     notification flow through the outbox drain identically.
 *  5. Post-commit: the search document is re-synced best-effort (same as
 *     the listing command service); the mutation is already durable.
 */
export async function applyListingFieldPatch(
  db: Pool,
  input: {
    listingId: string;
    patch: ListingEditPatch;
    actorId: string;
    correlationId?: string | null;
  },
): Promise<ListingFieldPatchResult> {
  const { listingId, patch, actorId } = input;

  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  const appliedFields: string[] = [];
  // Set when the text-moderation hold flips a live listing to 'risk_pending'
  // inside this patch — surfaced on the result so the batch receipt reports
  // the landing status honestly.
  let moderationHeld = false;

  for (const [key, column] of Object.entries(LISTING_EDIT_PATCH_COLUMNS)) {
    const val = patch[key as keyof ListingEditPatch];
    if (val !== undefined) {
      sets.push(`${column} = $${idx++}`);
      // JSONB column — serialise explicitly (same convention as the
      // admin_audit_logs metadata write below).
      values.push(key === 'attributes' ? JSON.stringify(val) : val);
      appliedFields.push(key);
    }
  }

  if (sets.length === 0) {
    return {
      status: 'rejected',
      listingId,
      reason: 'empty_patch',
      currentStatus: 'unknown',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const lockResult = await client.query<ListingEditLockRow>(
      `SELECT id, seller_id, price_gbp, status, title, description,
              category, subcategory, condition, attributes
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
      [listingId],
    );

    if (!lockResult.rowCount || lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: 'not_found',
        currentStatus: 'unknown',
      };
    }

    const current = lockResult.rows[0];

    if (current.seller_id !== actorId) {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: 'forbidden',
        currentStatus: current.status,
      };
    }

    // The documented contract is "any non-deleted status" — enforce it.
    // Without this gate a deleted listing could be silently repriced/edited.
    if (current.status === 'deleted') {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: 'deleted',
        currentStatus: current.status,
      };
    }

    // Text moderation — the same gate POST /listings and the single-PATCH
    // route apply — whenever the edit rewrites title or description. The
    // merged text (patched fields over the locked current values) is what
    // gets evaluated through the shared listingTextGateAction vocabulary:
    // 'rejected' refuses the item outright; 'review' and provider 'failed'
    // hold the listing at 'risk_pending' when it is publicly servable — the
    // same operator-visible hold the single-edit path writes, including
    // cancelling non-terminal live lots so nothing stays biddable on a held
    // listing. Non-public statuses stay as-is: they are already unservable
    // and the publish gate re-runs this check before any future activation.
    // Without this, bulk edit would industrialise unmoderated copy rewrites
    // (200 items per call).
    if (patch.title !== undefined || patch.description !== undefined) {
      const mergedText = `${patch.title ?? current.title ?? ''}\n${patch.description ?? current.description ?? ''}`;
      const textModerationResult = await moderateListingText(listingId, mergedText);
      const textModerationAction = listingTextGateAction(textModerationResult.status);
      if (textModerationAction === 'block') {
        await client.query('ROLLBACK');
        return {
          status: 'rejected',
          listingId,
          reason: 'moderation_rejected',
          currentStatus: current.status,
        };
      }
      if (textModerationAction === 'hold') {
        if (current.status === 'active') {
          sets.push(`status = $${idx++}`);
          values.push('risk_pending');
          moderationHeld = true;
          // Same invariant as the single-edit hold: a held listing must not
          // leave live lots biddable — settlement rejects 'risk_pending'.
          const cancelledLots = await client.query<{
            id: string;
            session_id: string;
            version: number;
          }>(
            `UPDATE live_lots
                SET status = 'cancelled',
                    version = version + 1,
                    updated_at = NOW()
              WHERE listing_id = $1
                AND status IN ('scheduled', 'open', 'closing', 'passed')
              RETURNING id, session_id, version`,
            [listingId],
          );
          for (const lot of cancelledLots.rows) {
            await client.query(
              `INSERT INTO live_lot_events
                 (id, lot_id, session_id, event_type, event_version, actor_id, payload)
               VALUES ($1, $2, $3, 'lot.cancelled', $4, $5, $6::jsonb)`,
              [
                crypto.randomUUID(),
                lot.id,
                lot.session_id,
                lot.version,
                actorId,
                JSON.stringify({ lotId: lot.id, reason: 'listing_moderation_hold' }),
              ],
            );
          }
        }
        logger.warn(
          {
            listingId,
            moderationStatus: textModerationResult.status,
            moderationError: textModerationResult.error,
            labels: textModerationResult.labels,
            heldAtRiskPending: moderationHeld,
          },
          'listingPatch: listing text edit returned no clean moderation verdict — holding listing',
        );
      }
    }

    // Category-attribute registry (R30/R31): when the patch touches the
    // taxonomy surface — category, subcategory, condition or the
    // attributes map itself — the merged result must satisfy the resolved
    // category's attribute schema. Condition is always re-checked because
    // a category change can orphan an otherwise-valid condition (e.g.
    // 'New with tags' on a listing recategorised to electronics).
    //
    // Required attributes are enforced once the listing carries an
    // authored attributes map or the patch supplies one. Rows whose
    // attributes are NULL/'{}' (every row written before migration 326)
    // keep the lenient legacy contract so unrelated field edits on old
    // listings stay writable.
    if (
      patch.category !== undefined ||
      patch.subcategory !== undefined ||
      patch.condition !== undefined ||
      patch.attributes !== undefined
    ) {
      const storedAttributes = current.attributes;
      const mergedAttributes =
        patch.attributes !== undefined
          ? patch.attributes
          : storedAttributes && Object.keys(storedAttributes).length > 0
            ? storedAttributes
            : undefined;
      const attributeValidation = validateListingAttributes(
        patch.category ?? current.category,
        mergedAttributes,
        patch.condition ?? current.condition,
        patch.subcategory ?? current.subcategory,
      );
      if (!attributeValidation.ok) {
        await client.query('ROLLBACK');
        return {
          status: 'rejected',
          listingId,
          reason: 'attribute_validation_failed',
          currentStatus: current.status,
          attributeErrors: attributeValidation.errors,
        };
      }
    }

    sets.push('updated_at = NOW()');
    values.push(listingId);

    const updateResult = await client.query<{ updated_at: Date | string }>(
      `UPDATE listings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING updated_at`,
      values,
    );
    const appliedUpdatedAt = updateResult.rows[0]?.updated_at;

    // Durable price-change trail — identical to the single-PATCH route so
    // downstream price-alert evaluation cannot distinguish the two paths.
    if (patch.priceGbp !== undefined && patch.priceGbp !== Number(current.price_gbp)) {
      const insertedEvent = await client.query<{ id: number }>(
        `INSERT INTO listing_price_events (listing_id, previous_price_gbp, new_price_gbp)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [listingId, Number(current.price_gbp), patch.priceGbp],
      );
      await appendDomainEvent(client, {
        aggregateType: 'listing',
        aggregateId: listingId,
        eventType: 'listing.price_changed',
        actorId,
        correlationId: input.correlationId ?? null,
        deduplicationKey: `listing.price_changed:${insertedEvent.rows[0].id}`,
        payload: {
          listingId,
          priceEventId: insertedEvent.rows[0].id,
          previousPriceGbp: Number(current.price_gbp),
          newPriceGbp: patch.priceGbp,
        },
      });
    }

    await recordListingEditAudit(client, listingId, actorId, appliedFields, patch);

    await client.query('COMMIT');

    // Post-commit: re-sync the search document so a price/category/brand
    // change is reflected in discovery. Best-effort — the mutation is
    // durable and the periodic re-sync reconciles any miss.
    try {
      const searchSync = await import('./searchSync.js');
      await searchSync.syncSingleListing(db, listingId);
    } catch (error) {
      logger.warn(
        { err: (error as Error).message, listingId },
        'listingPatch: post-commit search sync failed',
      );
    }

    return {
      status: 'applied',
      listingId,
      appliedFields,
      currentStatus: current.status,
      ...(moderationHeld ? { newStatus: 'risk_pending' } : {}),
      ...(patch.priceGbp !== undefined
        ? { previousPriceGbp: Number(current.price_gbp), newPriceGbp: patch.priceGbp }
        : {}),
      updatedAt: appliedUpdatedAt instanceof Date
        ? appliedUpdatedAt.toISOString()
        : appliedUpdatedAt != null
          ? String(appliedUpdatedAt)
          : undefined,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure — the connection will be reset on release
    }
    logger.error(
      { err: error, listingId },
      'listingPatch: failed to apply field patch',
    );
    return {
      status: 'conflict',
      listingId,
      reason: 'server_error',
      currentStatus: 'unknown',
    };
  } finally {
    client.release();
  }
}

async function recordListingEditAudit(
  client: PoolClient,
  listingId: string,
  actorId: string,
  appliedFields: string[],
  patch: ListingEditPatch,
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO admin_audit_logs
          (admin_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        actorId,
        'listing.edit',
        'listing',
        listingId,
        JSON.stringify({ command: 'edit', fields: appliedFields, patch }),
      ],
    );
  } catch (error) {
    // Audit failure must not block the edit — the mutation is the source
    // of truth. Log and continue (same convention as listingCommandService).
    logger.warn(
      { err: (error as Error).message, listingId },
      'listingPatch: failed to record audit entry',
    );
  }
}
