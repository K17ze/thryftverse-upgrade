import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FILTERS } from '../../components/poster/filters/filterConfig';
import {
  FILTER_PRESET_MATRICES as JS_MATRICES,
  interpolateMatrix as jsInterpolateMatrix,
} from '../../../modules/thryft-media-export/src/filterMatrices';

// ── The 10 flagship filters that must agree across all three renderers ──
const FILTER_NAMES = [
  'normal', 'warm', 'cool', 'vintage', 'bw',
  'cinematic', 'fade', 'vivid', 'noir', 'golden',
] as const;

const IDENTITY = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

type InterpolateFn = (target: number[], intensity: number) => number[];
type BackendInterpolateFn = (
  identity: number[],
  target: number[],
  intensity: number,
) => number[];

/** Round to 6-decimal precision to avoid float drift in comparisons. */
const round = (m: number[]): number[] => m.map((v) => Math.round(v * 1e6) / 1e6);

// ── Backend source parser ───────────────────────────────────────────
// The backend renderer lives in a separate package with its own tsconfig,
// so a frontend test cannot import it. Instead we read the source as text
// and parse the FILTER_PRESET_MATRICES object literal + interpolateMatrix
// function out of it, then compare against the importable sources. If a
// matrix or function cannot be located, the test FAILS loudly rather than
// silently passing.
const BACKEND_FILE = resolve(
  __dirname,
  '../../../../backend/api/src/lib/media/compositionRenderer.ts',
);

/** Extract the content between the balanced braces starting at the first
 *  `{` at or after `openIdx`. Throws if the braces are unbalanced. */
function extractBlock(src: string, openIdx: number, label: string): string {
  const braceStart = src.indexOf('{', openIdx);
  if (braceStart === -1) throw new Error(`Could not find opening brace for ${label}`);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(braceStart + 1, i);
    }
  }
  throw new Error(`Unbalanced braces while parsing ${label}`);
}

function parseBackendMatrices(src: string): Record<string, number[]> {
  const decl = src.indexOf('FILTER_PRESET_MATRICES');
  if (decl === -1) throw new Error('FILTER_PRESET_MATRICES not found in backend renderer');
  const block = extractBlock(src, decl, 'FILTER_PRESET_MATRICES');
  const out: Record<string, number[]> = {};
  for (const name of FILTER_NAMES) {
    const re = new RegExp(`\\b${name}\\s*:\\s*(IDENTITY_MATRIX|\\[[\\s\\S]*?\\])`);
    const m = block.match(re);
    if (!m) throw new Error(`Backend matrix for filter "${name}" not found`);
    if (m[1] === 'IDENTITY_MATRIX') {
      out[name] = IDENTITY;
    } else {
      const nums = m[1]
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => parseFloat(s));
      if (nums.length !== 20) {
        throw new Error(`Backend matrix for "${name}" has ${nums.length} values, expected 20`);
      }
      out[name] = nums;
    }
  }
  return out;
}

/** Parse the backend `interpolateMatrix` function body into an executable
 *  closure, injecting IDENTITY_MATRIX as a parameter. */
function parseBackendInterpolateMatrix(src: string): BackendInterpolateFn {
  const fnIdx = src.indexOf('function interpolateMatrix');
  if (fnIdx === -1) throw new Error('Backend interpolateMatrix function not found');
  const body = extractBlock(src, fnIdx, 'interpolateMatrix');
  // eslint-disable-next-line no-new-func
  return new Function('IDENTITY_MATRIX', 'target', 'intensity', body) as BackendInterpolateFn;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Cross-renderer filter matrix agreement', () => {
  const backendSrc = readFileSync(BACKEND_FILE, 'utf8');
  const backendMatrices = parseBackendMatrices(backendSrc);
  const backendInterpolate = parseBackendInterpolateMatrix(backendSrc);

  // Source-of-truth map from filterConfig.ts (the canonical FILTERS array).
  const configMatrices: Record<string, number[]> = {};
  for (const name of FILTER_NAMES) {
    const entry = FILTERS.find((f) => f.name === name);
    if (!entry || !entry.colorMatrix) {
      throw new Error(`filterConfig.ts missing colorMatrix for "${name}"`);
    }
    configMatrices[name] = entry.colorMatrix;
  }

  it.each([...FILTER_NAMES])(
    'matrix for "%s" agrees across filterConfig, JS export, and backend',
    (name) => {
      const fromConfig = configMatrices[name];
      const fromJs = JS_MATRICES[name];
      const fromBackend = backendMatrices[name];
      expect(fromJs, `JS export missing matrix for "${name}"`).toBeDefined();
      expect(fromBackend, `backend missing matrix for "${name}"`).toBeDefined();
      expect(round(fromConfig)).toEqual(round(fromJs));
      expect(round(fromConfig)).toEqual(round(fromBackend));
    },
  );

  it('interpolateMatrix agrees between JS export and backend for warm at varying intensities', () => {
    const target = backendMatrices['warm'];
    const intensities = [0, 0.25, 0.5, 0.75, 1.0];
    for (const intensity of intensities) {
      const jsResult = jsInterpolateMatrix(target, intensity);
      const backendResult = backendInterpolate(IDENTITY, target, intensity);
      expect(round(jsResult)).toEqual(round(backendResult));
    }
  });
});
