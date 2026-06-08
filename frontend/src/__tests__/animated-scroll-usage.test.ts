import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';

const SCRIPT_PATH = resolve(__dirname, '../../scripts/check-animated-scroll-usage.mjs');

describe('animated scroll usage check', () => {
  it('passes on current repo with no violations', () => {
    const output = execSync(`node "${SCRIPT_PATH}"`, { encoding: 'utf-8', cwd: resolve(__dirname, '../..') });
    expect(output).toContain('passed');
    expect(output).toContain('no violations');
  });
});
