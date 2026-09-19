// Catalogue-import hardening tests — pin the behaviours added by the
// catalogue import hardening pass:
//   - Cross-tenant IDOR: getBatchItems / getBatchItemSummary / bulkUpdateItems
//     require the caller's userId and assert batch ownership before any
//     item read or write.
//   - Field mutations freeze once the batch leaves seller-editable states
//     (single-item PATCH and bulk corrections alike).
//   - createBatch persists consent_version instead of dropping it.
//   - startBatch / retryBatch enqueue worker jobs so a started batch can
//     never stall in 'created'/'discovering' with nothing queued.
//   - approveBatch's selectAll resolves every ready, non-excluded item —
//     page-loaded ids alone silently dropped ready drafts.
//   - createDraftListing returns the committed listing_id on idempotency
//     replay instead of inserting a duplicate draft.
//
// Source-level assertions follow the same pattern as
// offerLifecycleTransitions.test.ts — the service reads its SQL and control
// flow from one file, so structural checks catch contract regressions.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(
  join(here, '..', 'domain', 'catalogImports', 'catalogImportService.ts'),
  'utf8',
);
const publicationSource = readFileSync(
  join(here, '..', 'domain', 'catalogImports', 'catalogImportPublication.ts'),
  'utf8',
);
const routesSource = readFileSync(
  join(here, '..', 'routes', 'catalogImports.ts'),
  'utf8',
);
const hydrationSource = readFileSync(
  join(here, '..', 'workers', 'handlers', 'catalogImportHydrationHandler.ts'),
  'utf8',
);
const mediaSource = readFileSync(
  join(here, '..', 'workers', 'handlers', 'catalogImportMediaHandler.ts'),
  'utf8',
);

describe('cross-tenant IDOR guards', () => {
  it('getBatchItems requires userId and asserts ownership before listing items', () => {
    const match = serviceSource.match(
      /async getBatchItems\(\s*userId: string,\s*batchId: string,[\s\S]*?await this\.getBatch\(userId, batchId\);/,
    );
    assert.ok(match, 'getBatchItems must take userId and assert batch ownership first');
  });

  it('getBatchItemSummary requires userId and asserts ownership', () => {
    const match = serviceSource.match(
      /async getBatchItemSummary\(\s*userId: string,\s*batchId: string,[\s\S]*?await this\.getBatch\(userId, batchId\);/,
    );
    assert.ok(match, 'getBatchItemSummary must assert batch ownership');
  });

  it('bulkUpdateItems requires userId, locks the batch, and freezes on non-editable batches', () => {
    const match = serviceSource.match(
      /async bulkUpdateItems\(\s*userId: string,\s*batchId: string,[\s\S]*?FOR UPDATE[\s\S]*?assertOwnsBatch\(batch, userId\);\s*assertBatchFieldEditable\(batch\);/,
    );
    assert.ok(match, 'bulkUpdateItems must lock the batch and assert ownership + the editable-state freeze');
  });

  it('updateItemFields locks the parent batch and enforces the editable freeze', () => {
    const match = serviceSource.match(
      /assertOwnsItem\(row, userId\);[\s\S]*?catalog_import_batches WHERE id = \$1[\s\S]*?assertBatchFieldEditable\(batch\);/,
    );
    assert.ok(match, 'updateItemFields must freeze mutations after approval');
  });

  it('the items route passes the authenticated userId through', () => {
    assert.ok(
      routesSource.includes('service.getBatchItems(\n          userId'),
      'items list route must pass userId',
    );
    assert.ok(
      routesSource.includes('service.getBatchItemSummary(userId, batchId)'),
      'summary route must pass userId',
    );
    assert.ok(
      routesSource.includes('service.bulkUpdateItems(\n          userId'),
      'bulk-corrections route must pass userId',
    );
  });
});

describe('batch lifecycle honesty', () => {
  it('createBatch persists consent_version', () => {
    assert.ok(
      serviceSource.includes('consent_version,\n         raw_delete_after'),
      'batch INSERT must include the consent_version column',
    );
    assert.ok(
      serviceSource.includes('input.consentVersion'),
      'consentVersion input must reach the INSERT params',
    );
  });

  it('startBatch enqueues the discovery job after the state commit', () => {
    const match = serviceSource.match(
      /updateBatchStatus\(userId, batchId, 'discovering', 'seller_initiated'\);[\s\S]*?enqueueCatalogImportDiscoveryJob\(\{ batchId \}\)/,
    );
    assert.ok(match, 'startBatch must enqueue discovery or the batch can never progress');
  });

  it('a failed start enqueue marks the batch recoverable, not silently stuck', () => {
    const match = serviceSource.match(
      /enqueueCatalogImportDiscoveryJob\(\{ batchId \}\);\s*\} catch[\s\S]*?'failed_recoverable', 'enqueue_failed'/,
    );
    assert.ok(match, 'enqueue failure must leave the batch retryable');
  });

  it('retryBatch enqueues stage jobs for the resume state', () => {
    const match = serviceSource.match(
      /'retry', checkpoint \?\? undefined\);[\s\S]*?this\.enqueueStageJobs\(batchId, targetState\)/,
    );
    assert.ok(match, 'retryBatch must enqueue work for the resume state');
  });
});

describe('pipeline chaining', () => {
  it('hydration enqueues media jobs per pending media row', () => {
    assert.ok(
      hydrationSource.includes('enqueueCatalogImportMediaJob({ mediaId: media.id })'),
      'hydration must enqueue a media job per pending row',
    );
  });

  it('an item with no pending media enqueues normalisation directly', () => {
    assert.ok(
      hydrationSource.includes('enqueueCatalogImportNormalisationJob({ batchId, itemId })'),
      'media-less items must not strand in media_pending',
    );
  });

  it('media handler enqueues normalisation when all item media are terminal', () => {
    assert.ok(
      mediaSource.includes('maybeEnqueueNormalise'),
      'media handler must chain to normalisation',
    );
    assert.ok(
      mediaSource.includes("('pending', 'fetching', 'fetched', 'verifying')"),
      'the terminal check must wait for active fetch states only',
    );
  });

  it('the approve route enqueues the publication saga', () => {
    assert.ok(
      routesSource.includes('enqueueCatalogImportPublicationJob({ batchId })'),
      'approve must enqueue publish or approved batches stall forever',
    );
  });
});

describe('publication saga integrity', () => {
  it('approveBatch selectAll resolves ready, non-excluded items server-side', () => {
    const match = serviceSource.match(
      /options\?\.selectAll[\s\S]*?readiness = 'ready'[\s\S]*?seller_decision IS DISTINCT FROM 'excluded'/,
    );
    assert.ok(match, 'selectAll must resolve every ready non-excluded item');
  });

  it('createDraftListing returns the committed listing id on replay', () => {
    const match = publicationSource.match(
      /RETURNING id, listing_id, \(xmax = 0\) AS inserted[\s\S]*?!pubRow\.inserted[\s\S]*?return pubRow\.listing_id/,
    );
    assert.ok(match, 'replayed publish must reuse the committed listing id');
  });

  it('createDraftListing re-checks the batch state under lock before creating drafts', () => {
    const match = publicationSource.match(
      /catalog_import_batches WHERE id = \$1 FOR UPDATE[\s\S]*?'approved' && batchStatus !== 'publishing'/,
    );
    assert.ok(match, 'a mid-saga cancel must stop further draft creation');
  });
});

describe('reconcile and retention', () => {
  it('reconcileOutcomeUnknown republishes a proven-absent draft instead of parking it', () => {
    const match = publicationSource.match(
      /publication_status = 'approved'[\s\S]*?createDraftListing\(\s*row\.batch_id/,
    );
    assert.ok(match, 'a reconciled item reset to approved must be republished, not stranded');
  });

  it('createDraftListing accepts completed batches for reconcile retries only', () => {
    assert.ok(
      publicationSource.includes("batchStatus !== 'completed'"),
      'the draft guard must admit completed batches so reconcile retries can publish',
    );
    assert.ok(
      publicationSource.match(/batchStatus !== 'approved' && batchStatus !== 'publishing' && batchStatus !== 'completed'/),
      'cancelled/failed batches must still be rejected',
    );
  });

  it('the daily retention sweep enforces catalogue-import raw-data expiry', () => {
    const sweepSource = readFileSync(
      join(here, '..', 'workers', 'handlers', 'retentionSweepHandler.ts'),
      'utf8',
    );
    assert.ok(
      sweepSource.includes('findExpiredBatches') && sweepSource.includes('enforceRetention'),
      'the retention sweep must enforce expired catalogue-import batches',
    );
  });

  it('media retries converge on deterministic finalization and asset ids', () => {
    assert.ok(
      mediaSource.includes("`ufin_${media.id}`") && mediaSource.includes("`masset_${media.id}`"),
      'media finalization/asset ids must derive from the media row id so retries cannot mint orphans',
    );
  });
});
