import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Pressable } from 'react-native';

// Sentinel colors so assertions pin the exact token used per role.
const sentinel = {
  danger: '#DANGER_FILL',
  dangerText: '#DANGER_FG',
  textInverse: '#INVERSE',
  brand: '#BRAND',
  textPrimary: '#TP',
  textMuted: '#TM',
  borderSubtle: '#BS',
  surface: '#SURF',
};

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: sentinel }),
}));
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({ warning: vi.fn(), error: vi.fn(), impact: vi.fn(), selection: vi.fn(), success: vi.fn() }),
}));
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

import { CreatorDestructiveButton } from '../creator/controls/CreatorDestructiveButton';

function render(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(element); });
  return tree;
}

function resolvedStyle(instance: TestRenderer.ReactTestInstance) {
  const flat = (s: any): Record<string, any> =>
    Array.isArray(s) ? s.reduce((acc, cur) => ({ ...acc, ...flat(cur) }), {}) : (s ?? {});
  return flat(instance.props.style);
}

function buttonView(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByType('ReanimatedView' as any);
}

describe('CreatorDestructiveButton danger token roles', () => {
  it('resting state uses dangerText foreground on transparent fill', () => {
    const tree = render(<CreatorDestructiveButton label="Delete" />);
    const style = resolvedStyle(buttonView(tree));
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe(sentinel.dangerText);
    const label = tree.root.findByType('ReanimatedText' as any);
    expect(resolvedStyle(label).color).toBe(sentinel.dangerText);
  });

  it('confirming state fills with danger, keeps dangerText border, inverse label', () => {
    const tree = render(<CreatorDestructiveButton label="Delete" />);
    act(() => { tree.root.findByType(Pressable).props.onPress(); });
    const style = resolvedStyle(buttonView(tree));
    expect(style.backgroundColor).toBe(sentinel.danger);
    expect(style.borderColor).toBe(sentinel.dangerText);
    const label = tree.root.findByType('ReanimatedText' as any);
    expect(resolvedStyle(label).color).toBe(sentinel.textInverse);
  });

  it('second press confirms and invokes onPress', () => {
    const onPress = vi.fn();
    const tree = render(<CreatorDestructiveButton label="Delete" onPress={onPress} />);
    const pressable = () => tree.root.findByType(Pressable);
    act(() => { pressable().props.onPress(); });
    act(() => { pressable().props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
