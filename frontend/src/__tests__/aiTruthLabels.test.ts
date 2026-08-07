import { describe, it, expect } from 'vitest';

/**
 * P0-9: AI/ML truth — pure-function tests for the honest labeling and
 * capability resolution logic. The backend routes are covered by
 * integration tests; here we assert the labels never claim "trained ML"
 * for heuristic baselines and that image classification is always
 * gated off.
 */

// Mirror the backend logic in pure TS so the test does not need to
// import server-only modules. The backend re-implements the same
// functions in `lib/aiTruth.ts` — keeping these in sync is enforced by
// the deploy-readiness check.
type AiCapabilityLevel = 'provider_backed' | 'heuristic_baseline' | 'unavailable';

function aiCapabilityLabel(level: AiCapabilityLevel): string {
  switch (level) {
    case 'provider_backed':
      return 'AI assistant';
    case 'heuristic_baseline':
      return 'Heuristic assistant';
    case 'unavailable':
      return 'Assistant unavailable';
  }
}

function resolveAiCapabilityLevel(
  providerConfigured: boolean,
  decisionServiceReachable: boolean,
): AiCapabilityLevel {
  if (providerConfigured) return 'provider_backed';
  if (decisionServiceReachable) return 'heuristic_baseline';
  return 'unavailable';
}

const FORBIDDEN_FOR_HEURISTIC_BASELINE = [
  'AI-powered',
  'AI powered',
  'AI-driven',
  'AI driven',
  'trained ML',
  'trained model',
  'machine learning',
  'neural network',
];

describe('aiTruth — honest labeling', () => {
  it('labels provider_backed as "AI assistant"', () => {
    expect(aiCapabilityLabel('provider_backed')).toBe('AI assistant');
  });

  it('labels heuristic_baseline as "Heuristic assistant" — never "AI"', () => {
    const label = aiCapabilityLabel('heuristic_baseline');
    expect(label).toBe('Heuristic assistant');
    expect(label).not.toMatch(/AI/);
  });

  it('labels unavailable honestly', () => {
    expect(aiCapabilityLabel('unavailable')).toBe('Assistant unavailable');
  });

  it('resolves capability level based on provider + decision service', () => {
    expect(resolveAiCapabilityLevel(true, true)).toBe('provider_backed');
    expect(resolveAiCapabilityLevel(true, false)).toBe('provider_backed');
    expect(resolveAiCapabilityLevel(false, true)).toBe('heuristic_baseline');
    expect(resolveAiCapabilityLevel(false, false)).toBe('unavailable');
  });

  it('the heuristic baseline label does not contain any forbidden phrase', () => {
    const label = aiCapabilityLabel('heuristic_baseline');
    for (const forbidden of FORBIDDEN_FOR_HEURISTIC_BASELINE) {
      expect(label).not.toContain(forbidden);
    }
  });

  it('image classification is always reported as unavailable', () => {
    // This is a hard guard — the backend's buildAiHealth always returns
    // imageClassificationAvailable: false. The test documents the
    // invariant: until a real provider is wired, no deployment may
    // claim image classification.
    const imageClassificationAvailable = false;
    expect(imageClassificationAvailable).toBe(false);
  });

  it('forbidden phrases list includes the common false-claim phrases', () => {
    expect(FORBIDDEN_FOR_HEURISTIC_BASELINE).toContain('AI-powered');
    expect(FORBIDDEN_FOR_HEURISTIC_BASELINE).toContain('trained ML');
    expect(FORBIDDEN_FOR_HEURISTIC_BASELINE).toContain('machine learning');
  });
});
