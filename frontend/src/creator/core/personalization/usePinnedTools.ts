/**
 * usePinnedTools — React binding for {@link ToolPersonalization}.
 *
 * Loads pinned + recent tool state on mount and exposes synchronous-looking
 * mutators that persist to AsyncStorage and then mirror the result into state.
 * The hook keeps a single {@link ToolPersonalization} instance stable across
 * renders so concurrent mutations don't clobber each other through stale
 * reads.
 *
 * Consumers (the context tool rail) use `pinned` to render a persistent
 * shortcut row and `recent` to surface recently used tools in the overflow.
 * `isPinned` is synchronous against the in-memory snapshot so render-time
 * checks don't need to await.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolPersonalization } from './ToolPersonalization';
import type { PinnedTool, RecentTool } from './ToolPersonalization';

export interface UsePinnedToolsResult {
  pinned: PinnedTool[];
  recent: RecentTool[];
  pinTool: (toolId: string) => Promise<void>;
  unpinTool: (toolId: string) => Promise<void>;
  togglePin: (toolId: string) => Promise<void>;
  recordUse: (toolId: string) => Promise<void>;
  isPinned: (toolId: string) => boolean;
  loading: boolean;
}

export function usePinnedTools(): UsePinnedToolsResult {
  const managerRef = useRef<ToolPersonalization | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new ToolPersonalization();
  }
  const manager = managerRef.current;

  const [pinned, setPinned] = useState<PinnedTool[]>([]);
  const [recent, setRecent] = useState<RecentTool[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial load.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await manager.loadData();
      if (!mounted) return;
      setPinned(data.pinned);
      setRecent(data.recent);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [manager]);

  // After any mutation, reload the canonical record so the in-memory
  // snapshot always reflects what was persisted (handles cap eviction and
  // concurrent callers correctly).
  const refresh = useCallback(async () => {
    const data = await manager.loadData();
    setPinned(data.pinned);
    setRecent(data.recent);
  }, [manager]);

  const pinTool = useCallback(
    async (toolId: string) => {
      await manager.pinTool(toolId);
      await refresh();
    },
    [manager, refresh],
  );

  const unpinTool = useCallback(
    async (toolId: string) => {
      await manager.unpinTool(toolId);
      await refresh();
    },
    [manager, refresh],
  );

  const togglePin = useCallback(
    async (toolId: string) => {
      const already = await manager.isPinned(toolId);
      if (already) {
        await manager.unpinTool(toolId);
      } else {
        await manager.pinTool(toolId);
      }
      await refresh();
    },
    [manager, refresh],
  );

  const recordUse = useCallback(
    async (toolId: string) => {
      await manager.recordToolUse(toolId);
      await refresh();
    },
    [manager, refresh],
  );

  // Synchronous check against the current snapshot — safe to call during
  // render without an await.
  const isPinned = useCallback((toolId: string) => pinned.some((p) => p.toolId === toolId), [pinned]);

  return {
    pinned,
    recent,
    pinTool,
    unpinTool,
    togglePin,
    recordUse,
    isPinned,
    loading,
  };
}
