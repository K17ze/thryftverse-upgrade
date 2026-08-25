import 'dotenv/config';
import { assertProductionReadiness } from './lib/productionReadiness.js';

const nodeEnv = process.env.NODE_ENV ?? 'development';

assertProductionReadiness(process.env);

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
}

function asNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function asIntegerInRange(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function asRateLimitWindow(value: string | undefined): string {
  const resolved = value?.trim() || '1 minute';
  if (!/^\d+\s*(?:ms|millisecond|milliseconds|s|second|seconds|m|minute|minutes|h|hour|hours)$/i.test(resolved)) {
    throw new Error('API_RATE_LIMIT_WINDOW must be a positive duration such as "1 minute" or "30 seconds"');
  }
  return resolved;
}

function asCsvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function requiredSecret(name: string, developmentFallback: string): string {
  const raw = process.env[name]?.trim();
  if (raw) {
    return raw;
  }

  if (nodeEnv !== 'production') {
    return developmentFallback;
  }

  throw new Error(`Missing required secret environment variable: ${name}`);
}

export const config = {
  nodeEnv,
  port: asIntegerInRange('PORT', process.env.PORT, 4000, 1, 65_535),
  /**
   * Public HTTPS base URL of the API itself, used to build absolute callback
   * links (Stripe Connect onboarding/return URLs, magic-link emails, etc.).
   * In production this must be the public Koyeb / load-balancer URL.
   */
  appUrl: process.env.APP_URL?.trim() || `http://localhost:${Number(process.env.PORT ?? '4000')}`,
  databaseUrl: required('DATABASE_URL'),
  databaseReplicaUrl: process.env.DATABASE_REPLICA_URL?.trim() || undefined,
  databasePoolMax: asIntegerInRange('DATABASE_POOL_MAX', process.env.DATABASE_POOL_MAX, 20, 1, 200),
  databasePoolIdleTimeoutMs: asIntegerInRange(
    'DATABASE_POOL_IDLE_TIMEOUT_MS',
    process.env.DATABASE_POOL_IDLE_TIMEOUT_MS,
    30_000,
    1_000,
    600_000
  ),
  databasePoolConnectionTimeoutMs: asIntegerInRange(
    'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
    process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    10_000,
    500,
    120_000
  ),
  databaseStatementTimeoutMs: asIntegerInRange(
    'DATABASE_STATEMENT_TIMEOUT_MS',
    process.env.DATABASE_STATEMENT_TIMEOUT_MS,
    30_000,
    1_000,
    300_000
  ),
  databaseQueryTimeoutMs: asIntegerInRange(
    'DATABASE_QUERY_TIMEOUT_MS',
    process.env.DATABASE_QUERY_TIMEOUT_MS,
    35_000,
    1_000,
    360_000
  ),
  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),
  redisQueueUrl: required('REDIS_QUEUE_URL', required('REDIS_URL', 'redis://localhost:6379')),
  redisCacheUrl: required('REDIS_CACHE_URL', required('REDIS_URL', 'redis://localhost:6379')),
  pgbouncerEnabled: asBoolean(process.env.PGBOUNCER_ENABLED, false),
  pgbouncerPort: asIntegerInRange('PGBOUNCER_PORT', process.env.PGBOUNCER_PORT, 6432, 1, 65_535),
  keyServiceUrl: required('KEY_SERVICE_URL', 'http://localhost:4100'),
  keyServiceClientToken: requiredSecret('KEY_SERVICE_CLIENT_TOKEN', 'local-key-client-token'),
  keyServiceAdminToken: requiredSecret('KEY_SERVICE_ADMIN_TOKEN', 'local-key-admin-token'),
  s3Endpoint: required('S3_ENDPOINT', 'http://localhost:9000'),
  s3PublicEndpoint: required('S3_PUBLIC_ENDPOINT', process.env.S3_ENDPOINT ?? 'http://localhost:9000'),
  s3Region: required('S3_REGION', 'us-east-1'),
  s3AccessKey: required('S3_ACCESS_KEY', 'minioadmin'),
  s3SecretKey: required('S3_SECRET_KEY', 'minioadmin'),
  s3Bucket: required('S3_BUCKET', 'thryftverse-media'),
  s3ForcePathStyle: asBoolean(process.env.S3_FORCE_PATH_STYLE, true),
  s3CdnBaseUrl:
    process.env.S3_CDN_BASE_URL?.trim()
    || process.env.S3_PUBLIC_ENDPOINT?.trim()
    || 'http://localhost:9000',
  s3AllowedContentTypes: asCsvList(process.env.S3_ALLOWED_CONTENT_TYPES).length > 0
    ? asCsvList(process.env.S3_ALLOWED_CONTENT_TYPES).map((entry) => entry.toLowerCase())
    : [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/heic',
        'image/heif',
        'video/mp4',
        'video/quicktime',
        'video/x-m4v',
        'application/pdf',
        ...(nodeEnv === 'production' ? [] : ['text/plain']),
      ],
  s3MaxImageUploadBytes: asIntegerInRange(
    'S3_MAX_IMAGE_UPLOAD_BYTES',
    process.env.S3_MAX_IMAGE_UPLOAD_BYTES,
    20 * 1024 * 1024,
    1_024,
    100 * 1024 * 1024
  ),
  s3MaxVideoUploadBytes: asIntegerInRange(
    'S3_MAX_VIDEO_UPLOAD_BYTES',
    process.env.S3_MAX_VIDEO_UPLOAD_BYTES,
    100 * 1024 * 1024,
    1_024,
    500 * 1024 * 1024
  ),
  s3MaxDocumentUploadBytes: asIntegerInRange(
    'S3_MAX_DOCUMENT_UPLOAD_BYTES',
    process.env.S3_MAX_DOCUMENT_UPLOAD_BYTES,
    10 * 1024 * 1024,
    1_024,
    50 * 1024 * 1024
  ),
  s3PresignTtlSeconds: asIntegerInRange(
    'S3_PRESIGN_TTL_SECONDS',
    process.env.S3_PRESIGN_TTL_SECONDS,
    10 * 60,
    60,
    60 * 60
  ),
  mediaProcessingEnabled: asBoolean(
    process.env.MEDIA_PROCESSING_ENABLED,
    false,
  ),
  mediaPublicationGateEnabled: asBoolean(
    process.env.MEDIA_PUBLICATION_GATE_ENABLED,
    nodeEnv === 'production',
  ),
  decisionServiceUrl:
    process.env.DECISION_SERVICE_URL?.trim()
    || process.env.ML_SERVICE_URL?.trim()
    || 'http://localhost:8000',
  decisionServiceTimeoutMs: asIntegerInRange(
    'DECISION_SERVICE_TIMEOUT_MS',
    process.env.DECISION_SERVICE_TIMEOUT_MS,
    2_500,
    100,
    30_000
  ),
  decisionServiceToken: requiredSecret(
    'DECISION_SERVICE_TOKEN',
    'local-decision-service-token'
  ),
  /**
   * Fraud shadow scoring (Phase 6). When enabled, every fraud check also
   * scores the event with the shadow ML model (via the ml-service) and logs
   * both scores to fraud_scoring_ledger for offline comparison. The shadow
   * score NEVER affects the user-facing fraud decision — the rule engine
   * remains the champion until the shadow model is promoted via the model
   * artifact registry (migration 144).
   */
  fraudShadowEnabled: asBoolean(
    process.env.FRAUD_SHADOW_ENABLED,
    false,
  ),
  fraudShadowTimeoutMs: asIntegerInRange(
    'FRAUD_SHADOW_TIMEOUT_MS',
    process.env.FRAUD_SHADOW_TIMEOUT_MS,
    1_500,
    100,
    10_000,
  ),
  /**
   * FR-09: Governed IP reputation provider selection.
   *
   * - 'noop'      — no provider; returns `unknown` for every IP (default,
   *                  never fabricates a clean verdict).
   * - 'spur'      — Spur context API (requires SPUR_API_KEY).
   * - 'maxmind'   — local MaxMind GeoIP2/GeoLite2 database lookup
   *                  (requires MAXMIND_DB_PATH and the `maxmind` npm pkg).
   * - 'composite' — query both Spur and MaxMind in parallel and merge.
   *
   * When set to 'noop' (the default) the system is honest about not having
   * threat-intel data rather than fabricating reputation. See
   * `src/lib/ipReputationProviders.ts` for the concrete implementations.
   */
  ipReputationProvider:
    (process.env.IP_REPUTATION_PROVIDER?.trim().toLowerCase() || 'noop') as
      | 'spur' | 'maxmind' | 'composite' | 'noop',
  /** Spur API key. Required when ipReputationProvider is 'spur' or 'composite'. */
  spurApiKey: process.env.SPUR_API_KEY?.trim() || null,
  /**
   * Filesystem path to a MaxMind GeoLite2-City / GeoIP2 database file.
   * Required when ipReputationProvider is 'maxmind' or 'composite'.
   * The `maxmind` npm package must be installed separately.
   */
  maxmindDbPath: process.env.MAXMIND_DB_PATH?.trim() || null,
  authAccessTokenSecret: requiredSecret('AUTH_ACCESS_TOKEN_SECRET', 'dev-only-access-secret-change-me'),
  authRefreshTokenSecret: requiredSecret('AUTH_REFRESH_TOKEN_SECRET', 'dev-only-refresh-secret-change-me'),
  /**
   * JWT signing algorithm. Defaults to HS256 for backward compatibility.
   * Set to 'EdDSA' in production to use Ed25519 asymmetric keys.
   * Generate a key pair with:
   *   node -e "const { generateKeyPairSync } = require('crypto'); const { privateKey, publicKey } = generateKeyPairSync('ed25519'); console.log(privateKey.export({ type: 'pkcs8', format: 'pem' })); console.log(publicKey.export({ type: 'spki', format: 'pem' }));"
   */
  jwtAlgorithm: (process.env.JWT_ALGORITHM?.trim() || 'HS256') as 'HS256' | 'EdDSA',
  jwtEd25519PrivateKey: process.env.JWT_ED25519_PRIVATE_KEY?.trim() || '',
  jwtEd25519PublicKey: process.env.JWT_ED25519_PUBLIC_KEY?.trim() || '',
  authAccessTokenTtlSeconds: asNumber(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS, 15 * 60),
  authRefreshTokenTtlSeconds: asNumber(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60),
  authPasswordHashCost: asNumber(process.env.AUTH_PASSWORD_HASH_COST, 12),
  authPasswordResetTokenTtlSeconds: asNumber(process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS, 20 * 60),
  authMagicLinkTtlSeconds: asNumber(process.env.AUTH_MAGIC_LINK_TTL_SECONDS, 15 * 60),
  authMagicLinkBaseUrl:
    process.env.AUTH_MAGIC_LINK_BASE_URL?.trim() || 'thryftverse://auth/magic-link',
  authPasswordResetBaseUrl:
    process.env.AUTH_PASSWORD_RESET_BASE_URL?.trim() || 'thryftverse://auth/reset-password',
  authOtpTtlSeconds: asNumber(process.env.AUTH_OTP_TTL_SECONDS, 5 * 60),
  authOtpMaxAttempts: asNumber(process.env.AUTH_OTP_MAX_ATTEMPTS, 5),
  // ── WebAuthn / Passkeys (AUTH-017) ────────────────────────────────────
  // The RP name shown to users in the passkey prompt. The RP ID is derived
  // from the app URL's hostname. In production, set WEBAUTHN_RP_ID to the
  // naked domain (e.g. "thryftverse.app") and WEBAUTHN_ORIGINS to the
  // allowed origins (comma-separated, including the mobile app's origin
  // if using app links).
  webauthnRpName: process.env.WEBAUTHN_RP_NAME?.trim() || 'ThryftVerse',
  webauthnRpId:
    process.env.WEBAUTHN_RP_ID?.trim()
    || new URL(process.env.APP_URL?.trim() || 'http://localhost:4000').hostname,
  webauthnOrigins: asCsvList(process.env.WEBAUTHN_ORIGINS).length > 0
    ? asCsvList(process.env.WEBAUTHN_ORIGINS)
    : [process.env.APP_URL?.trim() || 'http://localhost:4000'],
  authEmailProvider:
    process.env.AUTH_EMAIL_PROVIDER?.trim().toLowerCase()
    || (nodeEnv === 'production' ? 'resend' : 'log'),
  authExposeDevelopmentArtifacts: asBoolean(process.env.AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS, false),
  authEmailFrom: process.env.AUTH_EMAIL_FROM?.trim() || null,
  resendApiKey: process.env.RESEND_API_KEY?.trim() || null,
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
  openAiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
  openAiAgentDefaultModel: process.env.OPENAI_AGENT_DEFAULT_MODEL?.trim() || 'gpt-5.6-terra',
  openAiAgentMaxOutputTokens: asNumber(process.env.OPENAI_AGENT_MAX_OUTPUT_TOKENS, 900),
  openAiAgentTimeoutMs: asNumber(process.env.OPENAI_AGENT_TIMEOUT_MS, 30_000),
  aiUsagePricingVersion: process.env.AI_USAGE_PRICING_VERSION?.trim() || 'unconfigured',
  openAiInputCostMicrousdPerMillionTokens: asNumber(
    process.env.OPENAI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    0
  ),
  openAiOutputCostMicrousdPerMillionTokens: asNumber(
    process.env.OPENAI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    0
  ),
  apiSecurityAdminToken: requiredSecret('API_SECURITY_ADMIN_TOKEN', 'local-security-admin-token'),
  apiInternalServiceToken: requiredSecret('API_INTERNAL_SERVICE_TOKEN', 'local-internal-service-token'),
  apiEnableMockWebhooks: asBoolean(process.env.API_ENABLE_MOCK_WEBHOOKS, false),
  apiRateLimitMax: asIntegerInRange(
    'API_RATE_LIMIT_MAX',
    process.env.API_RATE_LIMIT_MAX,
    140,
    1,
    100_000
  ),
  apiRateLimitWindow: asRateLimitWindow(process.env.API_RATE_LIMIT_WINDOW),
  corsAllowedOrigins: asCsvList(process.env.CORS_ALLOWED_ORIGINS),
  authRateLimitMax: asIntegerInRange(
    'AUTH_RATE_LIMIT_MAX',
    process.env.AUTH_RATE_LIMIT_MAX,
    10,
    1,
    10_000
  ),
  authRateLimitWindowMs: asIntegerInRange(
    'AUTH_RATE_LIMIT_WINDOW_MS',
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    900_000,
    1_000,
    86_400_000
  ),
  outboxDrainIntervalMs: asIntegerInRange(
    'OUTBOX_DRAIN_INTERVAL_MS',
    process.env.OUTBOX_DRAIN_INTERVAL_MS,
    5_000,
    1_000,
    60_000
  ),
  kycDefaultVendor: required('KYC_DEFAULT_VENDOR', 'stripe_identity'),
  kycVerificationBaseUrl:
    process.env.KYC_VERIFICATION_BASE_URL?.trim()
    || 'https://verify.thryftverse.local/session',
  kycReturnUrl:
    process.env.KYC_RETURN_URL?.trim()
    || (nodeEnv !== 'production' ? 'thryftverse://compliance/kyc-complete' : null),
  kycWebhookSecret: process.env.KYC_WEBHOOK_SECRET?.trim() || null,
  paymentWebhookToleranceSeconds: asNumber(process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS, 300),
  googleOAuthClientIds: asCsvList(process.env.GOOGLE_OAUTH_CLIENT_IDS),
  appleOAuthAudience: process.env.APPLE_OAUTH_AUDIENCE?.trim() || null,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripeApplePayMerchantIdentifier:
    process.env.STRIPE_APPLE_PAY_MERCHANT_IDENTIFIER?.trim() || null,
  stripeGooglePayEnabled: asBoolean(process.env.STRIPE_GOOGLE_PAY_ENABLED, false),
  paymentMetadataHmacSecret: requiredSecret(
    'PAYMENT_METADATA_HMAC_SECRET',
    'dev-only-payment-metadata-hmac-secret'
  ),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  mollieApiKey: process.env.MOLLIE_API_KEY,
  mollieWebhookSecret: process.env.MOLLIE_WEBHOOK_SECRET,
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY,
  flutterwaveWebhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
  tapSecretKey: process.env.TAP_SECRET_KEY,
  tapWebhookSecret: process.env.TAP_WEBHOOK_SECRET,
  wiseApiKey: process.env.WISE_API_KEY,
  wiseWebhookSecret: process.env.WISE_WEBHOOK_SECRET,
  wiseApiBaseUrl: process.env.WISE_API_BASE_URL?.trim() || 'https://api.wise.com',
  wisePlatformProfileId: process.env.WISE_PLATFORM_PROFILE_ID?.trim() || null,
  wisePlatformRecipientAccountId: process.env.WISE_PLATFORM_RECIPIENT_ACCOUNT_ID?.trim() || null,
  wisePlatformTransferReferencePrefix:
    process.env.WISE_PLATFORM_TRANSFER_REFERENCE_PREFIX?.trim() || 'THRYFTVERSE SWEEP',
  buyerProtectionHoldHours: asIntegerInRange(
    'BUYER_PROTECTION_HOLD_HOURS',
    process.env.BUYER_PROTECTION_HOLD_HOURS,
    48,
    0,
    168
  ),
  payoutDefaultMinimumGbp: asNumber(
    process.env.PAYOUT_DEFAULT_MINIMUM_GBP,
    10
  ),
  payoutNewSellerReservePct: asNumber(
    process.env.PAYOUT_NEW_SELLER_RESERVE_PCT,
    10
  ),
  payoutNewSellerReserveReleaseDays: asIntegerInRange(
    'PAYOUT_NEW_SELLER_RESERVE_RELEASE_DAYS',
    process.env.PAYOUT_NEW_SELLER_RESERVE_RELEASE_DAYS,
    14,
    0,
    90
  ),
  payoutNewSellerThreshold: asIntegerInRange(
    'PAYOUT_NEW_SELLER_THRESHOLD',
    process.env.PAYOUT_NEW_SELLER_THRESHOLD,
    10,
    0,
    1000
  ),
  // Per-seller risk-tier reserve percentages (P3.5). Applied in addition to
  // the new-seller rolling reserve — the escrow release logic uses the higher
  // of the new-seller reserve and the tier reserve.
  sellerRiskTierElevatedReservePct: asNumber(
    process.env.SELLER_RISK_TIER_ELEVATED_RESERVE_PCT,
    5
  ),
  sellerRiskTierHighReservePct: asNumber(
    process.env.SELLER_RISK_TIER_HIGH_RESERVE_PCT,
    15
  ),
  paypalClientId: process.env.PAYPAL_CLIENT_ID?.trim() || null,
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() || null,
  paypalApiBaseUrl:
    process.env.PAYPAL_API_BASE_URL?.trim()
    || (process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com'),
  personaApiKey: process.env.PERSONA_API_KEY?.trim() || null,
  personaTemplateId: process.env.PERSONA_TEMPLATE_ID?.trim() || null,
  personaWebhookSecret: process.env.PERSONA_WEBHOOK_SECRET?.trim() || null,
  personaApiBaseUrl:
    process.env.PERSONA_API_BASE_URL?.trim() || 'https://withpersona.com/api/v1',
  onfidoApiKey: process.env.ONFIDO_API_KEY?.trim() || null,
  onfidoWebhookToken: process.env.ONFIDO_WEBHOOK_TOKEN?.trim() || null,
  onfidoApiBaseUrl:
    process.env.ONFIDO_API_BASE_URL?.trim() || 'https://api.onfido.com/v3.5',
  webhookIpAllowlistEnabled:
    process.env.WEBHOOK_IP_ALLOWLIST_ENABLED?.trim().toLowerCase() === 'true',
  webhookAllowlistedIpRanges:
    (process.env.WEBHOOK_ALLOWLISTED_IP_RANGES?.trim() ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  evriApiKey: process.env.EVRI_API_KEY?.trim() || process.env.SHIPPING_EVRI_API_KEY?.trim() || null,
  evriApiBaseUrl:
    process.env.EVRI_API_BASE_URL?.trim() || process.env.SHIPPING_EVRI_API_URL?.trim() || null,
  evriWebhookSecret:
    process.env.EVRI_WEBHOOK_SECRET?.trim() || process.env.SHIPPING_EVRI_WEBHOOK_SECRET?.trim() || null,
  delhiveryApiKey:
    process.env.DELHIVERY_API_KEY?.trim() || process.env.SHIPPING_DELHIVERY_API_KEY?.trim() || null,
  delhiveryApiBaseUrl:
    process.env.DELHIVERY_API_BASE_URL?.trim()
    || process.env.SHIPPING_DELHIVERY_API_URL?.trim()
    || null,
  delhiveryWebhookSecret:
    process.env.DELHIVERY_WEBHOOK_SECRET?.trim()
    || process.env.SHIPPING_DELHIVERY_WEBHOOK_SECRET?.trim()
    || null,
  dhlApiKey: process.env.DHL_API_KEY?.trim() || process.env.SHIPPING_DHL_API_KEY?.trim() || null,
  dhlApiBaseUrl:
    process.env.DHL_API_BASE_URL?.trim() || process.env.SHIPPING_DHL_API_URL?.trim() || null,
  dhlWebhookSecret:
    process.env.DHL_WEBHOOK_SECRET?.trim() || process.env.SHIPPING_DHL_WEBHOOK_SECRET?.trim() || null,
  aramexApiKey:
    process.env.ARAMEX_API_KEY?.trim() || process.env.SHIPPING_ARAMEX_API_KEY?.trim() || null,
  aramexApiBaseUrl:
    process.env.ARAMEX_API_BASE_URL?.trim() || process.env.SHIPPING_ARAMEX_API_URL?.trim() || null,
  aramexWebhookSecret:
    process.env.ARAMEX_WEBHOOK_SECRET?.trim() || process.env.SHIPPING_ARAMEX_WEBHOOK_SECRET?.trim() || null,
  easyshipApiKey:
    process.env.EASYSHIP_API_KEY?.trim() || process.env.SHIPPING_EASYSHIP_API_KEY?.trim() || null,
  easyshipApiBaseUrl:
    process.env.EASYSHIP_API_BASE_URL?.trim()
    || process.env.SHIPPING_EASYSHIP_API_URL?.trim()
    || 'https://public-api.easyship.com/2024-09',
  easyshipWebhookSecret:
    process.env.EASYSHIP_WEBHOOK_SECRET?.trim()
    || process.env.SHIPPING_EASYSHIP_WEBHOOK_SECRET?.trim()
    || null,
  shippingFallbackLabelBaseUrl:
    process.env.SHIPPING_FALLBACK_LABEL_BASE_URL?.trim() || 'https://thryftverse.app/mock-shipping',
  dailyPayoutVelocityLimitGbp: asNumber(process.env.DAILY_PAYOUT_VELOCITY_LIMIT_GBP, 2000),
  payoutManualReviewThresholdGbp: asNumber(process.env.PAYOUT_MANUAL_REVIEW_THRESHOLD_GBP, 500),
  reconciliationScheduleUtcHour: asNumber(process.env.RECONCILIATION_SCHEDULE_UTC_HOUR, 2),
  reconciliationMismatchThresholdGbp: asNumber(process.env.RECONCILIATION_MISMATCH_THRESHOLD_GBP, 1),
  reconciliationCriticalMismatchThresholdGbp: asNumber(
    process.env.RECONCILIATION_CRITICAL_MISMATCH_THRESHOLD_GBP,
    10
  ),
  platformRevenueSweepGateway: process.env.PLATFORM_REVENUE_SWEEP_GATEWAY?.trim().toLowerCase() || null,
  platformRevenueSweepRequireExternalTransfer: asBoolean(
    process.env.PLATFORM_REVENUE_SWEEP_REQUIRE_EXTERNAL_TRANSFER,
    false
  ),
  platformRevenueSweepIntervalMs: asNumber(process.env.PLATFORM_REVENUE_SWEEP_INTERVAL_MS, 6 * 60 * 60 * 1000),
  opsAlertIntervalMs: asNumber(process.env.OPS_ALERT_INTERVAL_MS, 60_000),
  alertingWebhookUrls: asCsvList(process.env.ALERTING_WEBHOOK_URLS ?? process.env.ALERTING_WEBHOOK_URL),
  alertingAdminUserIds: asCsvList(process.env.ALERTING_ADMIN_USER_IDS),
  onezeSupplyDriftThresholdIze: asNumber(process.env.ONEZE_SUPPLY_DRIFT_THRESHOLD_IZE, 10),
  onezeOperatorToken: process.env.ONEZE_OPERATOR_TOKEN,
  onezeReservePolicyEnabled: asBoolean(process.env.ONEZE_RESERVE_POLICY_ENABLED, false),
  onezeReserveRatioMin: asNumber(process.env.ONEZE_RESERVE_RATIO_MIN, 0.3),
  onezeReserveRatioMax: asNumber(process.env.ONEZE_RESERVE_RATIO_MAX, 0.6),
  onezeOperationalReserveMg: asNumber(process.env.ONEZE_OPERATIONAL_RESERVE_MG, 0),
  expoPushApiUrl: process.env.EXPO_PUSH_API_URL ?? 'https://exp.host/--/api/v2/push/send',
  pushDefaultChannel: process.env.PUSH_DEFAULT_CHANNEL ?? 'default',
  sentryDsn: process.env.SENTRY_DSN,
  sentryTracesSampleRate: asNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.15),
  otelEnabled: asBoolean(process.env.OTEL_ENABLED, true),
  otelExporterOtlpHttpUrl:
    process.env.OTEL_EXPORTER_OTLP_HTTP_URL ?? 'http://localhost:4318/v1/traces',
  auctionSweepIntervalMs: asNumber(process.env.AUCTION_SWEEP_INTERVAL_MS, 30_000),
  onezeReconcileIntervalMs: asNumber(process.env.ONEZE_RECONCILE_INTERVAL_MS, 60 * 60 * 1000),
  onezeFxSyncEnabled: asBoolean(process.env.ONEZE_FX_SYNC_ENABLED, false),
  onezeFxSyncIntervalMs: asNumber(process.env.ONEZE_FX_SYNC_INTERVAL_MS, 24 * 60 * 60 * 1000),
  onezeFxProviderUrl:
    process.env.ONEZE_FX_PROVIDER_URL?.trim() || 'https://api.exchangerate.host/latest',
  onezeFxProviderApiKey: process.env.ONEZE_FX_PROVIDER_API_KEY?.trim() || null,
  onezeFxProviderBaseCurrency: process.env.ONEZE_FX_PROVIDER_BASE_CURRENCY?.trim().toUpperCase() || 'INR',
  onezeAutoAdjustEnabled: asBoolean(process.env.ONEZE_AUTO_ADJUST_ENABLED, false),
  onezeAutoAdjustIntervalMs: asNumber(process.env.ONEZE_AUTO_ADJUST_INTERVAL_MS, 60 * 60 * 1000),
  onezeAutoAdjustStepBps: asNumber(process.env.ONEZE_AUTO_ADJUST_STEP_BPS, 50),
  onezeAutoAdjustLookbackHours: asNumber(process.env.ONEZE_AUTO_ADJUST_LOOKBACK_HOURS, 24),
  onezeAutoAdjustHighStressThreshold: asNumber(process.env.ONEZE_AUTO_ADJUST_HIGH_STRESS_THRESHOLD, 0.85),
  onezeAutoAdjustLowStressThreshold: asNumber(process.env.ONEZE_AUTO_ADJUST_LOW_STRESS_THRESHOLD, 0.35),
  onezeAutoAdjustHighRedemptionRate: asNumber(process.env.ONEZE_AUTO_ADJUST_HIGH_REDEMPTION_RATE, 0.8),
  onezeAutoAdjustLowRedemptionRate: asNumber(process.env.ONEZE_AUTO_ADJUST_LOW_REDEMPTION_RATE, 0.25),
  onezeEnableDirectRedemption: asBoolean(process.env.ONEZE_ENABLE_DIRECT_REDEMPTION, false),
  onezeMintQuoteTtlSeconds: asNumber(process.env.ONEZE_MINT_QUOTE_TTL_SECONDS, 60),
  onezeMintPaymentGraceSeconds: asNumber(process.env.ONEZE_MINT_PAYMENT_GRACE_SECONDS, 5 * 60),
  onezeWithdrawalQuoteTtlSeconds: asNumber(process.env.ONEZE_WITHDRAWAL_QUOTE_TTL_SECONDS, 60),
  onezeWithdrawalInstantLimitMg: asNumber(process.env.ONEZE_WITHDRAWAL_INSTANT_LIMIT_MG, 20_000),
  onezeTravelRuleThresholdMg: asNumber(process.env.ONEZE_TRAVEL_RULE_THRESHOLD_MG, 11_000),
  onezeDailyAttestationIntervalMs: asNumber(
    process.env.ONEZE_DAILY_ATTESTATION_INTERVAL_MS,
    24 * 60 * 60 * 1000
  ),
  onezeAttestationSigningSecret: requiredSecret(
    'ONEZE_ATTESTATION_SIGNING_SECRET',
    'dev-only-oneze-attestation-signing-secret'
  ),
  // ── Meilisearch — full-text search ─────────────────────────────────
  meilisearchUrl: process.env.MEILISEARCH_URL?.trim() || 'http://localhost:7700',
  meilisearchApiKey: process.env.MEILISEARCH_API_KEY?.trim() || '',
  meilisearchIndexPrefix: process.env.MEILISEARCH_INDEX_PREFIX?.trim() || 'thryftverse_',
  // ── Content moderation ─────────────────────────────────────────────
  moderationProvider: process.env.MODERATION_PROVIDER?.trim() || 'mock',
  moderationThreshold: parseFloat(process.env.MODERATION_THRESHOLD || '0.8'),
  moderationReviewThreshold: parseFloat(process.env.MODERATION_REVIEW_THRESHOLD || '0.5'),
  // ── SMS (Twilio) ───────────────────────────────────────────────────
  smsProvider: process.env.SMS_PROVIDER?.trim() || 'log',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN?.trim() || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER?.trim() || '',
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || '',
  // ── Live streaming (LiveKit) ───────────────────────────────────────
  liveStreamProvider: process.env.LIVE_STREAM_PROVIDER?.trim() || 'mock',
  livekitUrl: process.env.LIVEKIT_URL?.trim() || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY?.trim() || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET?.trim() || '',
  presenceHeartbeatIntervalMs: asNumber(process.env.PRESENCE_HEARTBEAT_INTERVAL_MS, 15_000),
  presenceTtlSeconds: asNumber(process.env.PRESENCE_TTL_SECONDS, 30),
  // ── Workforce / Ops Console ─────────────────────────────────────────
  // Separate identity plane for the operations console. Consumer JWTs
  // (audience "thryftverse-app") are cryptographically rejected by ops
  // routes. Workforce tokens use audience "thryftverse-ops".
  opsConsoleEnabled: asBoolean(process.env.OPS_CONSOLE_ENABLED, nodeEnv !== 'production'),
  opsConsoleCorsOrigins: asCsvList(process.env.OPS_CONSOLE_CORS_ORIGINS),
  workforceSessionIdleTtlSeconds: asIntegerInRange(
    'WORKFORCE_SESSION_IDLE_TTL_SECONDS',
    process.env.WORKFORCE_SESSION_IDLE_TTL_SECONDS,
    1800,
    60,
    86_400
  ),
  workforceSessionAbsoluteTtlSeconds: asIntegerInRange(
    'WORKFORCE_SESSION_ABSOLUTE_TTL_SECONDS',
    process.env.WORKFORCE_SESSION_ABSOLUTE_TTL_SECONDS,
    28800,
    900,
    604_800
  ),
  workforceStepUpMaxAgeSeconds: asIntegerInRange(
    'WORKFORCE_STEP_UP_MAX_AGE_SECONDS',
    process.env.WORKFORCE_STEP_UP_MAX_AGE_SECONDS,
    300,
    30,
    3600
  ),
  opsPiiRevealTtlSeconds: asIntegerInRange(
    'OPS_PII_REVEAL_TTL_SECONDS',
    process.env.OPS_PII_REVEAL_TTL_SECONDS,
    300,
    30,
    3600
  ),
};

// ── Startup validation for critical secrets ──────────────
// The `requiredSecret()` helper above already fails fast in production for
// secrets that have development fallbacks. `assertProductionReadiness()` (called
// at the top of this module) covers required-presence, development-default
// detection, minimum-length, and provider-set completeness checks.
//
// The checks below cover conditional requirements that depend on other config
// values and therefore must run after the config object is fully resolved.

if (nodeEnv === 'production') {
  // When email delivery is set to Resend, both the API key and a verified
  // from-address are mandatory — otherwise transactional emails (magic links,
  // password resets, OTPs) silently fail.
  if (config.authEmailProvider === 'resend') {
    if (!config.resendApiKey) {
      throw new Error(
        'RESEND_API_KEY is required in production when AUTH_EMAIL_PROVIDER is "resend"'
      );
    }
    if (!config.authEmailFrom) {
      throw new Error(
        'AUTH_EMAIL_FROM is required in production when AUTH_EMAIL_PROVIDER is "resend"'
      );
    }
  }

  // Sentry DSN is strongly recommended in production for error tracking.
  // This is a warning, not a hard failure, to allow staged rollouts.
  if (!config.sentryDsn) {
    console.warn(
      '[security] SENTRY_DSN is not set — production error tracking is disabled.'
    );
  }
}
