import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type ComplianceRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
};

const optOutSaleBodySchema = z.object({
  optOut: z.boolean().default(true),
});

const requestDeletionBodySchema = z.object({
  reason: z.string().max(500).optional(),
  confirm: z.literal(true),
});

const DATA_CATEGORIES = [
  {
    category: 'Identifiers',
    description: 'Name, email address, username, user ID, device identifiers',
    collected: true,
    purpose: 'Account creation, authentication, and account management',
  },
  {
    category: 'Commercial Information',
    description: 'Purchase history, order details, transaction records',
    collected: true,
    purpose: 'Processing orders, payments, and marketplace transactions',
  },
  {
    category: 'Financial Information',
    description: 'Payment method details, wallet balance, payout account info',
    collected: true,
    purpose: 'Processing payments, refunds, and seller payouts',
  },
  {
    category: 'Internet or Network Activity',
    description: 'Browsing history, search queries, interactions, app usage',
    collected: true,
    purpose: 'Personalized recommendations, search, and feed content',
  },
  {
    category: 'Geolocation Data',
    description: 'Approximate location derived from IP address',
    collected: true,
    purpose: 'Fraud detection, shipping logistics, and compliance',
  },
  {
    category: 'Professional or Employment Information',
    description: 'KYC verification documents, seller business details',
    collected: true,
    purpose: 'Identity verification, KYC/AML compliance, seller onboarding',
  },
  {
    category: 'Inferences',
    description: 'Risk scores, recommendation preferences, AI usage patterns',
    collected: true,
    purpose: 'Fraud detection, content recommendations, AI feature personalization',
  },
  {
    category: 'Sensitive Personal Information',
    description: 'Government ID numbers (for KYC), biometric data (if applicable)',
    collected: false,
    purpose: 'Not collected; KYC verification uses document images only',
  },
] as const;

const PRIVACY_POLICY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL
  || process.env.PRIVACY_POLICY_URL
  || 'https://thryftverse.com/privacy';

const TERMS_OF_SERVICE_URL = process.env.EXPO_PUBLIC_TERMS_URL
  || process.env.TERMS_OF_SERVICE_URL
  || 'https://thryftverse.com/terms';

/**
 * Register CCPA compliance routes.
 *
 * Endpoints:
 *   GET  /compliance/privacy-policy        — public, returns privacy policy URL + data summary
 *   GET  /compliance/data-categories       — public, returns categories of data collected
 *   POST /compliance/ccpa/request-data     — authenticated, starts a CCPA data export job
 *   POST /compliance/ccpa/request-deletion — authenticated, starts a CCPA data deletion job
 *   POST /compliance/ccpa/opt-out-sale     — authenticated, opts user out of data sale
 *   GET  /compliance/ccpa/status           — authenticated, returns pending CCPA request status
 */
export function registerComplianceRoutes({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: ComplianceRouteDependencies): void {
  app.get('/compliance/privacy-policy', async () => {
    return {
      ok: true,
      privacyPolicyUrl: PRIVACY_POLICY_URL,
      termsOfServiceUrl: TERMS_OF_SERVICE_URL,
      dataCollectionSummary: DATA_CATEGORIES.map((c) => ({
        category: c.category,
        collected: c.collected,
        purpose: c.purpose,
      })),
    };
  });

  app.get('/compliance/data-categories', async () => {
    return {
      ok: true,
      categories: DATA_CATEGORIES,
      notice:
        'This information is provided in accordance with the California Consumer Privacy Act (CCPA). '
        + 'Consumers have the right to know what personal information is collected, request deletion, '
        + 'and opt out of the sale of their personal information.',
    };
  });

  app.post('/compliance/ccpa/request-data', async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }

    const userId = resolveAuthenticatedUserId(request);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query<{
        id: string;
        username: string;
        email: string | null;
        role: string;
        email_verified_at: string | null;
        created_at: string;
        last_login_at: string | null;
        two_factor_enabled: boolean;
        ccpa_opt_out_sale: boolean;
      }>(
        `
          SELECT
            id, username, email, role,
            email_verified_at::text, created_at::text, last_login_at::text,
            two_factor_enabled, ccpa_opt_out_sale
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [userId],
      );

      const user = userResult.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        throw createApiError('USER_NOT_FOUND', 'User account does not exist', { userId });
      }

      await client.query(
        `
          UPDATE users
          SET ccpa_data_export_requested_at = NOW()
          WHERE id = $1
        `,
        [userId],
      );

      const [
        addresses,
        paymentMethods,
        sessions,
        interactions,
        orders,
        auctionBids,
        consents,
        profile,
        kycCases,
        amlAlerts,
        aiUsageEvents,
      ] = await Promise.all([
        client.query('SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY updated_at DESC', [userId]),
        client.query('SELECT * FROM user_payment_methods WHERE user_id = $1 ORDER BY updated_at DESC', [userId]),
        client.query(
          'SELECT id, created_at, last_seen_at, revoked_at, user_agent, ip_address FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC',
          [userId],
        ),
        client.query('SELECT * FROM interactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
        client.query('SELECT * FROM orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
        client.query('SELECT * FROM auction_bids WHERE bidder_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
        client.query('SELECT * FROM user_consents WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 1000', [userId]),
        client.query('SELECT * FROM user_compliance_profiles WHERE user_id = $1 LIMIT 1', [userId]),
        client.query('SELECT * FROM kyc_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]),
        client.query('SELECT * FROM aml_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]),
        client.query(
          `SELECT
             id, conversation_id, bot_id, provider, model, status,
             input_tokens, output_tokens, total_tokens,
             estimated_cost_microusd, pricing_version, created_at
           FROM ai_usage_events
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 1000`,
          [userId],
        ),
      ]);

      const exportPayload = {
        ccpaRequestType: 'data_export',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          emailVerifiedAt: user.email_verified_at,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
          twoFactorEnabled: user.two_factor_enabled,
          ccpaOptOutSale: user.ccpa_opt_out_sale,
        },
        dataCategoriesCollected: DATA_CATEGORIES.filter((c) => c.collected).map((c) => c.category),
        addresses: addresses.rows,
        paymentMethods: paymentMethods.rows,
        sessions: sessions.rows,
        interactions: interactions.rows,
        orders: orders.rows,
        auctionBids: auctionBids.rows,
        consents: consents.rows,
        complianceProfile: profile.rows[0] ?? null,
        kycCases: kycCases.rows,
        amlAlerts: amlAlerts.rows,
        aiUsageEvents: aiUsageEvents.rows,
        exportedAt: new Date().toISOString(),
      };

      await client.query('COMMIT');

      return {
        ok: true,
        requestType: 'ccpa_data_export',
        status: 'completed',
        export: exportPayload,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/compliance/ccpa/request-deletion', async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }

    const userId = resolveAuthenticatedUserId(request);
    const payload = requestDeletionBodySchema.parse(request.body ?? {});

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query<{ id: string; is_erased: boolean }>(
        'SELECT id, is_erased FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );

      const user = userResult.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        throw createApiError('USER_NOT_FOUND', 'User account does not exist', { userId });
      }

      if (user.is_erased) {
        await client.query('ROLLBACK');
        return {
          ok: true,
          requestType: 'ccpa_deletion',
          status: 'already_completed',
          message: 'User data has already been erased.',
        };
      }

      await client.query(
        `
          UPDATE users
          SET
            ccpa_deletion_requested_at = NOW(),
            username = 'deleted_user',
            email = NULL,
            is_erased = TRUE,
            erased_at = NOW()
          WHERE id = $1
        `,
        [userId],
      );

      await client.query(
        `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );

      await client.query(
        `UPDATE user_addresses SET deleted_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId],
      );

      await client.query('COMMIT');

      return {
        ok: true,
        requestType: 'ccpa_deletion',
        status: 'completed',
        reason: payload.reason,
        message: 'Your personal data has been scheduled for deletion. You will be logged out.',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/compliance/ccpa/opt-out-sale', async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }

    const userId = resolveAuthenticatedUserId(request);
    const payload = optOutSaleBodySchema.parse(request.body ?? { optOut: true });

    await db.query(
      `UPDATE users SET ccpa_opt_out_sale = $2 WHERE id = $1`,
      [userId, payload.optOut],
    );

    return {
      ok: true,
      requestType: 'ccpa_opt_out_sale',
      optOut: payload.optOut,
      message: payload.optOut
        ? 'You have been opted out of the sale of your personal information.'
        : 'You have been opted back into the sale of your personal information.',
    };
  });

  app.get('/compliance/ccpa/status', async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }

    const userId = resolveAuthenticatedUserId(request);

    const result = await db.query<{
      ccpa_opt_out_sale: boolean;
      ccpa_data_export_requested_at: string | null;
      ccpa_deletion_requested_at: string | null;
    }>(
      `
        SELECT
          ccpa_opt_out_sale,
          ccpa_data_export_requested_at::text,
          ccpa_deletion_requested_at::text
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId],
    );

    const row = result.rows[0];
    if (!row) {
      throw createApiError('USER_NOT_FOUND', 'User account does not exist', { userId });
    }

    return {
      ok: true,
      optOutSale: row.ccpa_opt_out_sale,
      dataExportRequestedAt: row.ccpa_data_export_requested_at,
      deletionRequestedAt: row.ccpa_deletion_requested_at,
      pendingRequests: [
        ...(row.ccpa_data_export_requested_at
          ? [{
              type: 'data_export' as const,
              requestedAt: row.ccpa_data_export_requested_at,
              status: 'completed' as const,
            }]
          : []),
        ...(row.ccpa_deletion_requested_at
          ? [{
              type: 'deletion' as const,
              requestedAt: row.ccpa_deletion_requested_at,
              status: row.ccpa_deletion_requested_at ? 'completed' as const : ('pending' as const),
            }]
          : []),
      ],
    };
  });
}
