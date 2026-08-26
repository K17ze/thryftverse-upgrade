import { describe, expect, it } from 'vitest';
import {
  parseGbpToMinor,
  formatMinorToGbp,
  addGbp,
  subGbp,
  mulGbpUnits,
  feeGbp,
  gbpToMinor,
  minorToGbp,
} from '../utils/money';

describe('P0.8: Money utility — exact arithmetic', () => {
  it('parseGbpToMinor: "49.25" → 4925n', () => {
    expect(parseGbpToMinor('49.25')).toBe(4925n);
  });

  it('parseGbpToMinor: "0.1" → 10n (no floating point error)', () => {
    expect(parseGbpToMinor('0.1')).toBe(10n);
  });

  it('parseGbpToMinor: "0.2" → 20n', () => {
    expect(parseGbpToMinor('0.2')).toBe(20n);
  });

  it('parseGbpToMinor: handles empty/invalid → 0n', () => {
    expect(parseGbpToMinor('')).toBe(0n);
    expect(parseGbpToMinor('invalid')).toBe(0n);
    expect(parseGbpToMinor('0')).toBe(0n);
  });

  it('parseGbpToMinor: handles negative "-49.25" → -4925n', () => {
    expect(parseGbpToMinor('-49.25')).toBe(-4925n);
  });

  it('parseGbpToMinor: handles more than 2 decimal places (truncates to 2)', () => {
    expect(parseGbpToMinor('49.259')).toBe(4925n); // truncates, not rounds
  });

  it('formatMinorToGbp: 4925n → "49.25"', () => {
    expect(formatMinorToGbp(4925n)).toBe('49.25');
  });

  it('formatMinorToGbp: 4920n → "49.2" (trailing zeros stripped)', () => {
    expect(formatMinorToGbp(4920n)).toBe('49.2');
  });

  it('formatMinorToGbp: 4900n → "49" (no decimal point for whole numbers)', () => {
    expect(formatMinorToGbp(4900n)).toBe('49');
  });

  it('formatMinorToGbp: 0n → "0"', () => {
    expect(formatMinorToGbp(0n)).toBe('0');
  });

  it('formatMinorToGbp: -4925n → "-49.25"', () => {
    expect(formatMinorToGbp(-4925n)).toBe('-49.25');
  });

  it('addGbp: 0.1 + 0.2 = 0.30 exactly (no floating point error)', () => {
    const result = addGbp(parseGbpToMinor('0.1'), parseGbpToMinor('0.2'));
    expect(formatMinorToGbp(result)).toBe('0.3');
  });

  it('subGbp: 49.25 - 49.00 = 0.25', () => {
    const result = subGbp(parseGbpToMinor('49.25'), parseGbpToMinor('49.00'));
    expect(formatMinorToGbp(result)).toBe('0.25');
  });

  it('mulGbpUnits: 49.25 * 5 units = 246.25', () => {
    const result = mulGbpUnits(parseGbpToMinor('49.25'), 5);
    expect(formatMinorToGbp(result)).toBe('246.25');
  });

  it('feeGbp: 1% fee on 246.25 = 2.46 (rounded half-up)', () => {
    const result = feeGbp(parseGbpToMinor('246.25'), 0.01);
    expect(formatMinorToGbp(result)).toBe('2.46');
  });

  it('feeGbp: 1% fee on 49.25 = 0.49 (rounded half-up)', () => {
    const result = feeGbp(parseGbpToMinor('49.25'), 0.01);
    expect(formatMinorToGbp(result)).toBe('0.49');
  });

  it('feeGbp: 1% fee on 49.29 = 0.49 (49.29 * 0.01 = 0.4929, rounds to 0.49)', () => {
    const result = feeGbp(parseGbpToMinor('49.29'), 0.01);
    expect(formatMinorToGbp(result)).toBe('0.49');
  });

  it('feeGbp: 1% fee on 49.30 = 0.49 (49.30 * 0.01 = 0.493, rounds to 0.49)', () => {
    const result = feeGbp(parseGbpToMinor('49.30'), 0.01);
    expect(formatMinorToGbp(result)).toBe('0.49');
  });

  it('feeGbp: 1% fee on 49.31 = 0.49 (49.31 * 0.01 = 0.4931, rounds to 0.49)', () => {
    const result = feeGbp(parseGbpToMinor('49.31'), 0.01);
    expect(formatMinorToGbp(result)).toBe('0.49');
  });

  it('feeGbp: 1% fee on 49.35 = 0.50 (49.35 * 0.01 = 0.4935, rounds to 0.49)', () => {
    // 4935 * 100 = 493500, + 5000 = 498500, / 10000 = 49 (half-up at 49.85 → 49)
    // Wait: 4935 * 100 = 493500 bps, + 5000 = 498500, / 10000 = 49n pence = 0.49
    // Actually 49.35 * 0.01 = 0.4935, which rounds to 0.49 (half-up: 0.4935 → 0.49)
    const result = feeGbp(parseGbpToMinor('49.35'), 0.01);
    expect(formatMinorToGbp(result)).toBe('0.49');
  });

  it('feeGbp: 1% fee on 49.50 = 0.50 (49.50 * 0.01 = 0.495, rounds to 0.50)', () => {
    // 4950 * 100 = 495000, + 5000 = 500000, / 10000 = 50n pence = 0.50
    const result = feeGbp(parseGbpToMinor('49.50'), 0.01);
    expect(formatMinorToGbp(result)).toBe('0.5');
  });

  it('gbpToMinor: 49.25 → 4925n (legacy number conversion)', () => {
    expect(gbpToMinor(49.25)).toBe(4925n);
  });

  it('minorToGbp: 4925n → 49.25 (legacy number conversion)', () => {
    expect(minorToGbp(4925n)).toBe(49.25);
  });

  it('Round-trip: parse → format → parse is stable', () => {
    const values = ['0.01', '0.10', '1.00', '49.25', '99.99', '1000.00', '0.99'];
    for (const v of values) {
      const minor = parseGbpToMinor(v);
      const formatted = formatMinorToGbp(minor);
      const reparsed = parseGbpToMinor(formatted);
      expect(reparsed).toBe(minor);
    }
  });

  it('Large values: 1000000.00 parses correctly (no precision loss)', () => {
    const minor = parseGbpToMinor('1000000.00');
    expect(minor).toBe(100000000n);
    expect(formatMinorToGbp(minor)).toBe('1000000');
  });
});
