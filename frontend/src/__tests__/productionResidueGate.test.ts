/**
 * Regression coverage for the production-residue gate (F02).
 *
 * The checker used to flag every `X_DEMO_MODE = true` / `isDemo = true`
 * literal — including assignments inside `if (ENABLE_RUNTIME_MOCKS)` blocks
 * (dead code in production, since the flag fail-closes outside dev) and
 * `isDemo` labels set on the degraded `catch` path (honest disclosure, not
 * fabrication). These tests pin both the allowed and the still-rejected
 * shapes so the gate cannot regress in either direction.
 */

import { describe, it, expect } from 'vitest';
// The checker is a plain .mjs script; it exports the pure check functions
// for exactly this suite (typed as any — assertions cover the contract).
import { checkDemoModeTrue } from '../../scripts/check-production-residue.mjs';

const FILE = 'src/services/exampleApi.ts';

function violationsFor(source: string) {
  return (checkDemoModeTrue as (s: string, f: string) => Array<{ rule: string }>)(source, FILE);
}

describe('production-residue gate — demo-mode / isDemo literals', () => {
  // ── Allowed shapes ──────────────────────────────────────────────────────

  it('allows DEMO_MODE = true inside an ENABLE_RUNTIME_MOCKS branch', () => {
    const src = [
      'export async function fetchThings() {',
      '  try {',
      '    return await realFetch();',
      '  } catch (err) {',
      '    if (ENABLE_RUNTIME_MOCKS) {',
      '      GALLERIA_DEMO_MODE = true;',
      '      return MOCK_THINGS;',
      '    }',
      '    GALLERIA_DEMO_MODE = false;',
      '    throw err;',
      '  }',
      '}',
    ].join('\n');
    expect(violationsFor(src)).toHaveLength(0);
  });

  it('allows DEMO_MODE = true nested deeper inside the gated block', () => {
    const src = [
      'if (ENABLE_RUNTIME_MOCKS) {',
      '  if (fallback) {',
      '    FOO_DEMO_MODE = true;',
      '  }',
      '}',
    ].join('\n');
    expect(violationsFor(src)).toHaveLength(0);
  });

  it('allows DEMO_MODE = true inside a __DEV__ block', () => {
    const src = ['if (__DEV__) {', '  FOO_DEMO_MODE = true;', '}'].join('\n');
    expect(violationsFor(src)).toHaveLength(0);
  });

  it('allows isDemo = true on the degraded catch path (honest label)', () => {
    const src = [
      'let isDemo = false;',
      'try {',
      '  filters = await apiParse(query);',
      '} catch {',
      '  filters = extractFilters(query);',
      '  isDemo = true;',
      '}',
    ].join('\n');
    expect(violationsFor(src)).toHaveLength(0);
  });

  it('allows isDemo = true inside an ENABLE_RUNTIME_MOCKS branch', () => {
    const src = [
      'if (ENABLE_RUNTIME_MOCKS) {',
      '  isDemo = true;',
      '}',
    ].join('\n');
    expect(violationsFor(src)).toHaveLength(0);
  });

  // ── Rejected shapes — true production residue must still block ──────────

  it('rejects an unconditional DEMO_MODE = true', () => {
    const src = 'const FOO_DEMO_MODE = true;';
    const v = violationsFor(src);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('demo-mode-true');
  });

  it('rejects DEMO_MODE = true in a bare catch (fabricates on prod failure)', () => {
    // A catch that flips demo mode on without an ENABLE_RUNTIME_MOCKS gate
    // would silently serve mocks in production on any API failure.
    const src = [
      'try {',
      '  await realFetch();',
      '} catch {',
      '  FOO_DEMO_MODE = true;',
      '}',
    ].join('\n');
    const v = violationsFor(src);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('demo-mode-true');
  });

  it('rejects isDemo = true on the unconditional main path', () => {
    const src = [
      'function buildMessage() {',
      '  const isDemo = true;',
      '  return { isDemo };',
      '}',
    ].join('\n');
    const v = violationsFor(src);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('is-demo-true');
  });

  it('rejects DEMO_MODE = true inside an unrelated if-block', () => {
    const src = [
      'if (someCondition) {',
      '  FOO_DEMO_MODE = true;',
      '}',
    ].join('\n');
    expect(violationsFor(src)).toHaveLength(1);
  });

  it('does not flag DEMO_MODE = __DEV__ or = false', () => {
    const src = [
      'const A_DEMO_MODE = __DEV__;',
      'const B_DEMO_MODE = false;',
    ].join('\n');
    expect(violationsFor(src)).toHaveLength(0);
  });
});
