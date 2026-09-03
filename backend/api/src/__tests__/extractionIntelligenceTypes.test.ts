/**
 * Tests for the extraction intelligence domain types and constants.
 *
 * Verifies that the EMPTY_OUTCOMES and PRODUCTIVE_OUTCOMES sets are
 * correct and mutually exclusive — these are used by the service to
 * decide whether to store candidates and how to compute the isEmpty flag.
 */

import { describe, it, expect } from 'vitest';
import {
  EXTRACTION_JOB_STATES,
  EXTRACTION_OUTCOMES,
  EMPTY_OUTCOMES,
  PRODUCTIVE_OUTCOMES,
} from '../domain/catalogImports/extractionIntelligenceTypes.js';

describe('Extraction Intelligence Types', () => {
  // ── Job states ───────────────────────────────────────────────────────────

  describe('EXTRACTION_JOB_STATES', () => {
    it('includes all five lifecycle states', () => {
      expect(EXTRACTION_JOB_STATES).toEqual([
        'queued',
        'running',
        'retry_wait',
        'terminal',
        'superseded',
      ]);
    });
  });

  // ── Outcomes ─────────────────────────────────────────────────────────────

  describe('EXTRACTION_OUTCOMES', () => {
    it('includes all eight outcomes', () => {
      expect(EXTRACTION_OUTCOMES).toEqual([
        'succeeded',
        'partial',
        'unavailable_no_model',
        'ineligible',
        'source_missing',
        'failed',
        'cancelled',
        'outcome_unknown',
      ]);
    });
  });

  // ── EMPTY_OUTCOMES ───────────────────────────────────────────────────────

  describe('EMPTY_OUTCOMES', () => {
    it('includes outcomes that produce no usable candidates', () => {
      expect(EMPTY_OUTCOMES.has('unavailable_no_model')).toBe(true);
      expect(EMPTY_OUTCOMES.has('ineligible')).toBe(true);
      expect(EMPTY_OUTCOMES.has('source_missing')).toBe(true);
      expect(EMPTY_OUTCOMES.has('failed')).toBe(true);
      expect(EMPTY_OUTCOMES.has('cancelled')).toBe(true);
    });

    it('excludes outcomes that produce candidates', () => {
      expect(EMPTY_OUTCOMES.has('succeeded')).toBe(false);
      expect(EMPTY_OUTCOMES.has('partial')).toBe(false);
      expect(EMPTY_OUTCOMES.has('outcome_unknown')).toBe(false);
    });
  });

  // ── PRODUCTIVE_OUTCOMES ──────────────────────────────────────────────────

  describe('PRODUCTIVE_OUTCOMES', () => {
    it('includes outcomes that produce at least some valid candidates', () => {
      expect(PRODUCTIVE_OUTCOMES.has('succeeded')).toBe(true);
      expect(PRODUCTIVE_OUTCOMES.has('partial')).toBe(true);
    });

    it('excludes outcomes that produce no candidates', () => {
      expect(PRODUCTIVE_OUTCOMES.has('unavailable_no_model')).toBe(false);
      expect(PRODUCTIVE_OUTCOMES.has('source_missing')).toBe(false);
      expect(PRODUCTIVE_OUTCOMES.has('failed')).toBe(false);
    });
  });

  // ── Mutual exclusivity ───────────────────────────────────────────────────

  describe('mutual exclusivity', () => {
    it('EMPTY_OUTCOMES and PRODUCTIVE_OUTCOMES do not overlap', () => {
      for (const outcome of EXTRACTION_OUTCOMES) {
        const inEmpty = EMPTY_OUTCOMES.has(outcome);
        const inProductive = PRODUCTIVE_OUTCOMES.has(outcome);
        expect(inEmpty && inProductive).toBe(false);
      }
    });
  });
});
