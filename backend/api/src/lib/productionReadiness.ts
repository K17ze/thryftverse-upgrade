const DEVELOPMENT_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  AUTH_ACCESS_TOKEN_SECRET: [
    "dev-only-access-secret-change-me",
    "your-access-token-secret",
    "replace_with_long_random_secret",
  ],
  AUTH_REFRESH_TOKEN_SECRET: [
    "dev-only-refresh-secret-change-me",
    "your-refresh-token-secret",
    "replace_with_long_random_secret",
  ],
  API_SECURITY_ADMIN_TOKEN: [
    "local-security-admin-token",
    "replace_with_long_random_token",
  ],
  KEY_SERVICE_CLIENT_TOKEN: [
    "local-key-client-token",
    "replace_with_long_random_token",
  ],
  KEY_SERVICE_ADMIN_TOKEN: [
    "local-key-admin-token",
    "replace_with_long_random_token",
  ],
  ONEZE_ATTESTATION_SIGNING_SECRET: [
    "dev-only-oneze-attestation-signing-secret",
    "replace_with_long_random_secret",
  ],
  ONEZE_FX_PROVIDER_API_KEY: ["replace_with_live_fx_provider_key"],
  S3_ACCESS_KEY: ["minioadmin", "minio_service_user"],
  S3_SECRET_KEY: ["minioadmin", "replace_with_strong_password"],
};

const REQUIRED_PRODUCTION_VALUES = [
  "APP_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "KEY_SERVICE_URL",
  "KEY_SERVICE_CLIENT_TOKEN",
  "KEY_SERVICE_ADMIN_TOKEN",
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_BUCKET",
  "S3_CDN_BASE_URL",
  "AUTH_ACCESS_TOKEN_SECRET",
  "AUTH_REFRESH_TOKEN_SECRET",
  "API_SECURITY_ADMIN_TOKEN",
  "ONEZE_ATTESTATION_SIGNING_SECRET",
  "ONEZE_FX_PROVIDER_URL",
  "ONEZE_FX_PROVIDER_API_KEY",
  "KYC_DEFAULT_VENDOR",
  "KYC_RETURN_URL",
  "KYC_WEBHOOK_SECRET",
] as const;

const MINIMUM_SECRET_LENGTHS: Readonly<Record<string, number>> = {
  AUTH_ACCESS_TOKEN_SECRET: 32,
  AUTH_REFRESH_TOKEN_SECRET: 32,
  API_SECURITY_ADMIN_TOKEN: 32,
  KEY_SERVICE_CLIENT_TOKEN: 32,
  KEY_SERVICE_ADMIN_TOKEN: 32,
  ONEZE_ATTESTATION_SIGNING_SECRET: 32,
  ONEZE_FX_PROVIDER_API_KEY: 12,
  S3_SECRET_KEY: 24,
  KYC_WEBHOOK_SECRET: 24,
};

function valueOf(environment: NodeJS.ProcessEnv, key: string): string {
  return environment[key]?.trim() ?? "";
}

function isTruthy(value: string): boolean {
  return value.toLowerCase() === "true";
}

function isSecurePublicUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function isCompleteProviderSet(
  environment: NodeJS.ProcessEnv,
  keys: readonly string[],
): boolean {
  return keys.every((key) => valueOf(environment, key).length > 0);
}

export function collectProductionReadinessErrors(
  environment: NodeJS.ProcessEnv,
): string[] {
  if (valueOf(environment, "NODE_ENV").toLowerCase() !== "production") {
    return [];
  }

  const errors: string[] = [];

  for (const key of REQUIRED_PRODUCTION_VALUES) {
    if (!valueOf(environment, key)) {
      errors.push(`${key} is required in production`);
    }
  }

  for (const [key, defaults] of Object.entries(DEVELOPMENT_DEFAULTS)) {
    const value = valueOf(environment, key);
    if (value && defaults.some((entry) => value === entry)) {
      errors.push(`${key} still uses a development or example value`);
    }
  }

  for (const [key, minimumLength] of Object.entries(MINIMUM_SECRET_LENGTHS)) {
    const value = valueOf(environment, key);
    if (value && value.length < minimumLength) {
      errors.push(`${key} must contain at least ${minimumLength} characters`);
    }
  }

  const accessSecret = valueOf(environment, "AUTH_ACCESS_TOKEN_SECRET");
  const refreshSecret = valueOf(environment, "AUTH_REFRESH_TOKEN_SECRET");
  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    errors.push(
      "AUTH_ACCESS_TOKEN_SECRET and AUTH_REFRESH_TOKEN_SECRET must be different",
    );
  }

  if (isTruthy(valueOf(environment, "API_ENABLE_MOCK_WEBHOOKS"))) {
    errors.push("API_ENABLE_MOCK_WEBHOOKS must be false in production");
  }

  if (isTruthy(valueOf(environment, "AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS"))) {
    errors.push(
      "AUTH_EXPOSE_DEVELOPMENT_ARTIFACTS must be false in production",
    );
  }

  for (const key of [
    "APP_URL",
    "S3_PUBLIC_ENDPOINT",
    "S3_CDN_BASE_URL",
  ] as const) {
    const value = valueOf(environment, key);
    if (value && !isSecurePublicUrl(value)) {
      errors.push(`${key} must be a public https:// URL in production`);
    }
  }

  if (!isTruthy(valueOf(environment, "ONEZE_FX_SYNC_ENABLED"))) {
    errors.push("ONEZE_FX_SYNC_ENABLED must be true in production");
  }
  const fxProviderUrl = valueOf(environment, "ONEZE_FX_PROVIDER_URL");
  if (fxProviderUrl && !isSecurePublicUrl(fxProviderUrl)) {
    errors.push(
      "ONEZE_FX_PROVIDER_URL must be a public https:// URL in production",
    );
  }

  const kycVendor = valueOf(environment, "KYC_DEFAULT_VENDOR").toLowerCase();
  if (kycVendor && kycVendor !== "stripe_identity") {
    errors.push(
      "KYC_DEFAULT_VENDOR must be stripe_identity until another signed provider adapter is installed",
    );
  }
  const kycReturnUrl = valueOf(environment, "KYC_RETURN_URL");
  if (kycReturnUrl && !isSecurePublicUrl(kycReturnUrl)) {
    errors.push("KYC_RETURN_URL must be a public https:// URL in production");
  }
  if (
    kycVendor === "stripe_identity" &&
    !valueOf(environment, "STRIPE_SECRET_KEY")
  ) {
    errors.push(
      "STRIPE_SECRET_KEY is required when KYC_DEFAULT_VENDOR is stripe_identity",
    );
  }

  const rateLimitWindow =
    valueOf(environment, "API_RATE_LIMIT_WINDOW") || "1 minute";
  if (
    !/^\d+\s*(?:ms|millisecond|milliseconds|s|second|seconds|m|minute|minutes|h|hour|hours)$/i.test(
      rateLimitWindow,
    )
  ) {
    errors.push(
      'API_RATE_LIMIT_WINDOW must be a positive duration such as "1 minute" or "30 seconds"',
    );
  }

  const rateLimitMax = Number(
    valueOf(environment, "API_RATE_LIMIT_MAX") || "140",
  );
  if (
    !Number.isInteger(rateLimitMax) ||
    rateLimitMax < 1 ||
    rateLimitMax > 100_000
  ) {
    errors.push("API_RATE_LIMIT_MAX must be an integer between 1 and 100000");
  }

  const hasPaymentProvider = [
    ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    ["MOLLIE_API_KEY", "MOLLIE_WEBHOOK_SECRET"],
    ["FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_WEBHOOK_SECRET"],
    ["TAP_SECRET_KEY", "TAP_WEBHOOK_SECRET"],
  ].some((keys) => isCompleteProviderSet(environment, keys));

  if (!hasPaymentProvider) {
    errors.push(
      "At least one complete payment provider credential set is required in production",
    );
  }

  const hasShippingProvider = [
    ["EVRI_API_KEY", "EVRI_API_BASE_URL", "EVRI_WEBHOOK_SECRET"],
    ["DELHIVERY_API_KEY", "DELHIVERY_API_BASE_URL", "DELHIVERY_WEBHOOK_SECRET"],
    ["DHL_API_KEY", "DHL_API_BASE_URL", "DHL_WEBHOOK_SECRET"],
    ["ARAMEX_API_KEY", "ARAMEX_API_BASE_URL", "ARAMEX_WEBHOOK_SECRET"],
    ["EASYSHIP_API_KEY", "EASYSHIP_WEBHOOK_SECRET"],
  ].some((keys) => isCompleteProviderSet(environment, keys));

  if (!hasShippingProvider) {
    errors.push(
      "At least one complete shipping provider credential set is required in production",
    );
  }

  const alertUrls =
    valueOf(environment, "ALERTING_WEBHOOK_URLS") ||
    valueOf(environment, "ALERTING_WEBHOOK_URL");
  if (!alertUrls) {
    errors.push(
      "ALERTING_WEBHOOK_URLS is required for out-of-band production alerts",
    );
  } else {
    for (const entry of alertUrls
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)) {
      if (!isSecurePublicUrl(entry)) {
        errors.push(
          "Every ALERTING_WEBHOOK_URLS entry must be a public https:// URL",
        );
        break;
      }
    }
  }

  return errors;
}

export function assertProductionReadiness(
  environment: NodeJS.ProcessEnv,
): void {
  const errors = collectProductionReadinessErrors(environment);
  if (errors.length === 0) {
    return;
  }

  throw new Error(
    [
      "Production configuration is unsafe; refusing to start:",
      ...errors.map((error) => `- ${error}`),
    ].join("\n"),
  );
}
