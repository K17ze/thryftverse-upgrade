import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Dispute evidence submission — Zod validation schema
//
// The POST /payments/disputes/:disputeId/evidence endpoint validates its body
// with an inline Zod schema. We cannot import the inline schema from the route,
// so we mirror it here and exercise the validation guarantees:
//   - every evidence field is an optional string of at most 5000 characters
//   - an empty evidence object is valid (all fields optional)
//   - a field exceeding 5000 chars is rejected
//   - non-string field values are rejected
// ─────────────────────────────────────────────────────────────────────────────

const evidenceField = z.string().max(5000).optional();

const evidenceSchema = z.object({
  evidence: z.object({
    accessActivityLog: evidenceField,
    billingAddress: evidenceField,
    cancellationPolicy: evidenceField,
    customerCommunication: evidenceField,
    customerName: evidenceField,
    customerEmail: evidenceField,
    customerPurchaseIp: evidenceField,
    duplicateChargeId: evidenceField,
    duplicateChargeExplanation: evidenceField,
    productDescription: evidenceField,
    receipt: evidenceField,
    refundPolicy: evidenceField,
    refundRefusalExplanation: evidenceField,
    serviceDate: evidenceField,
    serviceDocumentation: evidenceField,
    shippingAddress: evidenceField,
    shippingCarrier: evidenceField,
    shippingDate: evidenceField,
    shippingDocumentation: evidenceField,
    shippingTrackingNumber: evidenceField,
    uncategorizedFile: evidenceField,
    uncategorizedText: evidenceField,
  }),
});

test('dispute evidence: valid evidence with a few fields passes validation', () => {
  const parsed = evidenceSchema.parse({
    evidence: {
      customerName: 'Alice Trader',
      customerEmail: 'alice@example.com',
      productDescription: 'Handmade ceramic vase, order #1042',
      shippingTrackingNumber: 'RP123456789GB',
    },
  });

  assert.equal(parsed.evidence.customerName, 'Alice Trader');
  assert.equal(parsed.evidence.customerEmail, 'alice@example.com');
  assert.equal(parsed.evidence.productDescription, 'Handmade ceramic vase, order #1042');
  assert.equal(parsed.evidence.shippingTrackingNumber, 'RP123456789GB');
});

test('dispute evidence: empty evidence object passes validation (all fields optional)', () => {
  const parsed = evidenceSchema.parse({ evidence: {} });

  assert.deepEqual(parsed.evidence, {});
});

test('dispute evidence: a field exceeding 5000 chars is rejected', () => {
  const tooLong = 'x'.repeat(5001);

  assert.throws(
    () => evidenceSchema.parse({ evidence: { productDescription: tooLong } }),
    (err: unknown) => {
      assert.ok(err instanceof z.ZodError, 'expected a ZodError');
      return true;
    }
  );
});

test('dispute evidence: a field at exactly 5000 chars is accepted', () => {
  const exactly5000 = 'x'.repeat(5000);

  const parsed = evidenceSchema.parse({ evidence: { uncategorizedText: exactly5000 } });

  assert.equal(parsed.evidence.uncategorizedText, exactly5000);
  assert.equal(parsed.evidence.uncategorizedText?.length, 5000);
});

test('dispute evidence: non-string field values are rejected', () => {
  // Zod's .parse() accepts `unknown` at the type level, so these invalid
  // values compile fine but must be rejected at runtime with a ZodError.
  assert.throws(
    () =>
      evidenceSchema.parse({
        evidence: {
          customerName: 12345 as unknown as string,
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof z.ZodError, 'expected a ZodError');
      return true;
    }
  );

  assert.throws(
    () =>
      evidenceSchema.parse({
        evidence: {
          refundPolicy: true as unknown as string,
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof z.ZodError, 'expected a ZodError');
      return true;
    }
  );

  assert.throws(
    () =>
      evidenceSchema.parse({
        evidence: {
          shippingAddress: { line1: '1 Main St' } as unknown as string,
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof z.ZodError, 'expected a ZodError');
      return true;
    }
  );
});

test('dispute evidence: missing top-level evidence object is rejected', () => {
  assert.throws(
    () => evidenceSchema.parse({}),
    (err: unknown) => {
      assert.ok(err instanceof z.ZodError, 'expected a ZodError');
      return true;
    }
  );
});
