import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/*
 * Static analysis tests for premium form primitives.
 * We do NOT import React Native components into the vitest node environment
 * because expo-modules-core requires native globals that are not available.
 * Instead we verify source file structure and exports.
 */

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('PremiumTextField source', () => {
  const src = readSrc('components/ui/PremiumTextField.tsx');

  it('exports PremiumTextField', () => {
    expect(src).toContain('export const PremiumTextField');
  });

  it('supports label prop', () => {
    expect(src).toContain('label?:');
  });

  it('supports helperText prop', () => {
    expect(src).toContain('helperText?:');
  });

  it('supports errorText prop', () => {
    expect(src).toContain('errorText?:');
  });

  it('supports multiline prop', () => {
    expect(src).toContain('multiline?:');
  });

  it('supports leftIcon prop', () => {
    expect(src).toContain('leftIcon?:');
  });

  it('supports rightAction prop', () => {
    expect(src).toContain('rightAction?:');
  });

  it('uses useState for focus state', () => {
    expect(src).toContain('useState');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('PremiumSelectRow source', () => {
  const src = readSrc('components/ui/PremiumSelectRow.tsx');

  it('exports PremiumSelectRow', () => {
    expect(src).toContain('export function PremiumSelectRow');
  });

  it('supports label prop', () => {
    expect(src).toContain('label:');
  });

  it('supports value/placeholder props', () => {
    expect(src).toContain('value?:');
    expect(src).toContain('placeholder?:');
  });

  it('supports onPress prop', () => {
    expect(src).toContain('onPress?:');
  });

  it('supports disabled prop', () => {
    expect(src).toContain('disabled?:');
  });

  it('supports errorText prop', () => {
    expect(src).toContain('errorText?:');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('PremiumFormCard source', () => {
  const src = readSrc('components/ui/PremiumFormCard.tsx');

  it('exports PremiumFormCard', () => {
    expect(src).toContain('export function PremiumFormCard');
  });

  it('supports title/subtitle/action props', () => {
    expect(src).toContain('title?:');
    expect(src).toContain('subtitle?:');
    expect(src).toContain('action?:');
  });

  it('has no glass variant', () => {
    expect(src).not.toContain('glass');
    expect(src).not.toContain('Glass');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('PremiumActionFooter source', () => {
  const src = readSrc('components/ui/PremiumActionFooter.tsx');

  it('exports PremiumActionFooter', () => {
    expect(src).toContain('export function PremiumActionFooter');
  });

  it('supports primaryLabel/onPrimaryPress props', () => {
    expect(src).toContain('primaryLabel:');
    expect(src).toContain('onPrimaryPress:');
  });

  it('supports loading state', () => {
    expect(src).toContain('primaryLoading?:');
  });

  it('supports secondary CTA', () => {
    expect(src).toContain('secondaryLabel?:');
    expect(src).toContain('onSecondaryPress?:');
  });

  it('supports errorText prop', () => {
    expect(src).toContain('errorText?:');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});
