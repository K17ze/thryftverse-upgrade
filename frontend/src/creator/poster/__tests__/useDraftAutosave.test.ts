import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { useDraftAutosave } from '../useDraftAutosave';
import type { CreatorDocument } from '../../composition';

// ── Minimal renderHook (mirrors src/hooks/useInfiniteList.test.ts) ──
function renderHook<TResult, TProps>(
  render: (props: TProps) => TResult,
  initialProps: TProps,
) {
  const result = { current: undefined as unknown as TResult };

  function TestComponent({ hookProps }: { hookProps: TProps }) {
    result.current = render(hookProps);
    return null;
  }

  let testRenderer: TestRenderer.ReactTestRenderer;
  act(() => {
    testRenderer = TestRenderer.create(
      React.createElement(TestComponent, { hookProps: initialProps }),
    );
  });

  return {
    result,
    rerender: (newProps: TProps) => {
      act(() => {
        testRenderer.update(
          React.createElement(TestComponent, { hookProps: newProps }),
        );
      });
    },
    unmount: () => {
      act(() => {
        testRenderer.unmount();
      });
    },
  };
}

// ── Fixtures ────────────────────────────────────────────────────────
function makeDocument(id: string): CreatorDocument {
  return {
    id,
    type: 'poster',
    pages: [],
    canvas: { aspectRatio: 9 / 16 },
    metadata: {},
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as unknown as CreatorDocument;
}

describe('useDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not call saveDraft immediately when dirty', () => {
    const saveDraft = vi.fn(() => Promise.resolve());
    renderHook(
      ({ isDirty, document }) =>
        useDraftAutosave({ isDirty, document, saveDraft }),
      { isDirty: true, document: makeDocument('doc-1') },
    );

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('calls saveDraft once after the debounce window elapses', async () => {
    const saveDraft = vi.fn(() => Promise.resolve());
    renderHook(
      ({ isDirty, document }) =>
        useDraftAutosave({ isDirty, document, saveDraft }),
      { isDirty: true, document: makeDocument('doc-1') },
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('resets the timer when the document changes mid-debounce (saves once, not twice)', async () => {
    const saveDraft = vi.fn(() => Promise.resolve());
    const { rerender } = renderHook(
      ({ isDirty, document }) =>
        useDraftAutosave({ isDirty, document, saveDraft }),
      { isDirty: true, document: makeDocument('doc-1') },
    );

    // Halfway through the debounce, the document changes (new edit storm).
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    rerender({ isDirty: true, document: makeDocument('doc-2') });

    // Advance the remainder of the NEW debounce window.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('never calls saveDraft when the document is not dirty', async () => {
    const saveDraft = vi.fn(() => Promise.resolve());
    renderHook(
      ({ isDirty, document }) =>
        useDraftAutosave({ isDirty, document, saveDraft }),
      { isDirty: false, document: makeDocument('doc-1') },
    );

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('swallows saveDraft rejections and logs a warning instead of throwing', async () => {
    const saveDraft = vi.fn(() => Promise.reject(new Error('storage down')));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(
      ({ isDirty, document }) =>
        useDraftAutosave({ isDirty, document, saveDraft }),
      { isDirty: true, document: makeDocument('doc-1') },
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    // The hook must not throw and must clear the autosaving flag.
    expect(result.current.isAutosaving).toBe(false);
  });
});
