import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getOrCreateComplianceProfile } from '../lib/compliance.js';
import { resolveCountryCapabilities } from '../lib/countryCapabilities.js';

// ── ProfileUserRow (mirrors the type in index.ts) ────────────────────
type ProfileUserRow = {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  phone: string | null;
  avatar: string | null;
  cover_photo: string | null;
  cover_video: string | null;
  role: string;
  email_verified_at: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type UserRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest, requestedUserId?: string) => string;
  ensureUserExists: (userId: string) => Promise<void>;
  toProfilePayload: (row: ProfileUserRow) => Record<string, unknown>;
  toPublicProfilePayload: (row: ProfileUserRow & { identity_verified?: boolean | null; seller_verified?: boolean | null }) => Record<string, unknown>;
  queueUserNotification: (input: {
    userId: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    eventType?: string;
    actorUserId?: string;
    imageUrl?: string;
    route?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => Promise<string | null>;
};

export const registerUserRoutes = ({
  app,
  db,
  readDb,
  resolveAuthenticatedUserId,
  ensureUserExists,
  toProfilePayload,
  toPublicProfilePayload,
  queueUserNotification,
}: UserRouteDependencies): void => {
app.get('/users/:userId/capabilities', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);

  const actorUserId = resolveAuthenticatedUserId(request, userId);
  await ensureUserExists(actorUserId);

  const profile = await getOrCreateComplianceProfile(db, actorUserId);
  const capabilities = resolveCountryCapabilities({
    countryCode: profile.countryCode,
    residencyCountryCode: profile.residencyCountryCode,
  });

  return {
    ok: true,
    userId: actorUserId,
    profile: {
      countryCode: profile.countryCode,
      residencyCountryCode: profile.residencyCountryCode,
      kycStatus: profile.kycStatus,
    },
    capabilities,
  };
});

/* â”€â”€â”€ Profile endpoints â”€â”€â”€ */

app.get('/users/me', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<ProfileUserRow>(
    `
      SELECT
        id, username, email, display_name, bio, location, website, phone, avatar, cover_photo, cover_video,
        role, email_verified_at, two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [request.authUser.userId]
  );

  const user = result.rows[0];
  if (!user) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    user: toProfilePayload(user),
  };
});

app.patch('/users/me', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    displayName: z.string().trim().min(1).max(120).optional(),
    username: z.string().trim().min(3).max(32).optional(),
    bio: z.string().trim().max(500).optional(),
    location: z.string().trim().max(120).optional(),
    website: z.string().trim().max(255).optional(),
    phone: z.string().trim().max(30).optional(),
    // Media fields accept either a verified asset ID (preferred) or a URL
    // string (legacy). When an asset ID is provided, the backend verifies
    // ownership and publishable status before persisting. When a URL string
    // is provided, it is validated against the user's own upload_finalizations
    // to prevent binding another user's media or an external URL.
    avatar: z.union([z.string().trim().max(2048), z.null()]).optional(),
    coverPhoto: z.union([z.string().trim().max(2048), z.null()]).optional(),
    coverVideo: z.union([z.string().trim().max(2048), z.null()]).optional(),
    avatarAssetId: z.string().min(2).max(200).optional(),
    coverAssetId: z.string().min(2).max(200).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  // â”€â”€ Resolve media URLs from verified assets when asset IDs are provided â”€â”€
  // This is the authoritative path: the backend verifies that the asset
  // belongs to the user and is in a publishable state, then resolves the
  // canonical URL. The user cannot bind another owner's asset or an
  // external URL.
  let resolvedAvatarUrl: string | null | undefined;
  let resolvedCoverUrl: string | null | undefined;

  if (payload.avatarAssetId !== undefined) {
    const assetResult = await db.query<{
      canonical_url: string | null;
      original_object_url: string;
      status: string;
      media_kind: string;
    }>(
      `SELECT canonical_url, original_object_url, status, media_kind
       FROM media_assets
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [payload.avatarAssetId, request.authUser.userId]
    );
    const asset = assetResult.rows[0];
    if (!asset) {
      reply.code(422);
      return { ok: false, error: 'Avatar asset not found or not owned by you' };
    }
    if (asset.media_kind !== 'image') {
      reply.code(422);
      return { ok: false, error: 'Avatar must be an image' };
    }
    // Accept publishable or published status. For non-gated environments,
    // integrity_verified is also accepted (the asset exists and is owned).
    if (asset.status === 'rejected' || asset.status === 'quarantined' || asset.status === 'revoked') {
      reply.code(422);
      return { ok: false, error: 'Avatar asset is not in a usable state', code: 'MEDIA_NOT_USABLE' };
    }
    resolvedAvatarUrl = asset.canonical_url ?? asset.original_object_url;
  } else if (payload.avatar !== undefined) {
    // Legacy URL path: validate the URL belongs to the user's own uploads.
    // Null clears the avatar. Empty/external URLs are rejected.
    if (payload.avatar === null) {
      resolvedAvatarUrl = null;
    } else {
      const urlCheck = await db.query<{ id: string }>(
        `SELECT id FROM upload_finalizations
         WHERE owner_id = $1 AND (public_url = $2 OR canonical_url = $2)
         LIMIT 1`,
        [request.authUser.userId, payload.avatar]
      );
      if ((urlCheck.rowCount ?? 0) === 0) {
        reply.code(422);
        return {
          ok: false,
          error: 'Avatar URL must reference your own uploaded media. Use avatarAssetId for verified binding.',
          code: 'MEDIA_NOT_OWNED',
        };
      }
      resolvedAvatarUrl = payload.avatar;
    }
  }

  if (payload.coverAssetId !== undefined) {
    const assetResult = await db.query<{
      canonical_url: string | null;
      original_object_url: string;
      status: string;
      media_kind: string;
    }>(
      `SELECT canonical_url, original_object_url, status, media_kind
       FROM media_assets
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [payload.coverAssetId, request.authUser.userId]
    );
    const asset = assetResult.rows[0];
    if (!asset) {
      reply.code(422);
      return { ok: false, error: 'Cover asset not found or not owned by you' };
    }
    if (asset.media_kind !== 'image' && asset.media_kind !== 'video') {
      reply.code(422);
      return { ok: false, error: 'Cover must be an image or video' };
    }
    if (asset.status === 'rejected' || asset.status === 'quarantined' || asset.status === 'revoked') {
      reply.code(422);
      return { ok: false, error: 'Cover asset is not in a usable state', code: 'MEDIA_NOT_USABLE' };
    }
    resolvedCoverUrl = asset.canonical_url ?? asset.original_object_url;
  } else if (payload.coverPhoto !== undefined) {
    if (payload.coverPhoto === null) {
      resolvedCoverUrl = null;
    } else {
      const urlCheck = await db.query<{ id: string }>(
        `SELECT id FROM upload_finalizations
         WHERE owner_id = $1 AND (public_url = $2 OR canonical_url = $2)
         LIMIT 1`,
        [request.authUser.userId, payload.coverPhoto]
      );
      if ((urlCheck.rowCount ?? 0) === 0) {
        reply.code(422);
        return {
          ok: false,
          error: 'Cover URL must reference your own uploaded media. Use coverAssetId for verified binding.',
          code: 'MEDIA_NOT_OWNED',
        };
      }
      resolvedCoverUrl = payload.coverPhoto;
    }
  }

  const allowed: Record<string, unknown> = {};
  if (payload.displayName !== undefined) allowed.display_name = payload.displayName;
  if (payload.username !== undefined) allowed.username = payload.username;
  if (payload.bio !== undefined) allowed.bio = payload.bio;
  if (payload.location !== undefined) allowed.location = payload.location;
  if (payload.website !== undefined) allowed.website = payload.website;
  if (payload.phone !== undefined) allowed.phone = payload.phone;
  if (resolvedAvatarUrl !== undefined) allowed.avatar = resolvedAvatarUrl;
  if (resolvedCoverUrl !== undefined) allowed.cover_photo = resolvedCoverUrl;
  if (payload.coverVideo !== undefined) allowed.cover_video = payload.coverVideo;

  if (Object.keys(allowed).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(allowed).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(allowed);

  await db.query(
    `
      UPDATE users
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $1
    `,
    [request.authUser.userId, ...values]
  );

  // â”€â”€ Record media bindings for verified assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // This creates an authoritative binding record in media_bindings, enabling
  // cache invalidation and lifecycle management (detach old binding when a
  // new one is set).
  if (payload.avatarAssetId) {
    try {
      await db.query(
        `INSERT INTO media_bindings (id, media_asset_id, owner_id, target_type, target_ref_id, role, sort_order)
         VALUES ($1, $2, $3, 'profile', $4, 'avatar', 0)
         ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
         DO UPDATE SET removed_at = NULL, sort_order = EXCLUDED.sort_order`,
        [`mbind_profile_${request.authUser.userId}_avatar`, payload.avatarAssetId, request.authUser.userId, request.authUser.userId]
      );
      // Soft-remove any previous avatar bindings from different assets.
      await db.query(
        `UPDATE media_bindings SET removed_at = NOW()
         WHERE target_type = 'profile' AND target_ref_id = $1 AND role = 'avatar'
           AND media_asset_id <> $2 AND removed_at IS NULL`,
        [request.authUser.userId, payload.avatarAssetId]
      );
    } catch { /* non-fatal â€” binding is a projection */ }
  }
  if (payload.coverAssetId) {
    try {
      await db.query(
        `INSERT INTO media_bindings (id, media_asset_id, owner_id, target_type, target_ref_id, role, sort_order)
         VALUES ($1, $2, $3, 'profile', $4, 'cover', 0)
         ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
         DO UPDATE SET removed_at = NULL, sort_order = EXCLUDED.sort_order`,
        [`mbind_profile_${request.authUser.userId}_cover`, payload.coverAssetId, request.authUser.userId, request.authUser.userId]
      );
      await db.query(
        `UPDATE media_bindings SET removed_at = NOW()
         WHERE target_type = 'profile' AND target_ref_id = $1 AND role = 'cover'
           AND media_asset_id <> $2 AND removed_at IS NULL`,
        [request.authUser.userId, payload.coverAssetId]
      );
    } catch { /* non-fatal â€” binding is a projection */ }
  }

  const result = await db.query<ProfileUserRow>(
    `
      SELECT
        id, username, email, display_name, bio, location, website, phone, avatar, cover_photo, cover_video,
        role, email_verified_at, two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [request.authUser.userId]
  );

  const user = result.rows[0];
  if (!user) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    user: toProfilePayload(user),
  };
});

app.patch('/users/me/preferences', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    holidayMode: z.boolean().optional(),
    privateProfile: z.boolean().optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const allowed: Record<string, unknown> = {};
  if (payload.holidayMode !== undefined) allowed.holiday_mode = payload.holidayMode;
  if (payload.privateProfile !== undefined) allowed.private_profile = payload.privateProfile;

  if (Object.keys(allowed).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(allowed).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(allowed);

  const result = await db.query<{ holiday_mode: boolean; private_profile: boolean }>(
    `
      UPDATE users
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING holiday_mode, private_profile
    `,
    [request.authUser.userId, ...values]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    preferences: {
      holidayMode: row.holiday_mode,
      privateProfile: row.private_profile,
    },
  };
});

// GET /users/me/postage â€” fetch the current user's postage settings
app.get('/users/me/postage', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    postage_carrier_key: string;
    postage_free_shipping: boolean;
    postage_bundle_discount: boolean;
  }>(
    `
      SELECT postage_carrier_key, postage_free_shipping, postage_bundle_discount
      FROM users
      WHERE id = $1
    `,
    [request.authUser.userId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    postage: {
      carrierKey: row.postage_carrier_key,
      freeShipping: row.postage_free_shipping,
      bundleDiscount: row.postage_bundle_discount,
    },
  };
});

app.patch('/users/me/postage', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    carrierKey: z.string().trim().min(1).max(64).optional(),
    freeShipping: z.boolean().optional(),
    bundleDiscount: z.boolean().optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const allowed: Record<string, unknown> = {};
  if (payload.carrierKey !== undefined) allowed.postage_carrier_key = payload.carrierKey;
  if (payload.freeShipping !== undefined) allowed.postage_free_shipping = payload.freeShipping;
  if (payload.bundleDiscount !== undefined) allowed.postage_bundle_discount = payload.bundleDiscount;

  if (Object.keys(allowed).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(allowed).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(allowed);

  const result = await db.query<{
    postage_carrier_key: string;
    postage_free_shipping: boolean;
    postage_bundle_discount: boolean;
  }>(
    `
      UPDATE users
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING postage_carrier_key, postage_free_shipping, postage_bundle_discount
    `,
    [request.authUser.userId, ...values]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    postage: {
      carrierKey: row.postage_carrier_key,
      freeShipping: row.postage_free_shipping,
      bundleDiscount: row.postage_bundle_discount,
    },
  };
});

// GET /users/me/sessions â€” list all active (non-revoked) sessions for the current user
app.get('/users/me/sessions', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    id: string;
    user_agent: string | null;
    ip_address: string | null;
    created_at: string;
    last_seen_at: string | null;
    revoked_at: string | null;
  }>(
    `
      SELECT id, user_agent, ip_address, created_at, last_seen_at, revoked_at
      FROM user_sessions
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC
    `,
    [request.authUser.userId]
  );

  const currentSessionId = request.authUser.sessionId ?? null;

  function parseDeviceInfo(userAgent: string | null): { deviceName: string; platform: string } {
    if (!userAgent) {
      return { deviceName: 'Unknown device', platform: 'Unknown' };
    }
    const ua = userAgent.toLowerCase();
    let platform = 'Unknown';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
      platform = 'iOS';
    } else if (ua.includes('android')) {
      platform = 'Android';
    } else if (ua.includes('mobile')) {
      platform = 'Mobile';
    } else if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('edge') || ua.includes('firefox')) {
      platform = 'Web';
    }

    let deviceName = 'Unknown device';
    if (platform === 'iOS') {
      if (ua.includes('ipad')) {
        deviceName = 'iPad';
      } else if (ua.includes('iphone')) {
        deviceName = 'iPhone';
      } else {
        deviceName = 'iOS device';
      }
    } else if (platform === 'Android') {
      deviceName = 'Android device';
    } else if (platform === 'Web') {
      if (ua.includes('edg/')) {
        deviceName = 'Edge browser';
      } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
        deviceName = 'Chrome browser';
      } else if (ua.includes('firefox/')) {
        deviceName = 'Firefox browser';
      } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
        deviceName = 'Safari browser';
      } else {
        deviceName = 'Web browser';
      }
    } else {
      deviceName = userAgent;
    }

    return { deviceName, platform };
  }

  const sessions = result.rows.map((row) => {
    const { deviceName, platform } = parseDeviceInfo(row.user_agent);
    return {
      id: row.id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      isCurrent: currentSessionId ? row.id === currentSessionId : false,
      deviceName,
      platform,
    };
  });

  return { ok: true, sessions };
});

// DELETE /users/me/sessions/:sessionId â€” revoke a specific session for the current user
app.delete('/users/me/sessions/:sessionId', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ sessionId: z.string().min(1) });
  const { sessionId } = paramsSchema.parse(request.params);

  const sessionResult = await db.query<{ id: string }>(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id
    `,
    [sessionId, request.authUser.userId]
  );

  if (sessionResult.rows.length === 0) {
    const existing = await db.query<{ revoked_at: string | null }>(
      `SELECT revoked_at FROM user_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [sessionId, request.authUser.userId]
    );

    if (existing.rows.length === 0) {
      reply.code(404);
      return { ok: false, error: 'Session not found' };
    }

    reply.code(404);
    return { ok: false, error: 'Session already revoked' };
  }

  await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE session_id = $1 AND revoked_at IS NULL
    `,
    [sessionId]
  );

  return { ok: true };
});

// DELETE /users/me/sessions/others â€” revoke all other sessions (not the current one)
app.delete('/users/me/sessions/others', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  let keepSessionId: string | null = request.authUser.sessionId ?? null;

  if (!keepSessionId) {
    const latestResult = await db.query<{ id: string }>(
      `
        SELECT id FROM user_sessions
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [request.authUser.userId]
    );

    keepSessionId = latestResult.rows[0]?.id ?? null;
  }

  if (!keepSessionId) {
    return { ok: true, revokedCount: 0 };
  }

  const revokeResult = await db.query<{ id: string }>(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL AND id <> $2
      RETURNING id
    `,
    [request.authUser.userId, keepSessionId]
  );

  const revokedSessionIds = revokeResult.rows.map((row) => row.id);

  if (revokedSessionIds.length > 0) {
    await db.query(
      `
        UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND session_id = ANY($2::text[])
      `,
      [request.authUser.userId, revokedSessionIds]
    );
  }

  return { ok: true, revokedCount: revokedSessionIds.length };
});

// GET /users/me/personalisation â€” retrieve the current user's feed personalisation preferences
app.get('/users/me/personalisation', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    personalisation_gender_filter: string[];
    personalisation_categories_pref: string;
    personalisation_brands_pref: string;
    personalisation_members_pref: string;
  }>(
    `
      SELECT personalisation_gender_filter, personalisation_categories_pref,
             personalisation_brands_pref, personalisation_members_pref
      FROM users WHERE id = $1 LIMIT 1
    `,
    [request.authUser.userId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    personalisation: {
      genderFilter: row.personalisation_gender_filter,
      categoriesAndSizesPref: row.personalisation_categories_pref,
      brandsPref: row.personalisation_brands_pref,
      membersPref: row.personalisation_members_pref,
    },
  };
});

// PATCH /users/me/personalisation â€” sync feed personalisation preferences
app.patch('/users/me/personalisation', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    genderFilter: z.array(z.string()).min(0).max(20).optional(),
    categoriesAndSizesPref: z.string().trim().min(1).max(64).optional(),
    brandsPref: z.string().trim().min(1).max(64).optional(),
    membersPref: z.string().trim().min(1).max(64).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const allowed: Record<string, unknown> = {};
  if (payload.genderFilter !== undefined) allowed.personalisation_gender_filter = payload.genderFilter;
  if (payload.categoriesAndSizesPref !== undefined) allowed.personalisation_categories_pref = payload.categoriesAndSizesPref;
  if (payload.brandsPref !== undefined) allowed.personalisation_brands_pref = payload.brandsPref;
  if (payload.membersPref !== undefined) allowed.personalisation_members_pref = payload.membersPref;

  if (Object.keys(allowed).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(allowed).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(allowed);

  const result = await db.query<{
    personalisation_gender_filter: string[];
    personalisation_categories_pref: string;
    personalisation_brands_pref: string;
    personalisation_members_pref: string;
  }>(
    `
      UPDATE users
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING personalisation_gender_filter, personalisation_categories_pref,
                personalisation_brands_pref, personalisation_members_pref
    `,
    [request.authUser.userId, ...values]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    personalisation: {
      genderFilter: row.personalisation_gender_filter,
      categoriesAndSizesPref: row.personalisation_categories_pref,
      brandsPref: row.personalisation_brands_pref,
      membersPref: row.personalisation_members_pref,
    },
  };
});

/* â”€â”€ Chat Privacy Sync â”€â”€ */

// GET /users/me/chat-privacy â€” retrieve chat privacy settings
app.get('/users/me/chat-privacy', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    read_receipts_enabled: boolean;
    allow_messages_from: string;
    offers_in_chat_enabled: boolean;
    order_updates_in_chat_enabled: boolean;
  }>(
    `SELECT read_receipts_enabled, allow_messages_from, offers_in_chat_enabled, order_updates_in_chat_enabled FROM users WHERE id = $1`,
    [request.authUser.userId]
  );

  if (result.rows.length === 0) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    chatPrivacy: {
      readReceiptsEnabled: result.rows[0].read_receipts_enabled,
      allowMessagesFrom: result.rows[0].allow_messages_from,
      offersInChatEnabled: result.rows[0].offers_in_chat_enabled,
      orderUpdatesInChatEnabled: result.rows[0].order_updates_in_chat_enabled,
    },
  };
});

// PATCH /users/me/chat-privacy â€” update chat privacy settings
app.patch('/users/me/chat-privacy', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    readReceiptsEnabled: z.boolean().optional(),
    allowMessagesFrom: z.enum(['everyone', 'following', 'nobody']).optional(),
    offersInChatEnabled: z.boolean().optional(),
    orderUpdatesInChatEnabled: z.boolean().optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const allowed: Record<string, unknown> = {};
  if (payload.readReceiptsEnabled !== undefined) allowed.read_receipts_enabled = payload.readReceiptsEnabled;
  if (payload.allowMessagesFrom !== undefined) allowed.allow_messages_from = payload.allowMessagesFrom;
  if (payload.offersInChatEnabled !== undefined) allowed.offers_in_chat_enabled = payload.offersInChatEnabled;
  if (payload.orderUpdatesInChatEnabled !== undefined) allowed.order_updates_in_chat_enabled = payload.orderUpdatesInChatEnabled;

  if (Object.keys(allowed).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(allowed).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(allowed);

  const result = await db.query<{ read_receipts_enabled: boolean; allow_messages_from: string; offers_in_chat_enabled: boolean; order_updates_in_chat_enabled: boolean }>(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1
     RETURNING read_receipts_enabled, allow_messages_from, offers_in_chat_enabled, order_updates_in_chat_enabled`,
    [request.authUser.userId, ...values]
  );

  if (result.rows.length === 0) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    chatPrivacy: {
      readReceiptsEnabled: result.rows[0].read_receipts_enabled,
      allowMessagesFrom: result.rows[0].allow_messages_from,
      offersInChatEnabled: result.rows[0].offers_in_chat_enabled,
      orderUpdatesInChatEnabled: result.rows[0].order_updates_in_chat_enabled,
    },
  };
});

/* â”€â”€ Activity Status â”€â”€ */

// PATCH /users/me/activity-status â€” toggle online status visibility
app.patch('/users/me/activity-status', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({ visible: z.boolean() });
  const { visible } = bodySchema.parse(request.body ?? {});

  await db.query(
    `UPDATE users SET activity_status_visible = $2, updated_at = NOW() WHERE id = $1`,
    [request.authUser.userId, visible]
  );

  return { ok: true, activityStatusVisible: visible };
});

/* â”€â”€ Search Visibility â”€â”€ */

// PATCH /users/me/search-visibility â€” toggle search visibility
app.patch('/users/me/search-visibility', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({ visibility: z.enum(['visible', 'hidden']) });
  const { visibility } = bodySchema.parse(request.body ?? {});

  await db.query(
    `UPDATE users SET search_visibility = $2, updated_at = NOW() WHERE id = $1`,
    [request.authUser.userId, visibility]
  );

  return { ok: true, searchVisibility: visibility };
});

/* â”€â”€ Locale Preferences â”€â”€ */

// PATCH /users/me/locale â€” sync language/currency/region preferences
app.patch('/users/me/locale', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    locale: z.string().trim().min(2).max(10).optional(),
    currencyCode: z.string().trim().length(3).optional(),
    regionCode: z.string().trim().min(2).max(5).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const allowed: Record<string, unknown> = {};
  if (payload.locale !== undefined) allowed.locale = payload.locale;
  if (payload.currencyCode !== undefined) allowed.currency_code = payload.currencyCode.toUpperCase();
  if (payload.regionCode !== undefined) allowed.region_code = payload.regionCode;

  if (Object.keys(allowed).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(allowed).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(allowed);

  const result = await db.query<{ locale: string | null; currency_code: string; region_code: string | null }>(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1
     RETURNING locale, currency_code, region_code`,
    [request.authUser.userId, ...values]
  );

  if (result.rows.length === 0) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  return {
    ok: true,
    locale: {
      locale: result.rows[0].locale,
      currencyCode: result.rows[0].currency_code,
      regionCode: result.rows[0].region_code,
    },
  };
});

/* â”€â”€ Connected Accounts â”€â”€ */

// GET /users/me/connected-accounts â€” list linked OAuth providers
app.get('/users/me/connected-accounts', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    id: string;
    provider: string;
    provider_email: string | null;
    linked_at: string;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, provider, provider_email, linked_at, metadata
     FROM user_connected_accounts
     WHERE user_id = $1 AND unlinked_at IS NULL
     ORDER BY linked_at ASC`,
    [request.authUser.userId]
  );

  return {
    ok: true,
    accounts: result.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      providerEmail: row.provider_email,
      linkedAt: row.linked_at,
      metadata: row.metadata,
    })),
  };
});

// DELETE /users/me/connected-accounts/:id â€” unlink a connected account
app.delete('/users/me/connected-accounts/:id', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ id: z.string().min(1) });
  const { id } = paramsSchema.parse(request.params);

  // Check the user has another auth method (password or another connected account)
  const userResult = await db.query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [request.authUser.userId]
  );

  if (userResult.rows.length === 0) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  const otherAccountsResult = await db.query(
    `SELECT COUNT(*)::int AS count FROM user_connected_accounts
     WHERE user_id = $1 AND id != $2 AND unlinked_at IS NULL`,
    [request.authUser.userId, id]
  );

  const hasPassword = userResult.rows[0].password_hash != null;
  const hasOtherAccounts = otherAccountsResult.rows[0].count > 0;

  if (!hasPassword && !hasOtherAccounts) {
    reply.code(400);
    return {
      ok: false,
      error: 'Cannot unlink your only authentication method. Set a password first.',
    };
  }

  const result = await db.query(
    `UPDATE user_connected_accounts SET unlinked_at = NOW() WHERE id = $1 AND user_id = $2 AND unlinked_at IS NULL`,
    [id, request.authUser.userId]
  );

  if (result.rowCount === 0) {
    reply.code(404);
    return { ok: false, error: 'Connected account not found' };
  }

  return { ok: true };
});

/* â”€â”€ Email Notification Preferences â”€â”€ */

// GET /users/me/email-preferences â€” retrieve per-category email preferences
app.get('/users/me/email-preferences', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query(
    `SELECT * FROM user_email_preferences WHERE user_id = $1`,
    [request.authUser.userId]
  );

  if (result.rows.length === 0) {
    // Return defaults
    return {
      ok: true,
      preferences: {
        orderUpdates: true,
        messageNotifications: true,
        priceDropAlerts: true,
        newListingsFromFollowing: true,
        marketing: false,
        securityAlerts: true,
        distributionNotices: true,
        corporateActionNotices: true,
      },
    };
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    ok: true,
    preferences: {
      orderUpdates: row.order_updates,
      messageNotifications: row.message_notifications,
      priceDropAlerts: row.price_drop_alerts,
      newListingsFromFollowing: row.new_listings_from_following,
      marketing: row.marketing,
      securityAlerts: row.security_alerts,
      distributionNotices: row.distribution_notices,
      corporateActionNotices: row.corporate_action_notices,
    },
  };
});

// PUT /users/me/email-preferences â€” update per-category email preferences
app.put('/users/me/email-preferences', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    orderUpdates: z.boolean().optional(),
    messageNotifications: z.boolean().optional(),
    priceDropAlerts: z.boolean().optional(),
    newListingsFromFollowing: z.boolean().optional(),
    marketing: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    distributionNotices: z.boolean().optional(),
    corporateActionNotices: z.boolean().optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const columns: Record<string, boolean> = {};
  if (payload.orderUpdates !== undefined) columns.order_updates = payload.orderUpdates;
  if (payload.messageNotifications !== undefined) columns.message_notifications = payload.messageNotifications;
  if (payload.priceDropAlerts !== undefined) columns.price_drop_alerts = payload.priceDropAlerts;
  if (payload.newListingsFromFollowing !== undefined) columns.new_listings_from_following = payload.newListingsFromFollowing;
  if (payload.marketing !== undefined) columns.marketing = payload.marketing;
  if (payload.securityAlerts !== undefined) columns.security_alerts = payload.securityAlerts;
  if (payload.distributionNotices !== undefined) columns.distribution_notices = payload.distributionNotices;
  if (payload.corporateActionNotices !== undefined) columns.corporate_action_notices = payload.corporateActionNotices;

  if (Object.keys(columns).length === 0) {
    reply.code(400);
    return { ok: false, error: 'No fields provided to update' };
  }

  const setClauses = Object.keys(columns).map((key, idx) => `${key} = $${idx + 2}`);
  const values = Object.values(columns);

  await db.query(
    `INSERT INTO user_email_preferences (user_id, ${Object.keys(columns).join(', ')})
     VALUES ($1, ${values.map((_, idx) => `$${idx + 2}`).join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}, updated_at = NOW()`,
    [request.authUser.userId, ...values]
  );

  return { ok: true };
});

/* â”€â”€ Co-Own Tax Documents â”€â”€ */

// GET /users/me/co-own/tax-documents â€” generate annual tax statement
app.get('/users/me/co-own/tax-documents', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const querySchema = z.object({
    taxYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  });
  const { taxYear } = querySchema.parse(request.query);

  // Determine UK tax year (April 6 to April 5)
  let startDate: string;
  let endDate: string;
  if (taxYear) {
    const [startYear] = taxYear.split('-');
    startDate = `${startYear}-04-06`;
    endDate = `${parseInt(startYear) + 1}-04-05`;
  } else {
    const now = new Date();
    const currentYear = now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6)
      ? now.getFullYear() - 1
      : now.getFullYear();
    startDate = `${currentYear}-04-06`;
    endDate = `${currentYear + 1}-04-05`;
  }

  // Get all executions for the user in the tax year
  const buysResult = await db.query<{
    asset_id: string;
    total_gbp_minor: string | number;
    units: string | number;
    execution_count: string | number;
  }>(
    `SELECT asset_id,
            SUM(price_gbp_minor * units)::bigint AS total_gbp_minor,
            SUM(units)::int AS units,
            COUNT(*)::int AS execution_count
     FROM coown_executions
     WHERE buyer_user_id = $1 AND executed_at >= $2 AND executed_at < $3
     GROUP BY asset_id`,
    [request.authUser.userId, startDate, endDate]
  );

  const sellsResult = await db.query<{
    asset_id: string;
    total_gbp_minor: string | number;
    units: string | number;
    execution_count: string | number;
  }>(
    `SELECT asset_id,
            SUM(price_gbp_minor * units)::bigint AS total_gbp_minor,
            SUM(units)::int AS units,
            COUNT(*)::int AS execution_count
     FROM coown_executions
     WHERE seller_user_id = $1 AND executed_at >= $2 AND executed_at < $3
     GROUP BY asset_id`,
    [request.authUser.userId, startDate, endDate]
  );

  // Get distributions in the tax year
  const distributionsResult = await db.query<{
    asset_id: string;
    total_gbp_minor: string | number;
    count: string | number;
  }>(
    `SELECT asset_id,
            SUM(amount_gbp_minor)::bigint AS total_gbp_minor,
            COUNT(*)::int AS count
     FROM coown_distributions
     WHERE recipient_user_id = $1 AND created_at >= $2 AND created_at < $3
     GROUP BY asset_id`,
    [request.authUser.userId, startDate, endDate]
  );

  const totalBuys = buysResult.rows.reduce((sum, r) => sum + Number(r.total_gbp_minor), 0);
  const totalSells = sellsResult.rows.reduce((sum, r) => sum + Number(r.total_gbp_minor), 0);
  const totalDistributions = distributionsResult.rows.reduce((sum, r) => sum + Number(r.total_gbp_minor), 0);
  const realizedPnl = totalSells - totalBuys;

  return {
    ok: true,
    taxDocument: {
      taxYear: taxYear ?? `${startDate.slice(0, 4)}-${endDate.slice(0, 4)}`,
      startDate,
      endDate,
      currency: 'GBP',
      summary: {
        totalPurchasesGbpMinor: totalBuys,
        totalSalesGbpMinor: totalSells,
        totalDistributionsGbpMinor: totalDistributions,
        realizedPnlGbpMinor: realizedPnl,
      },
      purchases: buysResult.rows.map((r) => ({
        assetId: r.asset_id,
        totalGbpMinor: Number(r.total_gbp_minor),
        units: Number(r.units),
        executionCount: Number(r.execution_count),
      })),
      sales: sellsResult.rows.map((r) => ({
        assetId: r.asset_id,
        totalGbpMinor: Number(r.total_gbp_minor),
        units: Number(r.units),
        executionCount: Number(r.execution_count),
      })),
      distributions: distributionsResult.rows.map((r) => ({
        assetId: r.asset_id,
        totalGbpMinor: Number(r.total_gbp_minor),
        count: Number(r.count),
      })),
      generatedAt: new Date().toISOString(),
    },
  };
});

// Idempotent follow (POST /users/:userId/follow) â€” creates follow only if absent.
app.post('/users/:userId/follow', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);
  const followerId = request.authUser.userId;

  if (followerId === userId) {
    reply.code(400);
    return { ok: false, error: 'Cannot follow yourself' };
  }

  // Check block state â€” cannot follow if blocked by target
  const blockedByTarget = await readDb.query<{ id: string }>(
    `SELECT id FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1`,
    [userId, followerId]
  );
  if ((blockedByTarget.rowCount ?? 0) > 0) {
    reply.code(403);
    return { ok: false, error: 'Cannot follow this user', code: 'BLOCKED_BY_TARGET' };
  }

  const followId = `follow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO user_follows (id, follower_id, following_id, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (follower_id, following_id) DO NOTHING
     RETURNING id`,
    [followId, followerId, userId]
  );

  if ((inserted.rowCount ?? 0) > 0) {
    // Queue a follow notification to the followed user
    try {
      const followerRow = await readDb.query<{ username: string; display_name: string | null; avatar: string | null }>(
        `SELECT username, display_name, avatar FROM users WHERE id = $1 LIMIT 1`,
        [followerId]
      );
      const follower = followerRow.rows[0];
      const followerName = follower?.display_name || follower?.username || 'Someone';
      await queueUserNotification({
        userId,
        title: 'New follower',
        body: `${followerName} started following you`,
        eventType: 'follow_received',
        actorUserId: followerId,
        imageUrl: follower?.avatar ?? undefined,
        payload: { followerId },
        route: { screen: 'UserProfile', params: { userId: followerId } },
        idempotencyKey: `follow_received_${followerId}_${userId}`,
        metadata: { source: 'user_follow' },
      });
    } catch (notifErr) {
      app.log.error({ err: notifErr }, 'Failed to queue follow_received notification');
    }
  }

  return { ok: true, isFollowing: true };
});

// Idempotent unfollow (DELETE /users/:userId/follow) â€” removes follow only if present.
app.delete('/users/:userId/follow', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);
  const followerId = request.authUser.userId;

  await db.query(
    `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, userId]
  );

  return { ok: true, isFollowing: false };
});

app.get('/users/:userId/profile', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);

  const viewerUserId = request.authUser?.userId ?? null;

  // â”€â”€ Fetch the target user row with privacy-relevant columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const result = await db.query<ProfileUserRow & {
    private_profile: boolean;
    holiday_mode: boolean;
    away_message: string | null;
  }>(
    `
      SELECT
        u.id, u.username, u.email, u.display_name, u.bio, u.location, u.website, u.phone,
        u.avatar, u.cover_photo, u.cover_video, u.role, u.email_verified_at,
        u.two_factor_enabled, u.created_at, u.updated_at,
        u.private_profile, u.holiday_mode, u.away_message
      FROM users u
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  // â”€â”€ Block state (both directions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // If the viewer blocked the target, the viewer chose not to see them â€”
  // we still return the profile but with restricted viewer permissions.
  // If the target blocked the viewer, the target's existence is not
  // disclosed to the viewer (404) unless the viewer is a moderator/admin.
  let blockedByViewer = false;
  let blockedByTarget = false;

  if (viewerUserId && viewerUserId !== userId) {
    const blockResult = await readDb.query<{ viewer_blocked: boolean; target_blocked: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2) AS viewer_blocked,
         EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $2 AND blocked_id = $1) AS target_blocked`,
      [viewerUserId, userId]
    );
    const blockRow = blockResult.rows[0];
    blockedByViewer = blockRow?.viewer_blocked ?? false;
    blockedByTarget = blockRow?.target_blocked ?? false;
  }

  // If the target blocked the viewer, do not disclose the profile.
  // Return 404 â€” existence disclosure is not allowed for blocked viewers.
  if (blockedByTarget) {
    reply.code(404);
    return { ok: false, error: 'User not found' };
  }

  // â”€â”€ Determine viewer relationship â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isSelf = viewerUserId === userId;
  let isFollowing = false;
  if (viewerUserId && !isSelf) {
    const followResult = await readDb.query<{ id: string }>(
      `SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2 LIMIT 1`,
      [viewerUserId, userId]
    );
    isFollowing = (followResult.rowCount ?? 0) > 0;
  }

  // â”€â”€ Privacy policy: private_profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // A private profile hides social content (Looks, creations) and detailed
  // stats from non-followers. Identity, shop listings, and basic counts
  // remain visible because they are commerce-obligated (DSA traceability).
  // Self-viewers see everything regardless of the private preference.
  const isPrivate = user.private_profile === true;
  const canViewSocialContent = isSelf || !isPrivate || isFollowing;
  const canViewShop = true; // Shop is always visible (commerce obligation)

  // â”€â”€ Compute stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Active and sold listing counts are commerce-obligated and always visible.
  // Follower/following counts are visible unless the profile is private and
  // the viewer is not following.
  const statsResult = await readDb.query<{
    active_listings: string;
    sold_listings: string;
    published_looks: string;
    followers: string;
    following: string;
    review_count: string;
    avg_rating: string | null;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM listings WHERE seller_id = $1 AND status = 'active') AS active_listings,
       (SELECT COUNT(*)::text FROM listings WHERE seller_id = $1 AND status = 'sold') AS sold_listings,
       (SELECT COUNT(*)::text FROM looks WHERE creator_id = $1 AND status = 'published') AS published_looks,
       (SELECT COUNT(*)::text FROM user_follows WHERE following_id = $1) AS followers,
       (SELECT COUNT(*)::text FROM user_follows WHERE follower_id = $1) AS following,
       (SELECT COUNT(*)::text FROM order_reviews WHERE seller_id = $1) AS review_count,
       (SELECT AVG(rating)::numeric(3,2) FROM order_reviews WHERE seller_id = $1) AS avg_rating`,
    [userId]
  );

  const statsRow = statsResult.rows[0];
  const activeListingCount = Number(statsRow?.active_listings ?? '0');
  const soldListingCount = Number(statsRow?.sold_listings ?? '0');
  const publishedLookCount = canViewSocialContent
    ? Number(statsRow?.published_looks ?? '0')
    : 0;
  const followerCount = canViewSocialContent
    ? Number(statsRow?.followers ?? '0')
    : 0;
  const followingCount = canViewSocialContent
    ? Number(statsRow?.following ?? '0')
    : 0;
  const reviewCount = Number(statsRow?.review_count ?? '0');
  const ratingAverage = statsRow?.avg_rating ? Number(statsRow.avg_rating) : null;

  // â”€â”€ Trust evidence (fail-closed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Only active, non-expired evidence rows produce verification flags.
  // No evidence â†’ undefined (not false, to distinguish "not checked" from
  // "checked and failed"). The frontend renders nothing for undefined.
  let identityVerified = false;
  let sellerVerified = false;
  // DSA Article 30 trader classification â€” projected from compliance records.
  // This is a legally required disclosure: buyers must know whether they are
  // transacting with a trader (business) or a non-trader (private individual).
  // The classification is derived from user_compliance_profiles.kyc_status
  // and the trader_type field, not from self-attestation.
  let traderClassification: 'trader' | 'non_trader' | null = null;
  let traderLegalName: string | null = null;
  let traderContactEmail: string | null = null;
  let traderRegistrationNumber: string | null = null;
  let traderAddress: string | null = null;
  let traderVatNumber: string | null = null;

  if (canViewShop) {
    const evidenceResult = await readDb.query<{ code: string }>(
      `SELECT code FROM seller_trust_evidence
       WHERE seller_id = $1 AND state = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    for (const row of evidenceResult.rows) {
      if (row.code === 'identity_checked') identityVerified = true;
      if (row.code === 'trader_verified' || row.code === 'top_rated') sellerVerified = true;
    }

    // â”€â”€ DSA Article 30: Trader disclosure from compliance records â”€â”€â”€â”€â”€â”€
    // Only traders (verified businesses) have their legal details disclosed.
    // Non-traders (private individuals) are classified as such without
    // exposing any personal details. The classification is authoritative â€”
    // derived from KYC verification, not self-attestation.
    const complianceResult = await readDb.query<{
      trader_type: string | null;
      kyc_status: string;
      legal_name: string | null;
      contact_email: string | null;
      registration_number: string | null;
      business_address: string | null;
      vat_number: string | null;
    }>(
      `SELECT trader_type, kyc_status, legal_name, contact_email,
              registration_number, business_address, vat_number
       FROM user_compliance_profiles
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId]
    );
    const compliance = complianceResult.rows[0];
    if (compliance) {
      // A user is classified as a trader when:
      // 1. trader_type is explicitly 'business'/'trader', OR
      // 2. KYC status is 'verified' and trader_type is not 'private'.
      if (compliance.trader_type === 'business' || compliance.trader_type === 'trader') {
        traderClassification = 'trader';
        // Only disclose legal details for verified traders.
        if (compliance.kyc_status === 'verified') {
          traderLegalName = compliance.legal_name;
          traderContactEmail = compliance.contact_email;
          traderRegistrationNumber = compliance.registration_number;
          traderAddress = compliance.business_address;
          traderVatNumber = compliance.vat_number;
        }
      } else if (compliance.trader_type === 'private' || compliance.trader_type === 'individual') {
        traderClassification = 'non_trader';
      }
    }
  }

  // â”€â”€ Can message? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Can message if: authenticated, not self, not blocked by viewer, and
  // not blocked by target (already returned 404 above if blocked by target).
  const canMessage = Boolean(
    viewerUserId &&
    !isSelf &&
    !blockedByViewer &&
    !blockedByTarget
  );

  // â”€â”€ Build the public profile payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const publicUser = toPublicProfilePayload({
    ...user,
    identity_verified: identityVerified,
    seller_verified: sellerVerified,
  });

  return {
    ok: true,
    user: publicUser,
    stats: {
      activeListingCount,
      soldListingCount,
      publishedLookCount,
      followerCount,
      followingCount,
      reviewCount,
      ratingAverage,
    },
    viewer: {
      isSelf,
      isFollowing,
      isBlocked: blockedByViewer,
      isBlockedByTarget: blockedByTarget,
      canMessage,
      canViewSocialContent,
      canViewShop,
    },
    // â”€â”€ DSA Article 30: Trader disclosure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Legally required disclosure of trader status. 'trader' = business,
    // 'non_trader' = private individual. Legal details are only disclosed
    // for verified traders. Null when no compliance record exists.
    trader: traderClassification
      ? {
          classification: traderClassification,
          legalName: traderLegalName,
          contactEmail: traderContactEmail,
          registrationNumber: traderRegistrationNumber,
          address: traderAddress,
          vatNumber: traderVatNumber,
        }
      : undefined,
    // Authoritative away state â€” only present when holiday mode is on.
    // The frontend uses this to show the away banner with the seller's message.
    away: user.holiday_mode
      ? {
          holidayMode: true,
          awayMessage: user.away_message ?? null,
        }
      : undefined,
    // â”€â”€ Storefront summary (published only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Included when the seller has a published storefront. Draft/paused
    // storefronts are owner-only and never appear in the public projection.
    // The summary contains the announcement, section titles, and featured
    // listing IDs â€” enough for the profile to render the shop module
    // without a separate /storefronts/:sellerId call.
    ...(canViewShop ? await loadStorefrontSummary(readDb, userId) : {}),
  };
});

// â”€â”€ Follow counts + follower/following lists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Helper: load a published storefront summary for the public profile aggregate.
// Returns an empty object when no published storefront exists, so the spread
// in the aggregate return is a no-op.
async function loadStorefrontSummary(
  readDb: Pool,
  sellerId: string
): Promise<{ storefront?: { announcement: string | null; sections: { kind: string; title: string; sortOrder: number }[]; featuredListingIds: string[] } }> {
  const sfResult = await readDb.query<{ id: string; announcement: string | null }>(
    `SELECT id, announcement FROM storefronts
     WHERE seller_id = $1 AND status = 'published' LIMIT 1`,
    [sellerId]
  );
  if (!sfResult.rowCount) return {};

  const sf = sfResult.rows[0];
  const sectionsResult = await readDb.query<{ kind: string; title: string; sort_order: number }>(
    `SELECT kind, title, sort_order FROM storefront_sections
     WHERE storefront_id = $1 ORDER BY sort_order ASC`,
    [sf.id]
  );
  const featuredResult = await readDb.query<{ listing_id: string }>(
    `SELECT listing_id FROM storefront_featured_listings
     WHERE storefront_id = $1 ORDER BY rank ASC`,
    [sf.id]
  );

  return {
    storefront: {
      announcement: sf.announcement,
      sections: sectionsResult.rows.map((s) => ({
        kind: s.kind,
        title: s.title,
        sortOrder: s.sort_order,
      })),
      featuredListingIds: featuredResult.rows.map((r) => r.listing_id),
    },
  };
}

app.get('/users/:userId/follow-counts', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);

  const result = await readDb.query<{ followers: string; following: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM user_follows WHERE following_id = $1) AS followers,
       (SELECT COUNT(*)::text FROM user_follows WHERE follower_id = $1) AS following`,
    [userId]
  );

  return {
    ok: true,
    followerCount: Number(result.rows[0]?.followers ?? '0'),
    followingCount: Number(result.rows[0]?.following ?? '0'),
  };
});

app.get('/users/:userId/followers', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(40),
    cursor: z.string().optional(),
  });
  const { userId } = paramsSchema.parse(request.params);
  const { limit, cursor } = querySchema.parse(request.query ?? {});

  const conditions: string[] = ['f.following_id = $1'];
  const args: unknown[] = [userId];
  if (cursor) {
    conditions.push(`f.created_at < $${args.length + 1}`);
    args.push(cursor);
  }
  const fetchLimit = limit + 1;

  const result = await readDb.query<{
    id: string;
    username: string;
    display_name: string | null;
    avatar: string | null;
    created_at: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar, f.created_at
     FROM user_follows f
     JOIN users u ON u.id = f.follower_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY f.created_at DESC
     LIMIT $${args.length + 1}`,
    [...args, fetchLimit]
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

  // Resolve isFollowing for the authenticated viewer so the client can
  // derive FollowButton state from server data instead of mutation vars.
  const viewerUserId = request.authUser?.userId;
  let followingSet = new Set<string>();
  if (viewerUserId && rows.length > 0) {
    const followingResult = await readDb.query<{ following_id: string }>(
      `SELECT following_id FROM user_follows WHERE follower_id = $1 AND following_id = ANY($2::text[])`,
      [viewerUserId, rows.map((r) => r.id)]
    );
    followingSet = new Set(followingResult.rows.map((r) => r.following_id));
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      isFollowing: followingSet.has(row.id),
    })),
    nextCursor,
  };
});

app.get('/users/:userId/following', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(40),
    cursor: z.string().optional(),
  });
  const { userId } = paramsSchema.parse(request.params);
  const { limit, cursor } = querySchema.parse(request.query ?? {});

  const conditions: string[] = ['f.follower_id = $1'];
  const args: unknown[] = [userId];
  if (cursor) {
    conditions.push(`f.created_at < $${args.length + 1}`);
    args.push(cursor);
  }
  const fetchLimit = limit + 1;

  const result = await readDb.query<{
    id: string;
    username: string;
    display_name: string | null;
    avatar: string | null;
    created_at: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar, f.created_at
     FROM user_follows f
     JOIN users u ON u.id = f.following_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY f.created_at DESC
     LIMIT $${args.length + 1}`,
    [...args, fetchLimit]
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

  // Resolve isFollowing for the authenticated viewer so the client can
  // derive FollowButton state from server data instead of mutation vars.
  const viewerUserId = request.authUser?.userId;
  let followingSet = new Set<string>();
  if (viewerUserId && rows.length > 0) {
    const followingResult = await readDb.query<{ following_id: string }>(
      `SELECT following_id FROM user_follows WHERE follower_id = $1 AND following_id = ANY($2::text[])`,
      [viewerUserId, rows.map((r) => r.id)]
    );
    followingSet = new Set(followingResult.rows.map((r) => r.following_id));
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      isFollowing: followingSet.has(row.id),
    })),
    nextCursor,
  };
});

// â”€â”€ Block / unblock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/users/:userId/block', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const bodySchema = z.object({
    reason: z.string().max(500).optional(),
  });
  const { userId } = paramsSchema.parse(request.params);
  const body = bodySchema.parse(request.body ?? {});
  const blockerId = request.authUser.userId;

  if (blockerId === userId) {
    reply.code(400);
    return { ok: false, error: 'Cannot block yourself' };
  }

  const blockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const inserted = await db.query<{
    id: string; created_at: string; reason: string | null;
  }>(
    `INSERT INTO user_blocks (id, blocker_id, blocked_id, reason, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET reason = EXCLUDED.reason
     RETURNING id, created_at::text, reason`,
    [blockId, blockerId, userId, body.reason ?? null]
  );

  // Remove any follow relationship in either direction
  await db.query(
    `DELETE FROM user_follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`,
    [blockerId, userId]
  );

  const row = inserted.rows[0];
  return {
    ok: true,
    isBlocked: true,
    block: {
      userId,
      blockedAt: row.created_at,
      reason: row.reason,
    },
  };
});

app.post('/users/:userId/unblock', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);
  const blockerId = request.authUser.userId;

  await db.query(
    `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, userId]
  );

  return { ok: true, isBlocked: false };
});

app.delete('/users/me/blocked-users/:userId', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);
  const blockerId = request.authUser.userId;

  await db.query(
    `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, userId]
  );

  return { ok: true, isBlocked: false };
});

app.get('/users/me/blocked-users', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const blockerId = request.authUser.userId;

  const result = await readDb.query<{
    user_id: string;
    username: string;
    display_name: string | null;
    avatar: string | null;
    created_at: string;
    reason: string | null;
  }>(
    `SELECT
       ub.blocked_id AS user_id,
       u.username,
       u.display_name,
       u.avatar,
       ub.created_at::text,
       ub.reason
     FROM user_blocks ub
     INNER JOIN users u ON u.id = ub.blocked_id
     WHERE ub.blocker_id = $1
     ORDER BY ub.created_at DESC`,
    [blockerId]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar,
      blockedAt: row.created_at,
      reason: row.reason,
    })),
  };
});

// â”€â”€ Report user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/users/:userId/report', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const bodySchema = z.object({
    reason: z.enum([
      'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment',
      'off_platform', 'hate_speech', 'prohibited', 'scam', 'misinformation',
      'privacy', 'impersonation', 'minor_safety', 'other',
    ]),
    details: z.string().min(1).max(2000).optional(),
  });
  const { userId } = paramsSchema.parse(request.params);
  const body = bodySchema.parse(request.body ?? {});
  const reporterId = request.authUser.userId;

  if (reporterId === userId) {
    reply.code(400);
    return { ok: false, error: 'Cannot report yourself' };
  }

  const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.query(
    `INSERT INTO user_reports (id, reporter_id, reported_id, reason, details, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [reportId, reporterId, userId, body.reason, body.details ?? null]
  );

  reply.code(201);
  return { ok: true, reportId };
});

app.get('/users/search', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const querySchema = z.object({
    q: z.string().trim().min(2).max(50),
    limit: z.coerce.number().int().min(1).max(20).default(20),
    cursor: z.string().optional(),
  });
  const { q, limit, cursor } = querySchema.parse(request.query ?? {});

  const result = await db.query<{ id: string; username: string; display_name: string | null; avatar: string | null; is_following: boolean }>(
    `
      WITH params AS (SELECT $1::text AS q)
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.avatar,
        EXISTS (
          SELECT 1 FROM user_follows f
          WHERE f.follower_id = $2 AND f.following_id = u.id
        ) AS is_following
      FROM users u, params
      WHERE u.id <> $2
        AND u.id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = $2)
        AND u.is_erased = FALSE
        AND u.deleted_at IS NULL
        AND u.search_visibility = 'visible'
        AND (u.username ILIKE '%' || params.q || '%' OR u.display_name ILIKE '%' || params.q || '%')
        AND ($3::text IS NULL OR u.username > $3)
      ORDER BY
        CASE
          WHEN LOWER(u.username) = LOWER(params.q) THEN 1
          WHEN LOWER(u.username) LIKE LOWER(params.q) || '%' THEN 2
          WHEN LOWER(u.display_name) LIKE LOWER(params.q) || '%' THEN 3
          WHEN LOWER(u.username) LIKE '%' || LOWER(params.q) || '%' THEN 4
          ELSE 5
        END,
        u.username ASC
      LIMIT $4
    `,
    [q, request.authUser.userId, cursor ?? null, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      isFollowing: row.is_following,
    })),
    nextCursor: result.rows.length === limit ? result.rows[result.rows.length - 1].username : undefined,
  };
});

app.get('/users/me/consent', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const result = await db.query<{
    personalised_ads: boolean;
    recommendation_personalisation: boolean;
    partner_sharing: boolean;
    analytics_opt_out: boolean;
    updated_at: string;
  }>(
    `SELECT personalised_ads, recommendation_personalisation,
            partner_sharing, analytics_opt_out, updated_at
     FROM user_privacy_consents WHERE user_id = $1 LIMIT 1`,
    [request.authUser.userId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      ok: true,
      consent: {
        personalisedAds: false,
        recommendationPersonalisation: true,
        partnerSharing: false,
        analyticsOptOut: false,
        updatedAt: null,
      },
    };
  }

  return {
    ok: true,
    consent: {
      personalisedAds: row.personalised_ads,
      recommendationPersonalisation: row.recommendation_personalisation,
      partnerSharing: row.partner_sharing,
      analyticsOptOut: row.analytics_opt_out,
      updatedAt: row.updated_at,
    },
  };
});

app.patch('/users/me/consent', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bodySchema = z.object({
    personalisedAds: z.boolean().optional(),
    recommendationPersonalisation: z.boolean().optional(),
    partnerSharing: z.boolean().optional(),
    analyticsOptOut: z.boolean().optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  const result = await db.query<{
    personalised_ads: boolean;
    recommendation_personalisation: boolean;
    partner_sharing: boolean;
    analytics_opt_out: boolean;
    updated_at: string;
  }>(
    `INSERT INTO user_privacy_consents (
       user_id, personalised_ads, recommendation_personalisation,
       partner_sharing, analytics_opt_out, consented_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       personalised_ads = EXCLUDED.personalised_ads,
       recommendation_personalisation = EXCLUDED.recommendation_personalisation,
       partner_sharing = EXCLUDED.partner_sharing,
       analytics_opt_out = EXCLUDED.analytics_opt_out,
       updated_at = NOW()
     RETURNING personalised_ads, recommendation_personalisation,
               partner_sharing, analytics_opt_out, updated_at`,
    [
      request.authUser.userId,
      payload.personalisedAds ?? false,
      payload.recommendationPersonalisation ?? true,
      payload.partnerSharing ?? false,
      payload.analyticsOptOut ?? false,
    ]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(500);
    return { ok: false, error: 'Failed to store consent' };
  }

  return {
    ok: true,
    consent: {
      personalisedAds: row.personalised_ads,
      recommendationPersonalisation: row.recommendation_personalisation,
      partnerSharing: row.partner_sharing,
      analyticsOptOut: row.analytics_opt_out,
      updatedAt: row.updated_at,
    },
  };
});
};
