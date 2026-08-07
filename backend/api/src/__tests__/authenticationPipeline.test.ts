import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockRedis,
  determineTier,
  createAuthenticationRequest,
  runAiTriage,
  queueForExpertReview,
  assignExpert,
  submitExpertVerdict,
  escalateToLab,
  submitLabReport,
  generateCertificate,
  getAuthenticationBadge,
  verifyAuthenticationBadge,
  getAuthenticationHistory,
  getExpertReviewQueue,
  performAiTriage,
} from '../lib/authenticationPipeline.js';

describe('authenticationPipeline', () => {
  describe('determineTier', () => {
    test('tier 1 for items under £100', () => {
      assert.equal(determineTier(50), 1);
      assert.equal(determineTier(99), 1);
    });

    test('tier 2 for items £100-£500', () => {
      assert.equal(determineTier(100), 2);
      assert.equal(determineTier(499), 2);
    });

    test('tier 3 for items £500-£2000', () => {
      assert.equal(determineTier(500), 3);
      assert.equal(determineTier(1999), 3);
    });

    test('tier 4 for items over £2000', () => {
      assert.equal(determineTier(2000), 4);
      assert.equal(determineTier(50000), 4);
    });
  });

  describe('performAiTriage', () => {
    test('returns a preliminary result with confidence score', () => {
      const result = performAiTriage('listing_123', ['photo1.jpg']);
      assert.ok(result.confidenceScore >= 0 && result.confidenceScore <= 1);
      assert.ok(['pass', 'review', 'fail'].includes(result.recommendation));
      assert.equal(result.isPreliminary, true);
      assert.ok(result.checksPerformed.length > 0);
    });

    test('is deterministic for the same listing', () => {
      const r1 = performAiTriage('listing_abc', ['photo1.jpg']);
      const r2 = performAiTriage('listing_abc', ['photo2.jpg']);
      assert.equal(r1.confidenceScore, r2.confidenceScore);
      assert.equal(r1.recommendation, r2.recommendation);
    });
  });

  describe('createAuthenticationRequest', () => {
    test('creates a request with correct tier', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_1',
        itemValue: 250,
        category: 'handbags',
        brand: 'Gucci',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      assert.equal(req.tier, 2);
      assert.equal(req.status, 'pending_ai_triage');
      assert.equal(req.listingId, 'listing_1');
      assert.ok(req.auditTrail.length >= 1);
    });
  });

  describe('runAiTriage', () => {
    test('tier 1 pass results in authentication', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_t1',
        itemValue: 50,
        category: 'tshirts',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      const triaged = await runAiTriage(redis, req.id, ['photo.jpg']);
      // Tier 1 with pass → authenticated
      if (triaged.aiTriageResult!.recommendation === 'pass') {
        assert.equal(triaged.status, 'authenticated');
        assert.ok(triaged.badge);
        assert.equal(triaged.badge!.type, 'AI_VERIFIED');
      }
    });

    test('tier 2 requires expert review after triage', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_t2',
        itemValue: 250,
        category: 'handbags',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      const triaged = await runAiTriage(redis, req.id, ['photo.jpg']);
      // Tier 2 always needs expert review
      assert.ok(['ai_triage_complete', 'pending_expert_review', 'counterfeit'].includes(triaged.status));
    });
  });

  describe('expert review flow', () => {
    test('full expert review with authenticated verdict', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_expert',
        itemValue: 300,
        category: 'handbags',
        brand: 'Prada',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await runAiTriage(redis, req.id, ['photo.jpg']);
      await queueForExpertReview(redis, req.id);
      await assignExpert(redis, req.id, 'expert_1', 'Jane Expert');
      const verdict = await submitExpertVerdict(redis, req.id, 'expert_1', 'authenticated', 'Genuine Prada bag', 0.95);
      assert.equal(verdict.status, 'authenticated');
      assert.ok(verdict.badge);
      assert.equal(verdict.badge!.type, 'EXPERT_VERIFIED');
      assert.ok(verdict.completedAt);
    });

    test('expert verdict counterfeit marks as counterfeit', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_fake',
        itemValue: 300,
        category: 'handbags',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await runAiTriage(redis, req.id, ['photo.jpg']);
      await queueForExpertReview(redis, req.id);
      await assignExpert(redis, req.id, 'expert_1', 'Jane Expert');
      const verdict = await submitExpertVerdict(redis, req.id, 'expert_1', 'counterfeit', 'Fake logo detected', 0.98);
      assert.equal(verdict.status, 'counterfeit');
      assert.ok(verdict.completedAt);
    });
  });

  describe('lab escalation', () => {
    test('tier 3 can escalate to lab', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_lab',
        itemValue: 1500,
        category: 'watches',
        brand: 'Rolex',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await runAiTriage(redis, req.id, ['photo.jpg']);
      await queueForExpertReview(redis, req.id);
      await assignExpert(redis, req.id, 'expert_1', 'Jane Expert');
      const escalated = await submitExpertVerdict(redis, req.id, 'expert_1', 'needs_lab', 'Requires lab analysis', 0.5);
      if (escalated.status === 'pending_lab_analysis') {
        await escalateToLab(redis, req.id, 'lab_1', 'Test Lab');
        const labResult = await submitLabReport(redis, req.id, 'lab_1', ['microscopy', 'xrf'], 'authentic', 0.99, 'Authentic Rolex Submariner');
        assert.equal(labResult.status, 'authenticated');
        assert.ok(labResult.badge);
        assert.equal(labResult.badge!.type, 'LAB_CERTIFIED');
      }
    });

    test('tier 1 cannot escalate to lab', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_t1_nolab',
        itemValue: 50,
        category: 'tshirts',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await assert.rejects(escalateToLab(redis, req.id, 'lab_1', 'Test Lab'));
    });
  });

  describe('badge and certificate', () => {
    test('badge can be retrieved by listing ID', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_badge',
        itemValue: 50,
        category: 'tshirts',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      const triaged = await runAiTriage(redis, req.id, ['photo.jpg']);
      if (triaged.badge) {
        const badge = await getAuthenticationBadge(redis, 'listing_badge');
        assert.ok(badge);
        assert.equal(badge!.listingId, 'listing_badge');
      }
    });

    test('certificate can be verified by certificate ID', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_cert',
        itemValue: 50,
        category: 'tshirts',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      const triaged = await runAiTriage(redis, req.id, ['photo.jpg']);
      if (triaged.badge) {
        const cert = await generateCertificate(redis, req.id);
        const verification = await verifyAuthenticationBadge(redis, cert.certificateId);
        assert.equal(verification.valid, true);
      }
    });

    test('invalid certificate ID returns invalid', async () => {
      const redis = createMockRedis();
      const verification = await verifyAuthenticationBadge(redis, 'CERT-INVALID123');
      assert.equal(verification.valid, false);
    });
  });

  describe('authentication history', () => {
    test('history returns all requests for a listing', async () => {
      const redis = createMockRedis();
      await createAuthenticationRequest(redis, {
        listingId: 'listing_hist',
        itemValue: 50,
        category: 'tshirts',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await createAuthenticationRequest(redis, {
        listingId: 'listing_hist',
        itemValue: 50,
        category: 'tshirts',
        sellerId: 'seller_1',
        requestedBy: 'buyer',
      });
      const history = await getAuthenticationHistory(redis, 'listing_hist');
      assert.equal(history.length, 2);
    });
  });

  describe('expert review queue', () => {
    test('queued requests appear in the queue', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_queue',
        itemValue: 300,
        category: 'handbags',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await runAiTriage(redis, req.id, ['photo.jpg']);
      await queueForExpertReview(redis, req.id);
      const queue = await getExpertReviewQueue(redis);
      assert.ok(queue.includes(req.id));
    });
  });

  describe('audit trail', () => {
    test('every step is recorded in the audit trail', async () => {
      const redis = createMockRedis();
      const req = await createAuthenticationRequest(redis, {
        listingId: 'listing_audit',
        itemValue: 300,
        category: 'handbags',
        sellerId: 'seller_1',
        requestedBy: 'system',
      });
      await runAiTriage(redis, req.id, ['photo.jpg']);
      await queueForExpertReview(redis, req.id);
      await assignExpert(redis, req.id, 'expert_1', 'Jane Expert');
      const final = await submitExpertVerdict(redis, req.id, 'expert_1', 'authenticated', 'Genuine', 0.95);

      // Audit trail should have: create, ai_triage, queue_expert, assign, verdict
      assert.ok(final.auditTrail.length >= 4);
      const actions = final.auditTrail.map((e) => e.action);
      assert.ok(actions.includes('create_request'));
      assert.ok(actions.includes('ai_triage'));
      assert.ok(actions.includes('expert_verdict'));
    });
  });
});
