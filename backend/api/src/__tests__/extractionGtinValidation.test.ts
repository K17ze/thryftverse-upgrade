/**
 * Tests for the GTIN checksum validation function in the candidate pipeline.
 *
 * The validateGtin function implements the GS1 General Specifications 24.0
 * modulo-10 check digit algorithm with alternating 3/1 weights for
 * GTIN-8, GTIN-12, GTIN-13, and GTIN-14.
 */

import { describe, it, expect } from 'vitest';
import { validateGtin } from '../lib/extraction/candidatePipeline.js';

describe('validateGtin', () => {
  // ── Valid GTINs (verified check digits) ──────────────────────────────────

  it('validates a correct GTIN-8', () => {
    // GTIN-8: payload 0001234, GS1 check digit 8 → 00012348
    expect(validateGtin('00012348')).toBe('valid');
  });

  it('validates a correct GTIN-12 (UPC-A)', () => {
    // UPC-A: 03600029145 with check digit 2 → 036000291452
    expect(validateGtin('036000291452')).toBe('valid');
  });

  it('validates a correct GTIN-13 (EAN-13)', () => {
    // EAN-13: 400638133393 with check digit 1 → 4006381333931
    expect(validateGtin('4006381333931')).toBe('valid');
  });

  it('validates a correct GTIN-14', () => {
    // GTIN-14: payload 0001234560001, GS1 check digit 2 → 00012345600012
    expect(validateGtin('00012345600012')).toBe('valid');
  });

  // ── Invalid GTINs (wrong check digit) ────────────────────────────────────

  it('rejects a GTIN-8 with wrong check digit', () => {
    expect(validateGtin('00012340')).toBe('invalid');
  });

  it('rejects a GTIN-13 with wrong check digit', () => {
    expect(validateGtin('4006381333930')).toBe('invalid');
  });

  it('rejects a GTIN-12 with wrong check digit', () => {
    expect(validateGtin('036000291453')).toBe('invalid');
  });

  // ── Invalid formats ──────────────────────────────────────────────────────

  it('rejects a non-numeric string', () => {
    expect(validateGtin('ABCDEFGHI')).toBe('invalid');
  });

  it('rejects a string with spaces', () => {
    // Spaces are stripped before validation, so "4006 381 333931" should
    // validate as 4006381333931.
    expect(validateGtin('4006 381 333931')).toBe('valid');
  });

  it('rejects an empty string', () => {
    expect(validateGtin('')).toBe('invalid');
  });

  it('rejects a too-short string', () => {
    expect(validateGtin('12345')).toBe('invalid');
  });

  it('rejects a too-long string', () => {
    expect(validateGtin('12345678901234567')).toBe('invalid');
  });

  it('rejects a 15-digit string (not a valid GTIN length)', () => {
    expect(validateGtin('123456789012345')).toBe('invalid');
  });

  it('rejects a 10-digit string (not a valid GTIN length)', () => {
    expect(validateGtin('1234567890')).toBe('invalid');
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('handles all-zeros GTIN-8 (check digit 0)', () => {
    // 0000000 + check digit. Sum = 0, check = (10 - 0) % 10 = 0.
    expect(validateGtin('00000000')).toBe('valid');
  });

  it('handles a GTIN-14 with leading zeros', () => {
    // Payload 0003600029145 + check digit 2 → 00036000291452
    expect(validateGtin('00036000291452')).toBe('valid');
  });
});
