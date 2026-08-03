# Secrets Management Audit Report

**Date:** 2026-08  
**Auditor:** Automated security audit (WS40)  
**Scope:** `backend/api/src/config.ts`, `backend/api/.env.example`, `backend/api/.env.production.example`  
**Standard:** 2026 August production security best practices

---

## 1. Executive Summary

The backend API uses a centralised configuration pattern in `src/config.ts` that reads all values from `process.env`. Secrets are loaded via a `requiredSecret()` helper that provides development-only fallbacks and **fails fast in production** if a secret is missing. A dedicated `src/lib/productionReadiness.ts` module performs additional startup validation (required-presence, development-default detection, minimum-length, provider-set completeness, secure-URL, and feature-flag checks) when `NODE_ENV=production`.

**No hardcoded secrets were found in application source code.** The only match for secret-like patterns (`sk_live_test`) is in `src/__tests__/productionReadiness.test.ts`, which is a test fixture used to verify the readiness check correctly rejects test Stripe keys — this is expected and safe.

### Actions taken

| Area | Finding | Action |
|------|---------|--------|
| `.env.example` | 60+ env vars undocumented | Enhanced with all 173 env vars, placeholder values, required/optional/secret annotations, and default values |
| `.env.production.example` | 40+ env vars undocumented, `API_INTERNAL_SERVICE_TOKEN` missing | Enhanced with all production-specific env vars including the missing required secret |
| `config.ts` | `RESEND_API_KEY` and `AUTH_EMAIL_FROM` not validated when `AUTH_EMAIL_PROVIDER=resend` in production | Added conditional startup validation that throws on missing values |
| `config.ts` | `SENTRY_DSN` not checked in production | Added warning (not hard failure) when Sentry DSN is absent |
| Hardcoded secrets | None found in source | No action needed |

---

## 2. Hardcoded Secrets Scan

**Search pattern:** `sk_live|sk_test|secret_key|password\s*=\s*['"]|apiKey\s*=\s*['"]`  
**Scope:** `backend/api/src/**/*.ts` (excluding `.env` files and `config.ts`)

### Results

| File | Line | Match | Verdict |
|------|------|-------|---------|
| `src/__tests__/productionReadiness.test.ts` | 40 | `STRIPE_SECRET_KEY: "sk_live_test"` | **Safe** — test fixture verifying the readiness check rejects test keys. Not a real secret. |

**Conclusion:** No hardcoded secrets in application source code. All secrets come from environment variables.

---

## 3. Environment Variable Catalogue

### 3.1 Required Secrets (fail fast in production via `requiredSecret()`)

These secrets use the `requiredSecret()` helper, which provides a development fallback and throws if missing in production.

| Env Var | Config Key | Dev Fallback | Prod Min Length | Secret |
|---------|-----------|--------------|-----------------|--------|
| `KEY_SERVICE_CLIENT_TOKEN` | `keyServiceClientToken` | `local-key-client-token` | 32 | Yes |
| `KEY_SERVICE_ADMIN_TOKEN` | `keyServiceAdminToken` | `local-key-admin-token` | 32 | Yes |
| `DECISION_SERVICE_TOKEN` | `decisionServiceToken` | `local-decision-service-token` | 32 | Yes |
| `AUTH_ACCESS_TOKEN_SECRET` | `authAccessTokenSecret` | `dev-only-access-secret-change-me` | 32 | Yes |
| `AUTH_REFRESH_TOKEN_SECRET` | `authRefreshTokenSecret` | `dev-only-refresh-secret-change-me` | 32 | Yes |
| `API_SECURITY_ADMIN_TOKEN` | `apiSecurityAdminToken` | `local-security-admin-token` | 32 | Yes |
| `API_INTERNAL_SERVICE_TOKEN` | `apiInternalServiceToken` | `local-internal-service-token` | 32 | Yes |
| `PAYMENT_METADATA_HMAC_SECRET` | `paymentMetadataHmacSecret` | `dev-only-payment-metadata-hmac-secret` | — | Yes |
| `ONEZE_ATTESTATION_SIGNING_SECRET` | `onezeAttestationSigningSecret` | `dev-only-oneze-attestation-signing-secret` | 32 | Yes |

### 3.2 Required Non-Secret (fail fast if missing, no dev fallback)

| Env Var | Config Key | Default | Secret |
|---------|-----------|---------|--------|
| `DATABASE_URL` | `databaseUrl` | None (throws) | Yes (contains credentials) |

### 3.3 Required in Production (via `assertProductionReadiness()`)

These are checked by `productionReadiness.ts` when `NODE_ENV=production`. Some overlap with §3.1.

| Env Var | Condition | Min Length |
|---------|-----------|------------|
| `APP_URL` | Always in prod | — |
| `DATABASE_URL` | Always in prod | — |
| `REDIS_URL` | Always in prod | — |
| `KEY_SERVICE_URL` | Always in prod | — |
| `KEY_SERVICE_CLIENT_TOKEN` | Always in prod | 32 |
| `KEY_SERVICE_ADMIN_TOKEN` | Always in prod | 32 |
| `S3_ENDPOINT` | Always in prod | — |
| `S3_PUBLIC_ENDPOINT` | Always in prod | — |
| `S3_ACCESS_KEY` | Always in prod | 24 |
| `S3_SECRET_KEY` | Always in prod | 24 |
| `S3_BUCKET` | Always in prod | — |
| `S3_CDN_BASE_URL` | Always in prod | — |
| `AUTH_ACCESS_TOKEN_SECRET` | Always in prod | 32 |
| `AUTH_REFRESH_TOKEN_SECRET` | Always in prod | 32 |
| `API_SECURITY_ADMIN_TOKEN` | Always in prod | 32 |
| `API_INTERNAL_SERVICE_TOKEN` | Always in prod | 32 |
| `DECISION_SERVICE_TOKEN` | Always in prod | 32 |
| `ONEZE_ATTESTATION_SIGNING_SECRET` | Always in prod | 32 |
| `ONEZE_FX_PROVIDER_URL` | Always in prod | — |
| `ONEZE_FX_PROVIDER_API_KEY` | Always in prod | 12 |
| `KYC_DEFAULT_VENDOR` | Always in prod | — |
| `KYC_RETURN_URL` | Always in prod | — |
| `KYC_WEBHOOK_SECRET` | Always in prod | 24 |
| `STRIPE_SECRET_KEY` | When KYC=stripe_identity | — |
| `PERSONA_API_KEY` | When KYC=persona | — |
| `PERSONA_TEMPLATE_ID` | When KYC=persona | — |
| `PERSONA_WEBHOOK_SECRET` | When KYC=persona | — |
| `ONFIDO_API_KEY` | When KYC=onfido | — |
| `ONFIDO_WEBHOOK_TOKEN` | When KYC=onfido | — |
| `STRIPE_PUBLISHABLE_KEY` | When STRIPE_SECRET_KEY set | — |
| `PAYMENT_METADATA_HMAC_SECRET` | When STRIPE_SECRET_KEY set | — |
| `OPENAI_AGENT_DEFAULT_MODEL` | When OPENAI_API_KEY set | — |
| `AI_USAGE_PRICING_VERSION` | When OPENAI_API_KEY set | — |
| `OPENAI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS` | When OPENAI_API_KEY set | — |
| `OPENAI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS` | When OPENAI_API_KEY set | — |
| `ALERTING_WEBHOOK_URLS` | Always in prod | — |
| `MEDIA_PROCESSING_ENABLED` | Must be true in prod | — |
| `MEDIA_PUBLICATION_GATE_ENABLED` | Must be true in prod | — |
| `ONEZE_FX_SYNC_ENABLED` | Must be true in prod | — |
| `API_ENABLE_MOCK_WEBHOOKS` | Must be false in prod | — |
| `AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS` | Must be false in prod | — |
| Complete payment provider set | At least one required | — |
| Complete shipping provider set | At least one required | — |

### 3.4 Conditional Secrets (validated at startup — added in this audit)

| Env Var | Condition | Validation |
|---------|-----------|------------|
| `RESEND_API_KEY` | `AUTH_EMAIL_PROVIDER=resend` in production | Throws if missing |
| `AUTH_EMAIL_FROM` | `AUTH_EMAIL_PROVIDER=resend` in production | Throws if missing |
| `SENTRY_DSN` | Production | Warns if missing (not hard failure) |

### 3.5 Optional Secrets (no production validation — provider-specific)

These secrets are only relevant when their respective provider is configured. The production readiness check ensures at least one complete provider set exists, but does not validate every individual optional provider.

| Env Var | Config Key | Secret |
|---------|-----------|--------|
| `RESEND_API_KEY` | `resendApiKey` | Yes |
| `OPENAI_API_KEY` | `openAiApiKey` | Yes |
| `ONEZE_FX_PROVIDER_API_KEY` | `onezeFxProviderApiKey` | Yes |
| `STRIPE_SECRET_KEY` | `stripeSecretKey` | Yes |
| `STRIPE_WEBHOOK_SECRET` | `stripeWebhookSecret` | Yes |
| `RAZORPAY_KEY_ID` | `razorpayKeyId` | Yes |
| `RAZORPAY_KEY_SECRET` | `razorpayKeySecret` | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | `razorpayWebhookSecret` | Yes |
| `MOLLIE_API_KEY` | `mollieApiKey` | Yes |
| `MOLLIE_WEBHOOK_SECRET` | `mollieWebhookSecret` | Yes |
| `FLUTTERWAVE_SECRET_KEY` | `flutterwaveSecretKey` | Yes |
| `FLUTTERWAVE_WEBHOOK_SECRET` | `flutterwaveWebhookSecret` | Yes |
| `TAP_SECRET_KEY` | `tapSecretKey` | Yes |
| `TAP_WEBHOOK_SECRET` | `tapWebhookSecret` | Yes |
| `WISE_API_KEY` | `wiseApiKey` | Yes |
| `WISE_WEBHOOK_SECRET` | `wiseWebhookSecret` | Yes |
| `PAYPAL_CLIENT_SECRET` | `paypalClientSecret` | Yes |
| `PERSONA_API_KEY` | `personaApiKey` | Yes |
| `PERSONA_WEBHOOK_SECRET` | `personaWebhookSecret` | Yes |
| `ONFIDO_API_KEY` | `onfidoApiKey` | Yes |
| `ONFIDO_WEBHOOK_TOKEN` | `onfidoWebhookToken` | Yes |
| `KYC_WEBHOOK_SECRET` | `kycWebhookSecret` | Yes |
| `EVRI_API_KEY` | `evriApiKey` | Yes |
| `EVRI_WEBHOOK_SECRET` | `evriWebhookSecret` | Yes |
| `DELHIVERY_API_KEY` | `delhiveryApiKey` | Yes |
| `DELHIVERY_WEBHOOK_SECRET` | `delhiveryWebhookSecret` | Yes |
| `DHL_API_KEY` | `dhlApiKey` | Yes |
| `DHL_WEBHOOK_SECRET` | `dhlWebhookSecret` | Yes |
| `ARAMEX_API_KEY` | `aramexApiKey` | Yes |
| `ARAMEX_WEBHOOK_SECRET` | `aramexWebhookSecret` | Yes |
| `EASYSHIP_API_KEY` | `easyshipApiKey` | Yes |
| `EASYSHIP_WEBHOOK_SECRET` | `easyshipWebhookSecret` | Yes |
| `ONEZE_OPERATOR_TOKEN` | `onezeOperatorToken` | Yes |
| `S3_ACCESS_KEY` | `s3AccessKey` | Yes |
| `S3_SECRET_KEY` | `s3SecretKey` | Yes |

### 3.6 Optional Non-Secret Env Vars (with defaults)

These are non-secret configuration values with sensible defaults. Overriding is optional.

| Env Var | Default |
|---------|---------|
| `NODE_ENV` | `development` |
| `PORT` | `4000` |
| `APP_URL` | `http://localhost:4000` |
| `DATABASE_REPLICA_URL` | none |
| `DATABASE_POOL_MAX` | `20` |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | `30000` |
| `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | `10000` |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` |
| `DATABASE_QUERY_TIMEOUT_MS` | `35000` |
| `REDIS_URL` | `redis://localhost:6379` |
| `KEY_SERVICE_URL` | `http://localhost:4100` |
| `S3_ENDPOINT` | `http://localhost:9000` |
| `S3_PUBLIC_ENDPOINT` | `S3_ENDPOINT` |
| `S3_REGION` | `us-east-1` |
| `S3_BUCKET` | `thryftverse-media` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `S3_CDN_BASE_URL` | `S3_PUBLIC_ENDPOINT` |
| `S3_ALLOWED_CONTENT_TYPES` | Built-in list |
| `S3_MAX_IMAGE_UPLOAD_BYTES` | `20971520` |
| `S3_MAX_VIDEO_UPLOAD_BYTES` | `104857600` |
| `S3_MAX_DOCUMENT_UPLOAD_BYTES` | `10485760` |
| `S3_PRESIGN_TTL_SECONDS` | `600` |
| `MEDIA_PROCESSING_ENABLED` | `false` |
| `MEDIA_PUBLICATION_GATE_ENABLED` | `false` (true in prod) |
| `DECISION_SERVICE_URL` | `http://localhost:8000` |
| `ML_SERVICE_URL` | Legacy alias for `DECISION_SERVICE_URL` |
| `DECISION_SERVICE_TIMEOUT_MS` | `2500` |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | `900` |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | `2592000` |
| `AUTH_PASSWORD_HASH_COST` | `12` |
| `AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS` | `1200` |
| `AUTH_MAGIC_LINK_TTL_SECONDS` | `900` |
| `AUTH_MAGIC_LINK_BASE_URL` | `thryftverse://auth/magic-link` |
| `AUTH_OTP_TTL_SECONDS` | `300` |
| `AUTH_OTP_MAX_ATTEMPTS` | `5` |
| `AUTH_EMAIL_PROVIDER` | `log` (resend in prod) |
| `AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS` | `false` |
| `AUTH_EMAIL_FROM` | none |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_AGENT_DEFAULT_MODEL` | `gpt-5.6-terra` |
| `OPENAI_AGENT_MAX_OUTPUT_TOKENS` | `900` |
| `OPENAI_AGENT_TIMEOUT_MS` | `30000` |
| `AI_USAGE_PRICING_VERSION` | `unconfigured` |
| `OPENAI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS` | `0` |
| `OPENAI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS` | `0` |
| `API_ENABLE_MOCK_WEBHOOKS` | `false` |
| `API_RATE_LIMIT_MAX` | `140` |
| `API_RATE_LIMIT_WINDOW` | `1 minute` |
| `CORS_ALLOWED_ORIGINS` | empty |
| `AUTH_RATE_LIMIT_MAX` | `10` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` |
| `OUTBOX_DRAIN_INTERVAL_MS` | `5000` |
| `KYC_DEFAULT_VENDOR` | `stripe_identity` |
| `KYC_VERIFICATION_BASE_URL` | `https://verify.thryftverse.local/session` |
| `KYC_RETURN_URL` | `thryftverse://compliance/kyc-complete` (dev) |
| `PAYMENT_WEBHOOK_TOLERANCE_SECONDS` | `300` |
| `GOOGLE_OAUTH_CLIENT_IDS` | empty |
| `APPLE_OAUTH_AUDIENCE` | none |
| `STRIPE_APPLE_PAY_MERCHANT_IDENTIFIER` | none |
| `STRIPE_GOOGLE_PAY_ENABLED` | `false` |
| `STRIPE_PUBLISHABLE_KEY` | none |
| `WISE_API_BASE_URL` | `https://api.wise.com` |
| `WISE_PLATFORM_PROFILE_ID` | none |
| `WISE_PLATFORM_RECIPIENT_ACCOUNT_ID` | none |
| `WISE_PLATFORM_TRANSFER_REFERENCE_PREFIX` | `THRYFTVERSE SWEEP` |
| `BUYER_PROTECTION_HOLD_HOURS` | `48` |
| `PAYOUT_DEFAULT_MINIMUM_GBP` | `10` |
| `PAYOUT_NEW_SELLER_RESERVE_PCT` | `10` |
| `PAYOUT_NEW_SELLER_RESERVE_RELEASE_DAYS` | `14` |
| `PAYOUT_NEW_SELLER_THRESHOLD` | `10` |
| `SELLER_RISK_TIER_ELEVATED_RESERVE_PCT` | `5` |
| `SELLER_RISK_TIER_HIGH_RESERVE_PCT` | `15` |
| `PAYPAL_CLIENT_ID` | none |
| `PAYPAL_API_BASE_URL` | sandbox/prod PayPal URL |
| `PERSONA_API_BASE_URL` | `https://withpersona.com/api/v1` |
| `PERSONA_TEMPLATE_ID` | none |
| `ONFIDO_API_BASE_URL` | `https://api.onfido.com/v3.5` |
| `WEBHOOK_IP_ALLOWLIST_ENABLED` | `false` |
| `WEBHOOK_ALLOWLISTED_IP_RANGES` | empty |
| `SHIPPING_FALLBACK_LABEL_BASE_URL` | `https://thryftverse.app/mock-shipping` |
| `EASYSHIP_API_BASE_URL` | `https://public-api.easyship.com/2024-09` |
| `DAILY_PAYOUT_VELOCITY_LIMIT_GBP` | `2000` |
| `PAYOUT_MANUAL_REVIEW_THRESHOLD_GBP` | `500` |
| `RECONCILIATION_SCHEDULE_UTC_HOUR` | `2` |
| `RECONCILIATION_MISMATCH_THRESHOLD_GBP` | `1` |
| `RECONCILIATION_CRITICAL_MISMATCH_THRESHOLD_GBP` | `10` |
| `PLATFORM_REVENUE_SWEEP_GATEWAY` | none |
| `PLATFORM_REVENUE_SWEEP_REQUIRE_EXTERNAL_TRANSFER` | `false` |
| `PLATFORM_REVENUE_SWEEP_INTERVAL_MS` | `21600000` |
| `OPS_ALERT_INTERVAL_MS` | `60000` |
| `ALERTING_WEBHOOK_URLS` | empty |
| `ALERTING_WEBHOOK_URL` | Legacy alias |
| `ALERTING_ADMIN_USER_IDS` | empty |
| `ONEZE_SUPPLY_DRIFT_THRESHOLD_IZE` | `10` |
| `ONEZE_RESERVE_POLICY_ENABLED` | `false` |
| `ONEZE_RESERVE_RATIO_MIN` | `0.3` |
| `ONEZE_RESERVE_RATIO_MAX` | `0.6` |
| `ONEZE_OPERATIONAL_RESERVE_MG` | `0` |
| `EXPO_PUSH_API_URL` | `https://exp.host/--/api/v2/push/send` |
| `PUSH_DEFAULT_CHANNEL` | `default` |
| `SENTRY_DSN` | none |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.15` |
| `OTEL_ENABLED` | `true` |
| `OTEL_EXPORTER_OTLP_HTTP_URL` | `http://localhost:4318/v1/traces` |
| `AUCTION_SWEEP_INTERVAL_MS` | `30000` |
| `ONEZE_RECONCILE_INTERVAL_MS` | `3600000` |
| `ONEZE_FX_SYNC_ENABLED` | `false` |
| `ONEZE_FX_SYNC_INTERVAL_MS` | `86400000` |
| `ONEZE_FX_PROVIDER_URL` | `https://api.exchangerate.host/latest` |
| `ONEZE_FX_PROVIDER_BASE_CURRENCY` | `INR` |
| `ONEZE_AUTO_ADJUST_ENABLED` | `false` |
| `ONEZE_AUTO_ADJUST_INTERVAL_MS` | `3600000` |
| `ONEZE_AUTO_ADJUST_STEP_BPS` | `50` |
| `ONEZE_AUTO_ADJUST_LOOKBACK_HOURS` | `24` |
| `ONEZE_AUTO_ADJUST_HIGH_STRESS_THRESHOLD` | `0.85` |
| `ONEZE_AUTO_ADJUST_LOW_STRESS_THRESHOLD` | `0.35` |
| `ONEZE_AUTO_ADJUST_HIGH_REDEMPTION_RATE` | `0.8` |
| `ONEZE_AUTO_ADJUST_LOW_REDEMPTION_RATE` | `0.25` |
| `ONEZE_ENABLE_DIRECT_REDEMPTION` | `false` |
| `ONEZE_MINT_QUOTE_TTL_SECONDS` | `60` |
| `ONEZE_MINT_PAYMENT_GRACE_SECONDS` | `300` |
| `ONEZE_WITHDRAWAL_QUOTE_TTL_SECONDS` | `60` |
| `ONEZE_WITHDRAWAL_INSTANT_LIMIT_MG` | `20000` |
| `ONEZE_TRAVEL_RULE_THRESHOLD_MG` | `11000` |
| `ONEZE_DAILY_ATTESTATION_INTERVAL_MS` | `86400000` |

### 3.7 Legacy Aliases

These env var names are accepted as backwards-compatible aliases. New deployments should use the canonical names.

| Legacy | Canonical |
|--------|-----------|
| `ML_SERVICE_URL` | `DECISION_SERVICE_URL` |
| `ALERTING_WEBHOOK_URL` | `ALERTING_WEBHOOK_URLS` |
| `SHIPPING_EVRI_API_KEY` | `EVRI_API_KEY` |
| `SHIPPING_EVRI_API_URL` | `EVRI_API_BASE_URL` |
| `SHIPPING_EVRI_WEBHOOK_SECRET` | `EVRI_WEBHOOK_SECRET` |
| `SHIPPING_DELHIVERY_API_KEY` | `DELHIVERY_API_KEY` |
| `SHIPPING_DELHIVERY_API_URL` | `DELHIVERY_API_BASE_URL` |
| `SHIPPING_DELHIVERY_WEBHOOK_SECRET` | `DELHIVERY_WEBHOOK_SECRET` |
| `SHIPPING_DHL_API_KEY` | `DHL_API_KEY` |
| `SHIPPING_DHL_API_URL` | `DHL_API_BASE_URL` |
| `SHIPPING_DHL_WEBHOOK_SECRET` | `DHL_WEBHOOK_SECRET` |
| `SHIPPING_ARAMEX_API_KEY` | `ARAMEX_API_KEY` |
| `SHIPPING_ARAMEX_API_URL` | `ARAMEX_API_BASE_URL` |
| `SHIPPING_ARAMEX_WEBHOOK_SECRET` | `ARAMEX_WEBHOOK_SECRET` |
| `SHIPPING_EASYSHIP_API_KEY` | `EASYSHIP_API_KEY` |
| `SHIPPING_EASYSHIP_API_URL` | `EASYSHIP_API_BASE_URL` |
| `SHIPPING_EASYSHIP_WEBHOOK_SECRET` | `EASYSHIP_WEBHOOK_SECRET` |

---

## 4. Env Vars Used Outside `config.ts`

Two non-test source files read `process.env` directly instead of importing from `config`:

| File | Env Vars | Risk | Recommendation |
|------|----------|------|----------------|
| `src/botRuntime/openaiAgent.ts` | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_AGENT_DEFAULT_MODEL`, `OPENAI_AGENT_MAX_OUTPUT_TOKENS`, `OPENAI_AGENT_TIMEOUT_MS` | Low — values are already in `config`; this is a module-level cache for hot-path performance | Consider migrating to `config` import for single-source-of-truth |
| `src/lib/countryCapabilities.ts` | `NODE_ENV`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `MOLLIE_API_KEY`, `FLUTTERWAVE_SECRET_KEY`, `TAP_SECRET_KEY` | Low — used for gateway-availability detection at runtime | Consider migrating to `config` import |

These are not security risks — the values are the same env vars documented in `.env.example`. They are listed for completeness.

---

## 5. Startup Validation Summary

### 5.1 `requiredSecret()` (in `config.ts`)

Throws `Missing required secret environment variable: <NAME>` if a secret is empty in production. Provides a development fallback when `NODE_ENV !== 'production'`.

**Covers:** `KEY_SERVICE_CLIENT_TOKEN`, `KEY_SERVICE_ADMIN_TOKEN`, `DECISION_SERVICE_TOKEN`, `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_REFRESH_TOKEN_SECRET`, `API_SECURITY_ADMIN_TOKEN`, `API_INTERNAL_SERVICE_TOKEN`, `PAYMENT_METADATA_HMAC_SECRET`, `ONEZE_ATTESTATION_SIGNING_SECRET`.

### 5.2 `assertProductionReadiness()` (in `productionReadiness.ts`)

Called at the top of `config.ts` before any config values are resolved. Throws `Production configuration is unsafe; refusing to start:` with a list of all errors.

**Checks:**
- All `REQUIRED_PRODUCTION_VALUES` are present
- No secret uses a development/example default value
- All secrets meet minimum length requirements
- `AUTH_ACCESS_TOKEN_SECRET !== AUTH_REFRESH_TOKEN_SECRET`
- `API_ENABLE_MOCK_WEBHOOKS` is false
- `AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS` is false
- `APP_URL`, `S3_PUBLIC_ENDPOINT`, `S3_CDN_BASE_URL` are public HTTPS URLs
- `ONEZE_FX_SYNC_ENABLED` is true
- `ONEZE_FX_PROVIDER_URL` is a public HTTPS URL
- `KYC_DEFAULT_VENDOR` is one of `stripe_identity`, `persona`, `onfido`
- `KYC_RETURN_URL` is a public HTTPS URL
- Vendor-specific KYC keys are present
- `API_RATE_LIMIT_WINDOW` is a valid duration string
- `API_RATE_LIMIT_MAX` is a valid integer range
- At least one complete payment provider credential set
- `STRIPE_PUBLISHABLE_KEY` and `PAYMENT_METADATA_HMAC_SECRET` present when Stripe is configured
- `MEDIA_PROCESSING_ENABLED` and `MEDIA_PUBLICATION_GATE_ENABLED` are true
- `OPENAI_AGENT_DEFAULT_MODEL` and `AI_USAGE_PRICING_VERSION` present when `OPENAI_API_KEY` is set
- OpenAI cost env vars are > 0 when `OPENAI_API_KEY` is set
- At least one complete shipping provider credential set
- `ALERTING_WEBHOOK_URLS` is present and all entries are HTTPS URLs

### 5.3 Conditional Validation (added in this audit)

Added at the end of `config.ts` after the config object is resolved:

- `RESEND_API_KEY` required when `AUTH_EMAIL_PROVIDER=resend` in production
- `AUTH_EMAIL_FROM` required when `AUTH_EMAIL_PROVIDER=resend` in production
- `SENTRY_DSN` warning (not hard failure) when absent in production

---

## 6. Secret Rotation Recommendations

### 6.1 High-Priority (rotate every 90 days)

| Secret | Reason |
|--------|--------|
| `AUTH_ACCESS_TOKEN_SECRET` | Compromise allows token forgery for all users |
| `AUTH_REFRESH_TOKEN_SECRET` | Compromise allows long-lived session hijacking |
| `API_SECURITY_ADMIN_TOKEN` | Compromise grants admin API access |
| `API_INTERNAL_SERVICE_TOKEN` | Compromise grants internal service-to-service access |
| `PAYMENT_METADATA_HMAC_SECRET` | Compromise allows payment metadata tampering |
| `ONEZE_ATTESTATION_SIGNING_SECRET` | Compromise allows fraudulent reserve attestations |

### 6.2 Medium-Priority (rotate every 180 days or on personnel changes)

| Secret | Reason |
|--------|--------|
| `KEY_SERVICE_CLIENT_TOKEN` | Service-to-service authentication |
| `KEY_SERVICE_ADMIN_TOKEN` | Key management admin access |
| `DECISION_SERVICE_TOKEN` | ML service authentication |
| `STRIPE_SECRET_KEY` | Payment processing — rotate via Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Webhook integrity — rotate when rotating Stripe keys |
| `S3_SECRET_KEY` | Object storage access — rotate via MinIO/S3 admin |
| `KYC_WEBHOOK_SECRET` | KYC webhook integrity |

### 6.3 Low-Priority (rotate on provider schedule or on compromise)

| Secret | Reason |
|--------|--------|
| `RESEND_API_KEY` | Email delivery — rotate via Resend dashboard |
| `OPENAI_API_KEY` | AI API access — rotate via OpenAI dashboard |
| `ONEZE_FX_PROVIDER_API_KEY` | FX data access — rotate via provider dashboard |
| Payment provider keys (Razorpay, Mollie, Flutterwave, Tap, Wise, PayPal) | Rotate per provider policy |
| Shipping provider keys (Evri, Delhivery, DHL, Aramex, Easyship) | Rotate per provider policy |
| KYC vendor keys (Persona, Onfido) | Rotate per vendor policy |

### 6.4 Rotation Procedure

1. Generate a new secret (minimum length per §3.1) using a cryptographically secure random generator.
2. Update the environment variable in the deployment platform (e.g., Koyeb secrets).
3. Deploy with zero-downtime rollout (both old and new secrets accepted during transition for JWT secrets).
4. Verify the application starts successfully (startup validation will catch issues).
5. Revoke the old secret from the provider dashboard.
6. Monitor error rates and authentication success rates for 30 minutes.

### 6.5 JWT Secret Rotation Special Case

When rotating `AUTH_ACCESS_TOKEN_SECRET` or `AUTH_REFRESH_TOKEN_SECRET`:

1. Deploy with both old and new secrets accepted (requires code change to support a grace-period list).
2. Wait for the old token TTL to expire (15 minutes for access, 30 days for refresh).
3. Remove the old secret from the grace-period list and deploy again.

> **Note:** The current config supports a single secret per token type. A grace-period list would need to be implemented if zero-downtime rotation is required. Alternatively, rotate during a brief maintenance window.

---

## 7. Files Modified in This Audit

| File | Change |
|------|--------|
| `backend/api/.env.example` | Enhanced from 158 lines to 393 lines — added all 173 env vars with annotations |
| `backend/api/.env.production.example` | Enhanced from 145 lines to 391 lines — added all missing production env vars including `API_INTERNAL_SERVICE_TOKEN` |
| `backend/api/src/config.ts` | Added conditional startup validation for `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `SENTRY_DSN` in production |
| `backend/api/docs/SECRETS_AUDIT.md` | Created — this report |

---

## 8. Compliance Checklist

| Requirement | Status |
|-------------|--------|
| Secrets MUST NOT be hardcoded in source code | ✅ No hardcoded secrets found |
| All secrets MUST come from environment variables | ✅ All secrets read via `process.env` |
| `.env.example` documents all required env vars with placeholder values | ✅ All 173 env vars documented |
| `.env.production.example` documents production-specific env vars | ✅ All production env vars documented |
| Secrets validated at startup (fail fast if missing) | ✅ `requiredSecret()` + `assertProductionReadiness()` + conditional checks |
| No real secrets in example files | ✅ Only placeholders (`replace_with_*`, `xxx`, `local-*`) |
