/**
 * ToolPersonalization — per-user pinning and recency state for the creator
 * tool rail.
 *
 * The context-sensitive tool rail (see core/toolRegistry.ts) resolves which
 * tools are *available* for a given selection/mode. This module layers on top
 * of that resolution a personalization memory: which tools the user has pinned
 * for one-tap access, and which tools they have used most recently.
 *
 * Persistence uses AsyncStorage so personalization survives app restarts and
 * is scoped per-device. The storage key is namespaced under `thryftverse.` so
 * it does not collide with other persisted creator state (project store,
 * upload jobs).
 *
 * Design references:
 *   - AGENTS.md §11: every visible control must perform a truthful action —
 *     pinned tools are a real shortcut to a real tool, not decoration.
 *   - AGENTS.md §27.9: haptic grammar is applied by the consuming rail, not
 *     here; this module is pure data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Public types ─────────────────────────────────────────────────────

/** A tool the user has pinned for persistent one-tap access. */
export interface PinnedTool {
  toolId: string;
  /** ISO timestamp of when the pin was created. */
  pinnedAt: string;
}

/** A tool the user has used recently, with a running use count. */
export interface RecentTool {
  toolId: string;
  /** ISO timestamp of the most recent invocation. */
  lastUsedAt: string;
  /** Number of times the tool has been invoked (capped by maxRecent window). */
  useCount: number;
}

/** Complete personalization record persisted to AsyncStorage. */
export interface ToolPersonalizationData {
  pinned: PinnedTool[];
  recent: RecentTool[];
  /** Maximum number of pinned tools retained. Default 4. */
  maxPinned: number;
  /** Maximum number of recent tools retained. Default 8. */
  maxRecent: number;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_STORAGE_KEY = 'thryftverse.creator.toolPersonalization';
const DEFAULT_MAX_PINNED = 4;
const DEFAULT_MAX_RECENT = 8;

function emptyData(maxPinned = DEFAULT_MAX_PINNED, maxRecent = DEFAULT_MAX_RECENT): ToolPersonalizationData {
  return { pinned: [], recent: [], maxPinned, maxRecent };
}

// ── Manager ──────────────────────────────────────────────────────────

/**
 * Owns the read/write lifecycle for {@link ToolPersonalizationData}.
 *
 * Methods are async because AsyncStorage is async; callers (typically the
 * {@link usePinnedTools} hook) await them and mirror the result into React
 * state. All mutations are normalised against the configured caps before
 * being persisted, so the on-disk record is always internally consistent.
 */
export class ToolPersonalization {
  private storageKey: string;

  constructor(storageKey: string = DEFAULT_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  /** Loads the persisted record, or an empty record when none exists. */
  async loadData(): Promise<ToolPersonalizationData> {
    try {
      const raw = await AsyncStorage.getItem(this.storageKey);
      if (!raw) return emptyData();
      const parsed = JSON.parse(raw) as Partial<ToolPersonalizationData>;
      return {
        pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
        recent: Array.isArray(parsed.recent) ? parsed.recent : [],
        maxPinned: typeof parsed.maxPinned === 'number' ? parsed.maxPinned : DEFAULT_MAX_PINNED,
        maxRecent: typeof parsed.maxRecent === 'number' ? parsed.maxRecent : DEFAULT_MAX_RECENT,
      };
    } catch {
      // Corrupt or unreadable record — start clean rather than crash.
      return emptyData();
    }
  }

  /** Persists a full record. */
  async saveData(data: ToolPersonalizationData): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      // Storage failures are non-fatal for personalization; the rail still
      // works with in-memory state for the session.
    }
  }

  /**
   * Pins a tool. If the tool is already pinned this is a no-op. If pinning
   * would exceed `maxPinned`, the oldest pin (by `pinnedAt`) is evicted so
   * the cap is never exceeded.
   */
  async pinTool(toolId: string): Promise<void> {
    const data = await this.loadData();
    if (data.pinned.some((p) => p.toolId === toolId)) return;
    const next: PinnedTool[] = [...data.pinned, { toolId, pinnedAt: new Date().toISOString() }];
    // Evict oldest first when over cap.
    while (next.length > data.maxPinned) {
      next.shift();
    }
    await this.saveData({ ...data, pinned: next });
  }

  /** Removes a pin. No-op when the tool was not pinned. */
  async unpinTool(toolId: string): Promise<void> {
    const data = await this.loadData();
    if (!data.pinned.some((p) => p.toolId === toolId)) return;
    await this.saveData({ ...data, pinned: data.pinned.filter((p) => p.toolId !== toolId) });
  }

  /**
   * Records a tool invocation: bumps its use count, refreshes `lastUsedAt`,
   * and trims the recent list to `maxRecent` (keeping the most recently used).
   */
  async recordToolUse(toolId: string): Promise<void> {
    const data = await this.loadData();
    const now = new Date().toISOString();
    const existing = data.recent.find((r) => r.toolId === toolId);
    let recent: RecentTool[];
    if (existing) {
      recent = data.recent.map((r) =>
        r.toolId === toolId ? { ...r, lastUsedAt: now, useCount: r.useCount + 1 } : r,
      );
    } else {
      recent = [...data.recent, { toolId, lastUsedAt: now, useCount: 1 }];
    }
    // Sort by recency and cap.
    recent.sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1));
    recent = recent.slice(0, data.maxRecent);
    await this.saveData({ ...data, recent });
  }

  /** Returns the pinned list (most-recently-pinned last). */
  async getPinned(): Promise<PinnedTool[]> {
    return (await this.loadData()).pinned;
  }

  /** Returns the recent list (most-recently-used first). */
  async getRecent(): Promise<RecentTool[]> {
    return (await this.loadData()).recent;
  }

  /** True when the tool is currently pinned. */
  async isPinned(toolId: string): Promise<boolean> {
    return (await this.loadData()).pinned.some((p) => p.toolId === toolId);
  }
}
