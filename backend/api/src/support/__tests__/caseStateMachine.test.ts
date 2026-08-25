import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_TRANSITIONS,
  isValidTransition,
  assertTransition,
} from '../caseStateMachine.js';
import type { CaseOperationalState } from '../contracts.js';

describe('caseStateMachine', () => {
  describe('VALID_TRANSITIONS', () => {
    it('defines transitions for all operational states', () => {
      const allStates: CaseOperationalState[] = [
        'new',
        'triaged',
        'awaiting_customer',
        'queued',
        'in_review',
        'awaiting_external',
        'resolved',
        'closed',
      ];

      for (const state of allStates) {
        assert.ok(
          state in VALID_TRANSITIONS,
          `State "${state}" must have an entry in VALID_TRANSITIONS`,
        );
      }
    });
  });

  describe('isValidTransition', () => {
    it('allows new → triaged', () => {
      assert.equal(isValidTransition('new', 'triaged'), true);
    });

    it('allows triaged → queued', () => {
      assert.equal(isValidTransition('triaged', 'queued'), true);
    });

    it('allows triaged → resolved', () => {
      assert.equal(isValidTransition('triaged', 'resolved'), true);
    });

    it('allows resolved → closed', () => {
      assert.equal(isValidTransition('resolved', 'closed'), true);
    });

    it('allows resolved → queued (reopen)', () => {
      assert.equal(isValidTransition('resolved', 'queued'), true);
    });

    it('allows closed → triaged (reopen after closure)', () => {
      assert.equal(isValidTransition('closed', 'triaged'), true);
    });

    it('rejects new → resolved (must triage first)', () => {
      assert.equal(isValidTransition('new', 'resolved'), false);
    });

    it('rejects new → closed (must triage and resolve first)', () => {
      assert.equal(isValidTransition('new', 'closed'), false);
    });

    it('rejects self-transitions', () => {
      const states: CaseOperationalState[] = [
        'new',
        'triaged',
        'awaiting_customer',
        'queued',
        'in_review',
        'awaiting_external',
        'resolved',
        'closed',
      ];

      for (const state of states) {
        assert.equal(
          isValidTransition(state, state),
          false,
          `Self-transition ${state} → ${state} must be rejected`,
        );
      }
    });

    it('rejects closed → new (cannot reset to new)', () => {
      assert.equal(isValidTransition('closed', 'new'), false);
    });
  });

  describe('assertTransition', () => {
    it('does not throw for valid transitions', () => {
      assert.doesNotThrow(() => assertTransition('new', 'triaged'));
      assert.doesNotThrow(() => assertTransition('triaged', 'resolved'));
      assert.doesNotThrow(() => assertTransition('resolved', 'closed'));
    });

    it('throws for invalid transitions', () => {
      assert.throws(
        () => assertTransition('new', 'resolved'),
        /Invalid case state transition/,
      );
    });

    it('throws for self-transitions', () => {
      assert.throws(
        () => assertTransition('queued', 'queued'),
        /Invalid case state transition/,
      );
    });

    it('throws an error with code and statusCode properties', () => {
      try {
        assertTransition('new', 'closed');
        assert.fail('Should have thrown');
      } catch (err) {
        const error = err as Error & { code: string; statusCode: number };
        assert.equal(error.code, 'INVALID_STATE_TRANSITION');
        assert.equal(error.statusCode, 409);
      }
    });
  });
});
