import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerCreatorDocumentRoutes } from '../routes/creatorDocuments.js';
import { registerListingOfferRoutes } from '../routes/listingOffers.js';
import { registerChatComposerStateRoutes } from '../routes/chatComposerState.js';
import { evaluatePriceAlertsForListing } from '../routes/priceAlerts.js';
import { COOWN_POLICY, COMMERCE_POLICY_VERSION } from '../lib/commercePolicies.js';
import { compensateTerminalCommercePayment } from '../lib/commerceCheckoutLifecycle.js';
import {
  assertMediaAssetTransition,
  mediaKindForContentType,
  resolveMediaProcessingOutcome,
} from '../lib/mediaLifecycle.js';

type RouteHandler = (request: any, reply: any) => Promise<any>;

function createRouteHarness() {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, handler: RouteHandler) {
      handlers.set(`POST ${path}`, handler);
    },
    get(path: string, handler: RouteHandler) {
      handlers.set(`GET ${path}`, handler);
    },
    put(path: string, handler: RouteHandler) {
      handlers.set(`PUT ${path}`, handler);
    },
    delete(path: string, handler: RouteHandler) {
      handlers.set(`DELETE ${path}`, handler);
    },
    log: {
      error() {},
    },
  } as unknown as FastifyInstance;
  return { app, handlers };
}

function createReply() {
  return {
    statusCode: 200,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

test('accepted listing offers atomically create a protected checkout order and reservation', async () => {
  const { app, handlers } = createRouteHarness();
  const statements: string[] = [];
  let outboxDrainQueued = false;
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.includes('SELECT seller_id, buyer_id, listing_id')) {
        return {
          rowCount: 1,
          rows: [{
            seller_id: 'seller_1',
            buyer_id: 'buyer_1',
            listing_id: 'listing_1',
            offer_price_gbp: '80.00',
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            order_id: null,
            reservation_id: null,
          }],
        };
      }
      if (normalized.startsWith('SELECT status FROM listings')) {
        return { rowCount: 1, rows: [{ status: 'active' }] };
      }
      if (normalized.startsWith('INSERT INTO domain_outbox')) {
        return { rowCount: 1, rows: [{ id: 'evt_offer_accepted' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'seller_1',
    calculatePlatformChargeGbp: () => 4.7,
    authorizeInternalServiceRequest: () => true,
    enqueueOutboxDrain: async () => {
      outboxDrainQueued = true;
    },
  });

  const handler = handlers.get('POST /offers/:offerId/accept');
  assert.ok(handler);
  const result = await handler(
    { params: { offerId: 'offer_1' } },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.idempotentReplay, false);
  assert.equal(result.checkout.subtotalGbp, 80);
  assert.equal(result.checkout.platformChargeGbp, 4.7);
  assert.equal(result.checkout.totalGbp, 84.7);
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO orders')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO listing_checkout_reservations')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO domain_outbox')));
  assert.ok(statements.some((sql) => sql.startsWith("UPDATE listings SET status = 'paused'")));
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(outboxDrainQueued, true);
});

test('terminal commerce payment failure cancels the order and records compensation once', async () => {
  const statements: string[] = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('UPDATE orders')) {
        assert.deepEqual(values, ['order_1', 'failed']);
        return { rowCount: 1, rows: [{ id: 'order_1' }] };
      }
      if (normalized.startsWith('INSERT INTO order_events')) {
        assert.equal(values?.[0], 'order_1');
        assert.equal(values?.[1], 'payment.failed');
        assert.equal(values?.[3], 'payment.failed:intent_1');
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };

  const result = await compensateTerminalCommercePayment(client as any, {
    orderId: 'order_1',
    intentId: 'intent_1',
    actorUserId: 'buyer_1',
    status: 'failed',
    failureCode: 'card_declined',
  });

  assert.equal(result.orderCancelled, true);
  assert.equal(statements.length, 2);
});

test('counter-offer derives the next round and participant roles from the locked parent', async () => {
  const { app, handlers } = createRouteHarness();
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.includes('WHERE offered_by_user_id = $1 AND idempotency_key = $2')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.includes('FROM listing_offers') && normalized.includes('WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'offer_parent',
            listing_id: 'listing_1',
            buyer_id: 'buyer_1',
            seller_id: 'seller_1',
            offer_price_gbp: '75.00',
            original_price_gbp: '100.00',
            counter_round: 0,
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            accepted_at: null,
            declined_at: null,
            expired_at: null,
            cancelled_at: null,
            conversation_id: 'conversation_1',
            parent_offer_id: null,
            metadata: {},
            offered_by_user_id: 'buyer_1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }
      if (normalized.startsWith('SELECT status, price_gbp::text FROM listings')) {
        return { rowCount: 1, rows: [{ status: 'active', price_gbp: '100.00' }] };
      }
      if (normalized.startsWith('INSERT INTO listing_offers')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'offer_counter',
            listing_id: 'listing_1',
            buyer_id: 'buyer_1',
            seller_id: 'seller_1',
            offer_price_gbp: '85.00',
            original_price_gbp: '100.00',
            counter_round: 1,
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            accepted_at: null,
            declined_at: null,
            expired_at: null,
            cancelled_at: null,
            conversation_id: 'conversation_1',
            parent_offer_id: 'offer_parent',
            metadata: {},
            offered_by_user_id: 'seller_1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }
      if (normalized.startsWith('INSERT INTO domain_outbox')) {
        return { rowCount: 1, rows: [{ id: 'evt_counter' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'seller_1',
    calculatePlatformChargeGbp: () => 0,
    authorizeInternalServiceRequest: () => true,
    enqueueOutboxDrain: async () => {},
  });

  const handler = handlers.get('POST /offers/:offerId/counter');
  assert.ok(handler);
  const result = await handler(
    {
      params: { offerId: 'offer_parent' },
      body: {
        offerPriceGbp: 85,
        expiryHours: 48,
        idempotencyKey: 'counter_attempt_1',
      },
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.offer.counterRound, 1);
  assert.equal(result.offer.offeredByUserId, 'seller_1');
  assert.ok(statements.some((sql) => sql.startsWith("UPDATE listing_offers SET status = 'countered'")));
});

test('Co-Own commerce policy exposes one versioned 20-unit boundary', () => {
  assert.match(COMMERCE_POLICY_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(COOWN_POLICY.maxIssuanceUnits, 20);
  assert.equal(COOWN_POLICY.maxOrderUnits, 20);
  assert.equal(COOWN_POLICY.maxBuyoutUnits, 20);
});

test('offer expiry sweep rejects user authentication without the internal service identity', async () => {
  const { app, handlers } = createRouteHarness();
  let connected = false;
  const db = {
    async connect() {
      connected = true;
      throw new Error('database must not be reached');
    },
  } as unknown as Pool;

  registerListingOfferRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'ordinary_user',
    calculatePlatformChargeGbp: () => 0,
    authorizeInternalServiceRequest: () => false,
    enqueueOutboxDrain: async () => {},
  });

  const handler = handlers.get('POST /offers/sweep-expired');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler({ headers: {} }, reply);

  assert.equal(reply.statusCode, 401);
  assert.equal(result.code, 'INTERNAL_SERVICE_AUTH_REQUIRED');
  assert.equal(connected, false);
});

test('creator publish replays an existing idempotency key without allocating another revision', async () => {
  const { app, handlers } = createRouteHarness();
  const statements: string[] = [];
  const document = {
    id: 'doc_1',
    type: 'look',
    version: 1,
    canvas: {
      aspectRatio: 1,
      background: { type: 'color', value: '#000000' },
    },
    pages: [{
      id: 'page_1',
      layers: [{
        id: 'media_1',
        type: 'media',
        x: 0.5,
        y: 0.5,
        width: 1,
        height: 1,
        scale: 1,
        rotation: 0,
        zIndex: 0,
        locked: false,
        hidden: false,
        opacity: 1,
        payload: {
          mediaUri: 'https://cdn.example.test/media.jpg',
          mediaType: 'image',
          contentFit: 'cover',
          opacity: 1,
        },
      }],
    }],
    metadata: {
      title: 'Published look',
      caption: '',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('SELECT creator_id, document_json')) {
        return {
          rowCount: 1,
          rows: [{ creator_id: 'creator_1', document_json: JSON.stringify(document) }],
        };
      }
      if (normalized.startsWith('SELECT id, revision_number')) {
        return { rowCount: 1, rows: [{ id: 'rev_3', revision_number: 3 }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  registerCreatorDocumentRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'creator_1',
  });

  const handler = handlers.get('POST /creator/documents/:documentId/publish');
  assert.ok(handler);
  const result = await handler(
    {
      params: { documentId: 'doc_1' },
      body: { idempotencyKey: 'publish-key-0001' },
      headers: {},
    },
    createReply(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.revisionNumber, 3);
  assert.equal(result.idempotentReplay, true);
  assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO creator_document_revisions')), false);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('published creator documents reject draft overwrite attempts', async () => {
  const { app, handlers } = createRouteHarness();
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('SELECT creator_id, status, lock_version')) {
        return {
          rowCount: 1,
          rows: [{ creator_id: 'creator_1', status: 'published', lock_version: 4 }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  registerCreatorDocumentRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'creator_1',
  });

  const handler = handlers.get('POST /creator/documents');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler({
    headers: { 'if-match': '"4"' },
    body: {
      id: 'doc_published',
      type: 'look',
      version: 1,
      canvas: {
        aspectRatio: 1,
        background: { type: 'color', value: '#000000' },
      },
      pages: [{ id: 'page_1', layers: [] }],
      metadata: {
        title: '',
        caption: '',
        visibility: 'public',
        allowReplies: true,
        allowReactions: true,
        allowRemix: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }, reply);

  assert.equal(reply.statusCode, 409);
  assert.equal(result.code, 'CREATOR_DOCUMENT_IMMUTABLE');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE creator_documents')), false);
  assert.equal(statements.at(-1), 'ROLLBACK');
});

test('price alert evaluation emits one durable notification only when a threshold is crossed', async () => {
  const updates: unknown[][] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('FROM price_alerts pa')) {
        return {
          rowCount: 2,
          rows: [
            {
              id: 'alert_crossed',
              user_id: 'user_1',
              trigger_price: '90.00',
              last_observed_price: '100.00',
              listing_title: 'Archive jacket',
            },
            {
              id: 'alert_not_crossed',
              user_id: 'user_2',
              trigger_price: '70.00',
              last_observed_price: '100.00',
              listing_title: 'Archive jacket',
            },
          ],
        };
      }
      if (normalized.startsWith('UPDATE price_alerts')) {
        updates.push(params ?? []);
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const notifications: any[] = [];

  const outcome = await evaluatePriceAlertsForListing({
    db,
    listingId: 'listing_1',
    priceEventId: 42,
    previousPriceGbp: 100,
    newPriceGbp: 85,
    queueNotification: async (notification) => {
      notifications.push(notification);
      return 'notification_1';
    },
  });

  assert.deepEqual(outcome, { evaluated: 2, triggered: 1 });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, 'user_1');
  assert.equal(notifications[0].eventType, 'price_drop');
  assert.equal(notifications[0].idempotencyKey, 'price-alert:alert_crossed:event:42');
  assert.equal(updates.length, 2);
  assert.equal(updates[0][3], true);
  assert.equal(updates[1][3], false);
});

test('upload finalization ignores client metadata and verifies the canonical presign intent', async () => {
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';
  const { registerUploadRoutes } = await import('../routes/uploads.js');
  const { app, handlers } = createRouteHarness();
  const verified: unknown[][] = [];
  const canonical = {
    id: 'intent_1',
    object_key: 'listings/user_1/object.jpg',
    bucket: 'media',
    owner_id: 'user_1',
    folder: 'listings',
    file_name: 'object.jpg',
    content_type: 'image/jpeg',
    size_bytes: '2048',
    public_url: 'https://cdn.example.test/media/listings/user_1/object.jpg',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    finalized_at: null,
  };
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('FROM upload_intents') && normalized.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [canonical] };
      }
      if (normalized.includes('FROM upload_finalizations')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO upload_finalizations')) {
        return {
          rowCount: 1,
          rows: [{
            ...canonical,
            id: 'finalization_1',
            status: 'finalized',
            scope: 'listing_media',
            scope_ref_id: 'listing_1',
            head_checked_at: new Date().toISOString(),
            failure_reason: null,
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }
      if (normalized.startsWith('INSERT INTO media_assets')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'media_asset_1',
            status: 'integrity_verified',
            media_kind: 'image',
            canonical_url: null,
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  registerUploadRoutes({
    app,
    db,
    createApiError: (_code, message) => new Error(message),
    resolveAuthenticatedUserId: () => 'user_1',
    verifyUploadedObject: async (...args) => {
      verified.push(args);
    },
  });

  const handler = handlers.get('POST /uploads/finalize');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler(
    {
      body: {
        objectKey: canonical.object_key,
        bucket: canonical.bucket,
        fileName: 'forged.exe',
        contentType: 'video/mp4',
        sizeBytes: 999_999,
        publicUrl: 'https://attacker.invalid/file',
        folder: 'uploads',
        scope: 'listing_media',
        scopeRefId: 'listing_1',
        metadata: {},
        verifyObject: false,
      },
    },
    reply,
  );

  assert.equal(result.ok, true);
  assert.equal(reply.statusCode, 201);
  assert.deepEqual(verified, [[canonical.object_key, canonical.content_type, 2048]]);
  assert.equal(result.finalization.fileName, canonical.file_name);
  assert.equal(result.finalization.contentType, canonical.content_type);
  assert.equal(result.finalization.sizeBytes, 2048);
  assert.equal(result.finalization.publicUrl, canonical.public_url);
  assert.equal(result.finalization.deliveryStatus, 'unmoderated_source_object');
  assert.deepEqual(result.mediaAsset, {
    id: 'media_asset_1',
    status: 'integrity_verified',
    mediaKind: 'image',
    canonicalUrl: null,
    publishable: false,
    processingRequired: true,
  });
});

test('media lifecycle never treats storage verification as publication approval', () => {
  assert.equal(mediaKindForContentType('image/jpeg'), 'image');
  assert.equal(mediaKindForContentType('video/mp4; codecs=h264'), 'video');
  assert.equal(mediaKindForContentType('application/pdf'), 'document');
  assert.throws(
    () => assertMediaAssetTransition('integrity_verified', 'published'),
    /MEDIA_INVALID_TRANSITION/,
  );

  const safe = resolveMediaProcessingOutcome({
    declaredContentType: 'image/jpeg',
    declaredSizeBytes: 2048,
    detectedContentType: 'image/jpeg',
    detectedSizeBytes: 2048,
    scanStatus: 'clean',
    moderationStatus: 'approved',
    processingSucceeded: true,
  });
  assert.equal(safe.status, 'publishable');
  assert.equal(safe.processingStatus, 'completed');

  const mismatched = resolveMediaProcessingOutcome({
    declaredContentType: 'image/jpeg',
    declaredSizeBytes: 2048,
    detectedContentType: 'image/png',
    detectedSizeBytes: 2048,
    scanStatus: 'clean',
    moderationStatus: 'approved',
    processingSucceeded: true,
  });
  assert.equal(mismatched.status, 'integrity_failed');
});

test('infected or moderation-rejected media cannot become publishable', () => {
  const infected = resolveMediaProcessingOutcome({
    declaredContentType: 'video/mp4',
    declaredSizeBytes: 4096,
    detectedContentType: 'video/mp4',
    detectedSizeBytes: 4096,
    scanStatus: 'infected',
    moderationStatus: 'approved',
    processingSucceeded: true,
  });
  assert.equal(infected.status, 'quarantined');
  assert.equal(infected.processingStatus, 'failed');

  const rejected = resolveMediaProcessingOutcome({
    declaredContentType: 'image/webp',
    declaredSizeBytes: 1024,
    detectedContentType: 'image/webp',
    detectedSizeBytes: 1024,
    scanStatus: 'clean',
    moderationStatus: 'rejected',
    processingSucceeded: true,
  });
  assert.equal(rejected.status, 'rejected');
});

test('media worker and orphan cleanup boundaries reject ordinary user authentication', async () => {
  const { registerMediaAssetRoutes } = await import('../routes/mediaAssets.js');
  const { app, handlers } = createRouteHarness();
  let connected = false;
  const db = {
    async connect() {
      connected = true;
      throw new Error('database must not be reached');
    },
  } as unknown as Pool;

  registerMediaAssetRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'ordinary_user',
    authorizeInternalServiceRequest: () => false,
    deleteStoredObject: async () => {
      throw new Error('storage must not be reached');
    },
  });

  for (const [route, body] of [
    ['POST /internal/media/processing/jobs/claim', { workerId: 'worker_1' }],
    ['POST /internal/media/orphans/cleanup', { workerId: 'worker_1' }],
  ] as const) {
    const handler = handlers.get(route);
    assert.ok(handler);
    const reply = createReply();
    const result = await handler({ headers: {}, body }, reply);
    assert.equal(reply.statusCode, 401);
    assert.equal(result.ok, false);
  }
  assert.equal(connected, false);
});

test('chat composer persistence rejects device-local attachment references', async () => {
  const { app, handlers } = createRouteHarness();
  let connected = false;
  const db = {
    async connect() {
      connected = true;
      throw new Error('database must not be reached');
    },
  } as unknown as Pool;
  registerChatComposerStateRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'user_1',
  });

  const handler = handlers.get('PUT /chat/conversations/:conversationId/composer-state');
  assert.ok(handler);
  await assert.rejects(
    handler({
      params: { conversationId: 'conversation_1' },
      body: {
        draftText: 'Draft',
        pendingAttachments: [{
          kind: 'image',
          objectKey: 'chat/user_1/photo.jpg',
          finalizationId: 'finalization_1',
          localUri: 'file:///private/device/photo.jpg',
        }],
      },
    }, createReply()),
  );
  assert.equal(connected, false);
});

test('chat composer persists only a finalized attachment owned by the conversation member', async () => {
  const { app, handlers } = createRouteHarness();
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.startsWith('SELECT 1 FROM chat_members')) {
        return { rowCount: 1, rows: [{ exists: 1 }] };
      }
      if (normalized.includes('FROM upload_finalizations finalization')) {
        return {
          rowCount: 1,
          rows: [{
            object_key: 'chat/user_1/photo.jpg',
            owner_id: 'user_1',
            status: 'finalized',
            scope: 'general',
            scope_ref_id: null,
            media_status: 'integrity_verified',
          }],
        };
      }
      if (normalized.startsWith('INSERT INTO chat_composer_state')) {
        return {
          rowCount: 1,
          rows: [{
            draft_text: 'Draft',
            reply_to_message_id: null,
            pending_attachments: [{
              kind: 'image',
              objectKey: 'chat/user_1/photo.jpg',
              finalizationId: 'finalization_1',
            }],
            active_bot_id: null,
            linked_listing_id: null,
            schema_version: 1,
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  registerChatComposerStateRoutes({
    app,
    db,
    resolveAuthenticatedUserId: () => 'user_1',
  });

  const handler = handlers.get('PUT /chat/conversations/:conversationId/composer-state');
  assert.ok(handler);
  const result = await handler({
    params: { conversationId: 'conversation_1' },
    body: {
      draftText: 'Draft',
      pendingAttachments: [{
        kind: 'image',
        objectKey: 'chat/user_1/photo.jpg',
        finalizationId: 'finalization_1',
      }],
    },
  }, createReply());

  assert.equal(result.ok, true);
  assert.ok(
    statements.some((sql) =>
      sql.startsWith("UPDATE upload_finalizations SET scope = 'chat_attachment'")),
  );
  assert.equal(statements.at(-1), 'COMMIT');
});

test('AI deploy readiness rejects a non-admin caller before probing providers', async () => {
  const { registerAiTruthRoutes } = await import('../routes/aiTruth.js');
  const { app, handlers } = createRouteHarness();
  registerAiTruthRoutes({
    app,
    authorizeAdminRequest: () => false,
  });

  const handler = handlers.get('GET /ai/deploy-readiness');
  assert.ok(handler);
  const reply = createReply();
  const result = await handler({ headers: {} }, reply);

  assert.equal(reply.statusCode, 403);
  assert.equal(result.code, 'AI_DEPLOY_READINESS_FORBIDDEN');
});

test('AI quota reservation uses one atomic Redis operation for both hourly limits', async () => {
  const { reserveAiUsageQuota } = await import('../lib/aiUsage.js');
  const calls: unknown[][] = [];
  const fakeRedis = {
    async eval(...args: unknown[]) {
      calls.push(args);
      return [1, 4, 9];
    },
  };
  const now = new Date('2026-07-28T12:15:00.000Z');

  const result = await reserveAiUsageQuota({
    userId: 'user_1',
    conversationId: 'conversation_1',
    now,
  }, fakeRedis);

  assert.equal(result.allowed, true);
  assert.equal(result.userCount, 4);
  assert.equal(result.conversationCount, 9);
  assert.equal(result.userRemaining, 26);
  assert.equal(result.conversationRemaining, 51);
  assert.equal(result.resetsAt, '2026-07-28T13:00:00.000Z');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 2);
  assert.match(String(calls[0][2]), /ai:quota:user:user_1:2026-07-28T12/);
  assert.match(String(calls[0][3]), /ai:quota:conversation:conversation_1:2026-07-28T12/);
});
