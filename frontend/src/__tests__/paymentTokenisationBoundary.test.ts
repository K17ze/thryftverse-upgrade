import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRECTORIES = new Set(['__tests__']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const FORBIDDEN_CARD_DATA_IDENTIFIERS = [
  /\bcardNumber\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\bsecurityCode\b/i,
];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
}

describe('tokenised card-data boundary', () => {
  it('does not introduce raw card-number or security-code state outside the Stripe SDK', () => {
    const violations = sourceFiles(SOURCE_ROOT).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return FORBIDDEN_CARD_DATA_IDENTIFIERS
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path.relative(SOURCE_ROOT, file)} matched ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps the Thryftverse add-card surface free of owned card fields', () => {
    const addCardSource = fs.readFileSync(
      path.join(SOURCE_ROOT, 'components', 'checkout', 'AddCardSheet.tsx'),
      'utf8'
    );

    expect(addCardSource).not.toContain('TextInput');
    expect(addCardSource).toContain('presentPaymentSheet');
    expect(addCardSource).toContain('setupIntentClientSecret');
  });

  it('sends only setup orchestration metadata to the Thryftverse API', () => {
    const commerceApiSource = fs.readFileSync(
      path.join(SOURCE_ROOT, 'services', 'commerceApi.ts'),
      'utf8'
    );
    const setupFunction = commerceApiSource.slice(
      commerceApiSource.indexOf('export async function createStripeSetupSheet'),
      commerceApiSource.indexOf('export async function createStripeOrderSheet')
    );

    expect(setupFunction).toContain('idempotencyKey');
    expect(
      FORBIDDEN_CARD_DATA_IDENTIFIERS.some((pattern) => pattern.test(setupFunction))
    ).toBe(false);
  });
});
