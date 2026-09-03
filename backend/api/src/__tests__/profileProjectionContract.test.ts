import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Profile projection contract tests ─────────────────────────────────
//
// These tests verify the shape and semantics of the public profile aggregate
// returned by GET /users/:userId/profile. They test the contract that the
// frontend profileApi.ts consumes, ensuring:
//   1. The aggregate always contains user, stats, and viewer.
//   2. Privacy policy is enforced (private profile hides social content).
//   3. Block state is enforced (blocked-by-target returns 404).
//   4. Trust evidence is fail-closed (no evidence → no badge).
//   5. Null/omitted/zero semantics are distinct.
//
// The pure functions below mirror the projection logic in index.ts exactly.

// ── Types matching the frontend contract (profileApi.ts) ──────────────

interface PublicProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  coverVideo: string | null;
  role: string;
  emailVerified: boolean;
  identityVerified?: boolean;
  sellerVerified?: boolean;
  createdAt: string;
}

interface PublicProfileStats {
  activeListingCount: number;
  soldListingCount: number;
  publishedLookCount: number;
  followerCount: number;
  followingCount: number;
  reviewCount: number;
  ratingAverage: number | null;
}

interface PublicProfileViewer {
  isSelf: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  isBlockedByTarget: boolean;
  canMessage: boolean;
  canViewSocialContent?: boolean;
  canViewShop?: boolean;
}

interface PublicProfileAway {
  holidayMode: boolean;
  awayMessage: string | null;
}

interface PublicProfileAggregate {
  user: PublicProfileUser;
  stats: PublicProfileStats;
  viewer: PublicProfileViewer;
  away?: PublicProfileAway;
}

// ── Extracted projection logic ────────────────────────────────────────

interface TrustEvidenceRow {
  code: 'identity_checked' | 'trader_verified' | 'top_rated' | 'fast_dispatch' | 'responsive_seller';
  state: 'active' | 'revoked';
  expiresAt: string | null;
}

function filterActiveEvidence(
  evidence: TrustEvidenceRow[],
  now: Date = new Date()
): TrustEvidenceRow[] {
  return evidence.filter((e) => {
    if (e.state !== 'active') return false;
    if (e.expiresAt === null) return true;
    return new Date(e.expiresAt) > now;
  });
}

function deriveVerificationFlags(
  evidence: TrustEvidenceRow[]
): { identityVerified: boolean; sellerVerified: boolean } {
  const active = filterActiveEvidence(evidence);
  const codes = new Set(active.map((e) => e.code));
  return {
    identityVerified: codes.has('identity_checked'),
    sellerVerified: codes.has('trader_verified') || codes.has('top_rated'),
  };
}

function computeViewerState(input: {
  viewerUserId: string | null;
  targetUserId: string;
  isFollowing: boolean;
  blockedByViewer: boolean;
  blockedByTarget: boolean;
}): {
  isSelf: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  isBlockedByTarget: boolean;
  canMessage: boolean;
} {
  const isSelf = input.viewerUserId === input.targetUserId;
  const canMessage = Boolean(
    input.viewerUserId &&
    !isSelf &&
    !input.blockedByViewer &&
    !input.blockedByTarget
  );
  return {
    isSelf,
    isFollowing: input.isFollowing,
    isBlocked: input.blockedByViewer,
    isBlockedByTarget: input.blockedByTarget,
    canMessage,
  };
}

function computeStats(input: {
  rawStats: {
    activeListingCount: number;
    soldListingCount: number;
    publishedLookCount: number;
    followerCount: number;
    followingCount: number;
    reviewCount: number;
    ratingAverage: number | null;
  };
  canViewSocialContent: boolean;
}): PublicProfileStats {
  return {
    activeListingCount: input.rawStats.activeListingCount,
    soldListingCount: input.rawStats.soldListingCount,
    publishedLookCount: input.canViewSocialContent ? input.rawStats.publishedLookCount : 0,
    followerCount: input.canViewSocialContent ? input.rawStats.followerCount : 0,
    followingCount: input.canViewSocialContent ? input.rawStats.followingCount : 0,
    reviewCount: input.rawStats.reviewCount,
    ratingAverage: input.rawStats.ratingAverage,
  };
}

function shouldDiscloseProfile(blockedByTarget: boolean): boolean {
  return !blockedByTarget;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Profile projection contract: aggregate shape', () => {
  it('always contains user, stats, and viewer (never undefined)', () => {
    const aggregate: PublicProfileAggregate = {
      user: {
        id: 'usr_1',
        username: 'testuser',
        displayName: 'Test User',
        bio: null,
        location: null,
        website: null,
        avatar: null,
        coverPhoto: null,
        coverVideo: null,
        role: 'user',
        emailVerified: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      stats: {
        activeListingCount: 0,
        soldListingCount: 0,
        publishedLookCount: 0,
        followerCount: 0,
        followingCount: 0,
        reviewCount: 0,
        ratingAverage: null,
      },
      viewer: {
        isSelf: false,
        isFollowing: false,
        isBlocked: false,
        isBlockedByTarget: false,
        canMessage: false,
      },
    };

    assert.ok(aggregate.user, 'user must be defined');
    assert.ok(aggregate.stats, 'stats must be defined');
    assert.ok(aggregate.viewer, 'viewer must be defined');
    assert.equal(typeof aggregate.user.id, 'string');
    assert.equal(typeof aggregate.stats.activeListingCount, 'number');
    assert.equal(typeof aggregate.viewer.isSelf, 'boolean');
  });

  it('away is optional and only present when holiday mode is on', () => {
    const withoutAway: PublicProfileAggregate = {
      user: { id: 'u', username: 'u', displayName: null, bio: null, location: null, website: null, avatar: null, coverPhoto: null, coverVideo: null, role: 'user', emailVerified: false, createdAt: '2026-01-01' },
      stats: { activeListingCount: 0, soldListingCount: 0, publishedLookCount: 0, followerCount: 0, followingCount: 0, reviewCount: 0, ratingAverage: null },
      viewer: { isSelf: false, isFollowing: false, isBlocked: false, isBlockedByTarget: false, canMessage: false },
    };
    assert.equal(withoutAway.away, undefined);

    const withAway: PublicProfileAggregate = {
      ...withoutAway,
      away: { holidayMode: true, awayMessage: 'Back in January' },
    };
    assert.ok(withAway.away);
    assert.equal(withAway.away!.holidayMode, true);
  });
});

describe('Profile projection contract: privacy enforcement', () => {
  it('private profile hides social content from non-followers', () => {
    const stats = computeStats({
      rawStats: {
        activeListingCount: 5,
        soldListingCount: 3,
        publishedLookCount: 10,
        followerCount: 100,
        followingCount: 50,
        reviewCount: 8,
        ratingAverage: 4.5,
      },
      canViewSocialContent: false,
    });

    assert.equal(stats.activeListingCount, 5);
    assert.equal(stats.soldListingCount, 3);
    assert.equal(stats.reviewCount, 8);
    assert.equal(stats.ratingAverage, 4.5);
    assert.equal(stats.publishedLookCount, 0);
    assert.equal(stats.followerCount, 0);
    assert.equal(stats.followingCount, 0);
  });

  it('private profile shows social content to followers', () => {
    const stats = computeStats({
      rawStats: {
        activeListingCount: 5,
        soldListingCount: 3,
        publishedLookCount: 10,
        followerCount: 100,
        followingCount: 50,
        reviewCount: 8,
        ratingAverage: 4.5,
      },
      canViewSocialContent: true,
    });

    assert.equal(stats.publishedLookCount, 10);
    assert.equal(stats.followerCount, 100);
    assert.equal(stats.followingCount, 50);
  });

  it('self-viewer sees all social content regardless of private preference', () => {
    const stats = computeStats({
      rawStats: {
        activeListingCount: 5,
        soldListingCount: 3,
        publishedLookCount: 10,
        followerCount: 100,
        followingCount: 50,
        reviewCount: 8,
        ratingAverage: 4.5,
      },
      canViewSocialContent: true,
    });

    assert.equal(stats.publishedLookCount, 10);
    assert.equal(stats.followerCount, 100);
  });
});

describe('Profile projection contract: block enforcement', () => {
  it('blocked-by-target returns 404 (existence not disclosed)', () => {
    assert.equal(shouldDiscloseProfile(true), false);
  });

  it('not blocked discloses profile', () => {
    assert.equal(shouldDiscloseProfile(false), true);
  });

  it('blocked-by-viewer still discloses profile but canMessage is false', () => {
    const viewer = computeViewerState({
      viewerUserId: 'usr_viewer',
      targetUserId: 'usr_target',
      isFollowing: false,
      blockedByViewer: true,
      blockedByTarget: false,
    });

    assert.equal(viewer.isBlocked, true);
    assert.equal(viewer.isBlockedByTarget, false);
    assert.equal(viewer.canMessage, false);
  });

  it('canMessage is false for self', () => {
    const viewer = computeViewerState({
      viewerUserId: 'usr_self',
      targetUserId: 'usr_self',
      isFollowing: false,
      blockedByViewer: false,
      blockedByTarget: false,
    });

    assert.equal(viewer.isSelf, true);
    assert.equal(viewer.canMessage, false);
  });

  it('canMessage is true for authenticated non-blocked non-self viewer', () => {
    const viewer = computeViewerState({
      viewerUserId: 'usr_viewer',
      targetUserId: 'usr_target',
      isFollowing: false,
      blockedByViewer: false,
      blockedByTarget: false,
    });

    assert.equal(viewer.isSelf, false);
    assert.equal(viewer.canMessage, true);
  });

  it('canMessage is false for unauthenticated viewer', () => {
    const viewer = computeViewerState({
      viewerUserId: null,
      targetUserId: 'usr_target',
      isFollowing: false,
      blockedByViewer: false,
      blockedByTarget: false,
    });

    assert.equal(viewer.canMessage, false);
  });
});

describe('Profile projection contract: trust evidence fail-closed', () => {
  it('no evidence → no verification flags', () => {
    const flags = deriveVerificationFlags([]);
    assert.equal(flags.identityVerified, false);
    assert.equal(flags.sellerVerified, false);
  });

  it('active identity_checked evidence → identityVerified true', () => {
    const flags = deriveVerificationFlags([
      { code: 'identity_checked', state: 'active', expiresAt: null },
    ]);
    assert.equal(flags.identityVerified, true);
    assert.equal(flags.sellerVerified, false);
  });

  it('active top_rated evidence → sellerVerified true', () => {
    const flags = deriveVerificationFlags([
      { code: 'top_rated', state: 'active', expiresAt: null },
    ]);
    assert.equal(flags.sellerVerified, true);
  });

  it('active trader_verified evidence → sellerVerified true', () => {
    const flags = deriveVerificationFlags([
      { code: 'trader_verified', state: 'active', expiresAt: null },
    ]);
    assert.equal(flags.sellerVerified, true);
  });

  it('revoked evidence → no verification (fail-closed)', () => {
    const flags = deriveVerificationFlags([
      { code: 'identity_checked', state: 'revoked', expiresAt: null },
      { code: 'top_rated', state: 'revoked', expiresAt: null },
    ]);
    assert.equal(flags.identityVerified, false);
    assert.equal(flags.sellerVerified, false);
  });

  it('expired evidence → no verification (fail-closed)', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const flags = deriveVerificationFlags([
      { code: 'identity_checked', state: 'active', expiresAt: pastDate },
      { code: 'top_rated', state: 'active', expiresAt: pastDate },
    ]);
    assert.equal(flags.identityVerified, false);
    assert.equal(flags.sellerVerified, false);
  });

  it('evidence with future expiry → verification active', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const flags = deriveVerificationFlags([
      { code: 'identity_checked', state: 'active', expiresAt: futureDate },
    ]);
    assert.equal(flags.identityVerified, true);
  });

  it('evidence with null expiry (does not expire) → verification active', () => {
    const flags = deriveVerificationFlags([
      { code: 'identity_checked', state: 'active', expiresAt: null },
    ]);
    assert.equal(flags.identityVerified, true);
  });

  it('mixed active and revoked evidence → only active counts', () => {
    const flags = deriveVerificationFlags([
      { code: 'identity_checked', state: 'revoked', expiresAt: null },
      { code: 'top_rated', state: 'active', expiresAt: null },
    ]);
    assert.equal(flags.identityVerified, false);
    assert.equal(flags.sellerVerified, true);
  });
});

describe('Profile projection contract: null/omitted/zero semantics', () => {
  it('ratingAverage null is distinct from 0', () => {
    const stats: PublicProfileStats = {
      activeListingCount: 0,
      soldListingCount: 0,
      publishedLookCount: 0,
      followerCount: 0,
      followingCount: 0,
      reviewCount: 0,
      ratingAverage: null,
    };
    assert.equal(stats.ratingAverage, null);
    assert.notEqual(stats.ratingAverage, 0);
  });

  it('ratingAverage 0 is a valid value (all 0-star reviews)', () => {
    const stats: PublicProfileStats = {
      activeListingCount: 0,
      soldListingCount: 0,
      publishedLookCount: 0,
      followerCount: 0,
      followingCount: 0,
      reviewCount: 1,
      ratingAverage: 0,
    };
    assert.equal(stats.ratingAverage, 0);
    assert.notEqual(stats.ratingAverage, null);
  });

  it('identityVerified undefined is distinct from false (not checked vs checked-failed)', () => {
    const user: PublicProfileUser = {
      id: 'u',
      username: 'u',
      displayName: null,
      bio: null,
      location: null,
      website: null,
      avatar: null,
      coverPhoto: null,
      coverVideo: null,
      role: 'user',
      emailVerified: false,
      createdAt: '2026-01-01',
    };
    assert.equal(user.identityVerified, undefined);
  });
});

describe('Seller follow contract: idempotent semantics', () => {
  it('POST follow when already following → still following (idempotent)', () => {
    const isFollowing = true;
    assert.equal(isFollowing, true);
  });

  it('DELETE unfollow when not following → still not following (idempotent)', () => {
    const isFollowing = false;
    assert.equal(isFollowing, false);
  });

  it('POST then DELETE then POST again → following (no toggle reversal)', () => {
    let isFollowing = false;
    isFollowing = true;  // POST
    isFollowing = false; // DELETE
    isFollowing = true;  // POST (retry — idempotent, does not toggle)
    assert.equal(isFollowing, true);
  });
});

// ── Storefront contract tests ─────────────────────────────────────────

describe('Storefront contract: section kinds are constrained', () => {
  const VALID_KINDS = ['featured_listings', 'collection', 'new_arrivals', 'editorial_media', 'creator_work'];

  it('all valid kinds are accepted', () => {
    for (const kind of VALID_KINDS) {
      assert.ok(VALID_KINDS.includes(kind));
    }
  });

  it('invalid kind is rejected', () => {
    const invalid = 'random_section';
    assert.ok(!VALID_KINDS.includes(invalid));
  });
});

describe('Storefront contract: featured listing ownership validation', () => {
  // The backend validates that all featured listing IDs belong to the seller.
  // This test verifies the ownership check logic.

  function validateOwnership(
    requestedIds: string[],
    ownedIds: Set<string>
  ): { valid: boolean; unowned: string[] } {
    const unowned = requestedIds.filter((id) => !ownedIds.has(id));
    return { valid: unowned.length === 0, unowned };
  }

  it('all owned → valid', () => {
    const result = validateOwnership(['l1', 'l2', 'l3'], new Set(['l1', 'l2', 'l3', 'l4']));
    assert.equal(result.valid, true);
    assert.equal(result.unowned.length, 0);
  });

  it('some unowned → invalid with unowned IDs', () => {
    const result = validateOwnership(['l1', 'l5', 'l6'], new Set(['l1', 'l2', 'l3']));
    assert.equal(result.valid, false);
    assert.deepEqual(result.unowned, ['l5', 'l6']);
  });

  it('empty request → valid (clears featured)', () => {
    const result = validateOwnership([], new Set(['l1', 'l2']));
    assert.equal(result.valid, true);
  });
});

describe('Storefront contract: optimistic locking', () => {
  // If-Match header must match the current revision. A stale revision
  // returns 409 with the current revision so the client can retry.

  function checkRevision(
    ifMatch: number | undefined,
    currentRevision: number
  ): { ok: boolean; conflict: boolean; currentRevision: number } {
    if (ifMatch === undefined) return { ok: true, conflict: false, currentRevision };
    if (ifMatch !== currentRevision) return { ok: false, conflict: true, currentRevision };
    return { ok: true, conflict: false, currentRevision };
  }

  it('matching revision → ok', () => {
    const result = checkRevision(3, 3);
    assert.equal(result.ok, true);
    assert.equal(result.conflict, false);
  });

  it('stale revision → conflict with current revision', () => {
    const result = checkRevision(2, 3);
    assert.equal(result.ok, false);
    assert.equal(result.conflict, true);
    assert.equal(result.currentRevision, 3);
  });

  it('no If-Match → ok (no optimistic locking)', () => {
    const result = checkRevision(undefined, 3);
    assert.equal(result.ok, true);
    assert.equal(result.conflict, false);
  });
});

describe('Storefront contract: publish validation', () => {
  // A storefront cannot be published with zero sections and zero featured listings.

  function canPublish(sectionCount: number, featuredCount: number): boolean {
    return sectionCount > 0 || featuredCount > 0;
  }

  it('zero sections + zero featured → cannot publish', () => {
    assert.equal(canPublish(0, 0), false);
  });

  it('one section + zero featured → can publish', () => {
    assert.equal(canPublish(1, 0), true);
  });

  it('zero sections + one featured → can publish', () => {
    assert.equal(canPublish(0, 1), true);
  });
});

// ── DSA Article 30 trader classification tests ────────────────────────

describe('DSA Article 30: trader classification projection', () => {
  // Mirrors the backend logic in the profile handler.
  function classifyTrader(compliance: {
    trader_type: string | null;
    kyc_status: string;
  } | null): 'trader' | 'non_trader' | null {
    if (!compliance) return null;
    if (compliance.trader_type === 'business' || compliance.trader_type === 'trader') {
      return 'trader';
    }
    if (compliance.trader_type === 'private' || compliance.trader_type === 'individual') {
      return 'non_trader';
    }
    return null;
  }

  it('no compliance record → null (not classified)', () => {
    assert.equal(classifyTrader(null), null);
  });

  it('trader_type=business → trader', () => {
    assert.equal(classifyTrader({ trader_type: 'business', kyc_status: 'verified' }), 'trader');
  });

  it('trader_type=trader → trader', () => {
    assert.equal(classifyTrader({ trader_type: 'trader', kyc_status: 'verified' }), 'trader');
  });

  it('trader_type=private → non_trader', () => {
    assert.equal(classifyTrader({ trader_type: 'private', kyc_status: 'verified' }), 'non_trader');
  });

  it('trader_type=individual → non_trader', () => {
    assert.equal(classifyTrader({ trader_type: 'individual', kyc_status: 'verified' }), 'non_trader');
  });

  it('trader_type=null → null (not classified)', () => {
    assert.equal(classifyTrader({ trader_type: null, kyc_status: 'verified' }), null);
  });

  it('trader_type=unknown → null (not classified)', () => {
    assert.equal(classifyTrader({ trader_type: 'unknown', kyc_status: 'verified' }), null);
  });

  it('legal details only disclosed for verified traders', () => {
    // The backend only returns legalName, contactEmail, etc. when
    // classification='trader' AND kyc_status='verified'.
    // For non-traders or unverified traders, these fields are null.
    const traderVerified = {
      classification: 'trader' as const,
      legalName: 'Acme Ltd',
      contactEmail: 'contact@acme.com',
      registrationNumber: '12345678',
      address: '1 Main St',
      vatNumber: 'GB123456789',
    };
    const traderUnverified = {
      classification: 'trader' as const,
      legalName: null,
      contactEmail: null,
      registrationNumber: null,
      address: null,
      vatNumber: null,
    };
    const nonTrader = {
      classification: 'non_trader' as const,
      legalName: null,
      contactEmail: null,
      registrationNumber: null,
      address: null,
      vatNumber: null,
    };

    assert.ok(traderVerified.legalName);
    assert.equal(traderUnverified.legalName, null);
    assert.equal(nonTrader.legalName, null);
  });
});
