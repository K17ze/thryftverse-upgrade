/**
 * Static accessibility acceptance tests.
 * These verify that critical screen components have proper accessibility props.
 * Device-level VoiceOver/TalkBack testing is done via Maestro flows in .maestro/flows/accessibility/.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { SwipeableRow } from '../components/SwipeableRow';

// Minimal theme/haptic/motion mocks — SwipeableRow only needs color tokens,
// a haptic surface, and a spring config to render.
vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: {
      background: '#000000',
      surface: '#141414',
      surfaceAlt: '#1C1C1C',
      brand: '#2D68FF',
      danger: '#D64A4A',
      textInverse: '#FFFFFF',
      textMuted: '#999999',
    },
    isDark: true,
  }),
}));

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    warning: vi.fn(),
    patterns: { longPress: vi.fn() },
    playPattern: vi.fn(),
  }),
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../hooks/useMotionConfig', () => ({
  useMotionConfig: () => ({
    spring: { press: { damping: 20, stiffness: 300, mass: 1 } },
    isEnabled: true,
  }),
}));

describe('Accessibility acceptance — static checks', () => {
  it('Maestro flow files exist for all critical journeys', () => {
    // This test verifies that the Maestro flow files exist
    // The actual device-level testing is done via Maestro CLI
    const fs = require('fs');
    const path = require('path');
    const flowsDir = path.join(__dirname, '..', '..', '.maestro', 'flows', 'accessibility');

    const expectedFlows = [
      'auth-voiceover.yaml',
      'browse-talkback.yaml',
      'pdp-voiceover.yaml',
      'checkout-talkback.yaml',
      'chat-voiceover.yaml',
    ];

    for (const flow of expectedFlows) {
      const flowPath = path.join(flowsDir, flow);
      expect(fs.existsSync(flowPath)).toBe(true);
    }
  });

  it('Maestro README exists', () => {
    const fs = require('fs');
    const path = require('path');
    const readmePath = path.join(__dirname, '..', '..', '.maestro', 'flows', 'accessibility', 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
  });
});

describe('SwipeableRow — accessibility actions', () => {
  function renderRow(props: Partial<React.ComponentProps<typeof SwipeableRow>> = {}) {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SwipeableRow
          accessibilityLabel="Layer Text block"
          onPress={vi.fn()}
          onLongPress={vi.fn()}
          longPressActionLabel="Reorder layer"
          leftAction={{ icon: 'lock-closed', label: 'Lock', onPress: vi.fn() }}
          rightAction={{ icon: 'trash-outline', label: 'Delete', onPress: vi.fn() }}
          {...props}
        >
          <React.Fragment />
        </SwipeableRow>
      );
    });
    const row = renderer.root.find(
      (node: any) => Array.isArray(node.props.accessibilityActions)
    );
    return { renderer, row };
  }

  it('exposes activate, longpress, leading and trailing actions', () => {
    const { row } = renderRow();
    const names = row.props.accessibilityActions.map((a: any) => a.name);
    expect(names).toEqual(['activate', 'longpress', 'leadingAction', 'trailingAction']);

    const byName = Object.fromEntries(
      row.props.accessibilityActions.map((a: any) => [a.name, a.label])
    );
    expect(byName.longpress).toBe('Reorder layer');
    expect(byName.leadingAction).toBe('Lock');
    expect(byName.trailingAction).toBe('Delete');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityRole).toBe('button');
  });

  it('dispatches each accessibility action to the right handler', () => {
    const onPress = vi.fn();
    const onLongPress = vi.fn();
    const onLock = vi.fn();
    const onDelete = vi.fn();
    const { row } = renderRow({
      onPress,
      onLongPress,
      leftAction: { icon: 'lock-closed', label: 'Lock', onPress: onLock },
      rightAction: { icon: 'trash-outline', label: 'Delete', onPress: onDelete },
    });

    const fire = (actionName: string) =>
      row.props.onAccessibilityAction({ nativeEvent: { actionName } });

    fire('activate');
    fire('longpress');
    fire('leadingAction');
    fire('trailingAction');

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('omits activate/longpress when the row has no tap or long-press handler', () => {
    // Guards the audit finding: an `accessible` row whose hint promises
    // "double tap" must back it with a real `activate` action.
    const { row } = renderRow({ onPress: undefined, onLongPress: undefined });
    const names = row.props.accessibilityActions.map((a: any) => a.name);
    expect(names).toEqual(['leadingAction', 'trailingAction']);
    expect(names).not.toContain('activate');
    expect(names).not.toContain('longpress');
  });
});
