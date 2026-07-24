import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionReadiness,
  collectProductionReadinessErrors,
} from "../lib/productionReadiness.js";

function productionEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    APP_URL: "https://api.thryftverse.test",
    DATABASE_URL: "postgresql://service:password@db.internal/thryftverse",
    REDIS_URL: "rediss://redis.internal:6379",
    KEY_SERVICE_URL: "https://keys.internal",
    KEY_SERVICE_CLIENT_TOKEN: "k".repeat(40),
    KEY_SERVICE_ADMIN_TOKEN: "a".repeat(40),
    S3_ENDPOINT: "https://objects.internal",
    S3_PUBLIC_ENDPOINT: "https://cdn.thryftverse.test",
    S3_ACCESS_KEY: "service-access-key",
    S3_SECRET_KEY: "s".repeat(40),
    S3_BUCKET: "thryftverse-media",
    S3_CDN_BASE_URL: "https://cdn.thryftverse.test",
    AUTH_ACCESS_TOKEN_SECRET: "x".repeat(48),
    AUTH_REFRESH_TOKEN_SECRET: "y".repeat(48),
    API_SECURITY_ADMIN_TOKEN: "z".repeat(48),
    ONEZE_ATTESTATION_SIGNING_SECRET: "o".repeat(48),
    API_ENABLE_MOCK_WEBHOOKS: "false",
    AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS: "false",
    API_RATE_LIMIT_MAX: "140",
    API_RATE_LIMIT_WINDOW: "1 minute",
    ONEZE_FX_SYNC_ENABLED: "true",
    ONEZE_FX_PROVIDER_URL: "https://fx.thryftverse.test/latest",
    ONEZE_FX_PROVIDER_API_KEY: "fx_provider_key_test",
    STRIPE_SECRET_KEY: "sk_live_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    KYC_DEFAULT_VENDOR: "stripe_identity",
    KYC_RETURN_URL: "https://thryftverse.test/compliance/kyc-complete",
    KYC_WEBHOOK_SECRET: `whsec_${"k".repeat(32)}`,
    EASYSHIP_API_KEY: "easyship_test",
    EASYSHIP_WEBHOOK_SECRET: "easyship_webhook_test",
    ALERTING_WEBHOOK_URLS: "https://alerts.thryftverse.test/hooks/ops",
    ...overrides,
  };
}

test("production readiness accepts a complete non-default configuration", () => {
  assert.deepEqual(
    collectProductionReadinessErrors(productionEnvironment()),
    [],
  );
  assert.doesNotThrow(() => assertProductionReadiness(productionEnvironment()));
});

test("production readiness does not impose production requirements on tests or development", () => {
  assert.deepEqual(collectProductionReadinessErrors({ NODE_ENV: "test" }), []);
  assert.deepEqual(
    collectProductionReadinessErrors({ NODE_ENV: "development" }),
    [],
  );
});

test("production readiness rejects weak defaults, equal auth secrets, and mock routes", () => {
  const errors = collectProductionReadinessErrors(
    productionEnvironment({
      AUTH_ACCESS_TOKEN_SECRET: "dev-only-access-secret-change-me",
      AUTH_REFRESH_TOKEN_SECRET: "dev-only-access-secret-change-me",
      API_SECURITY_ADMIN_TOKEN: "local-security-admin-token",
      API_ENABLE_MOCK_WEBHOOKS: "true",
    }),
  );

  assert.ok(
    errors.some((error) =>
      error.includes("AUTH_ACCESS_TOKEN_SECRET still uses"),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.includes("API_SECURITY_ADMIN_TOKEN still uses"),
    ),
  );
  assert.ok(errors.some((error) => error.includes("must be different")));
  assert.ok(errors.some((error) => error.includes("API_ENABLE_MOCK_WEBHOOKS")));
});

test("production readiness rejects missing provider, alert, and public URL boundaries", () => {
  const errors = collectProductionReadinessErrors(
    productionEnvironment({
      APP_URL: "http://localhost:4000",
      S3_PUBLIC_ENDPOINT: "http://localhost:9000",
      S3_CDN_BASE_URL: "http://localhost:9000",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      EASYSHIP_API_KEY: "",
      EASYSHIP_WEBHOOK_SECRET: "",
      ALERTING_WEBHOOK_URLS: "",
      ONEZE_FX_SYNC_ENABLED: "false",
      ONEZE_FX_PROVIDER_URL: "http://localhost:8080/latest",
      ONEZE_FX_PROVIDER_API_KEY: "",
    }),
  );

  assert.ok(errors.some((error) => error.startsWith("APP_URL must be")));
  assert.ok(
    errors.some((error) => error.startsWith("S3_PUBLIC_ENDPOINT must be")),
  );
  assert.ok(
    errors.some((error) => error.startsWith("S3_CDN_BASE_URL must be")),
  );
  assert.ok(errors.some((error) => error.includes("payment provider")));
  assert.ok(errors.some((error) => error.includes("shipping provider")));
  assert.ok(errors.some((error) => error.includes("ALERTING_WEBHOOK_URLS")));
  assert.ok(errors.some((error) => error.includes("ONEZE_FX_SYNC_ENABLED")));
  assert.ok(
    errors.some((error) => error.startsWith("ONEZE_FX_PROVIDER_URL must be")),
  );
});
