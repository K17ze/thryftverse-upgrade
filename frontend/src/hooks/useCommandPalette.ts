/**
 * useCommandPalette — global command palette visibility + recent-screen tracking.
 *
 * A small, dedicated Zustand store keeps command-palette UI state decoupled from
 * the main app store. Recent screens are persisted to AsyncStorage so the
 * "Recent" section survives restarts. Recent searches are read from the existing
 * AsyncStorage key used by UnifiedDiscoveryScreen (`@thryftverse_recent_searches`)
 * so the palette reflects what the user actually searched.
 */
import { useEffect, useState, useCallback } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRecentSearchStrings } from '../services/searchHistory';

// ---------------------------------------------------------------------------
// Store — palette visibility
// ---------------------------------------------------------------------------
interface CommandPaletteState {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  toggle: () => set((s) => ({ visible: !s.visible })),
}));

// ---------------------------------------------------------------------------
// AsyncStorage keys
// ---------------------------------------------------------------------------
const RECENT_SCREENS_KEY = '@thryftverse_recent_screens';
const RECENT_COMMANDS_KEY = '@thryftverse_recent_commands';
const MAX_RECENT_SCREENS = 8;
const MAX_RECENT_COMMANDS = 5;

export interface RecentScreenEntry {
  name: string;
  title: string;
  visitedAt: number;
}

// ---------------------------------------------------------------------------
// Recent-screen persistence helpers
// ---------------------------------------------------------------------------

/** Read the persisted recent-screen list (newest first). */
export async function loadRecentScreens(): Promise<RecentScreenEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SCREENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as RecentScreenEntry[];
    return [];
  } catch {
    return [];
  }
}

/** Write the recent-screen list to AsyncStorage. */
async function persistRecentScreens(screens: RecentScreenEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_SCREENS_KEY, JSON.stringify(screens));
  } catch {
    // Best-effort persistence — never block navigation.
  }
}

/**
 * Register a screen visit. Deduplicates by screen name, moves the entry to the
 * front, and trims to MAX_RECENT_SCREENS. Safe to call on every screen focus.
 */
export async function registerRecentScreen(name: string, title: string): Promise<void> {
  const existing = await loadRecentScreens();
  const filtered = existing.filter((s) => s.name !== name);
  const updated = [{ name, title, visitedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT_SCREENS);
  await persistRecentScreens(updated);
}

/** Clear the recent-screen history. */
export async function clearRecentScreens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_SCREENS_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Recent-command persistence helpers (Linear-style "recent commands")
// ---------------------------------------------------------------------------

/** Read the persisted recent-command id list (newest first). */
export async function loadRecentCommands(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    return [];
  }
}

async function persistRecentCommands(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort persistence — never block execution.
  }
}

/**
 * Record a command execution. Deduplicates by command id, moves the entry to
 * the front, and trims to MAX_RECENT_COMMANDS. Returns the updated list so
 * callers can update local state without an extra read.
 */
export async function recordRecentCommand(commandId: string): Promise<string[]> {
  const existing = await loadRecentCommands();
  const filtered = existing.filter((id) => id !== commandId);
  const updated = [commandId, ...filtered].slice(0, MAX_RECENT_COMMANDS);
  await persistRecentCommands(updated);
  return updated;
}

/** Clear the recent-command history. */
export async function clearRecentCommands(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_COMMANDS_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Recent-search read helper (delegates to the unified search history service)
// ---------------------------------------------------------------------------

/** Read the persisted recent-search query list (newest first). */
export async function loadRecentSearches(): Promise<string[]> {
  return loadRecentSearchStrings();
}

// ---------------------------------------------------------------------------
// Hook — convenience accessors
// ---------------------------------------------------------------------------

/**
 * Convenience hook: subscribes to palette visibility and exposes open/close.
 * Also exposes the current recent-screens list (loaded once on mount and
 * refreshed whenever the palette opens, so the "Recent" section is fresh).
 */
export function useCommandPalette() {
  const visible = useCommandPaletteStore((s) => s.visible);
  const open = useCommandPaletteStore((s) => s.open);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const [recentScreens, setRecentScreens] = useState<RecentScreenEntry[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);

  // Refresh recent data whenever the palette becomes visible so the list is
  // always current without re-reading AsyncStorage on every render.
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void (async () => {
      const [screens, searches, commands] = await Promise.all([
        loadRecentScreens(),
        loadRecentSearches(),
        loadRecentCommands(),
      ]);
      if (mounted) {
        setRecentScreens(screens);
        setRecentSearches(searches);
        setRecentCommands(commands);
      }
    })();
    return () => { mounted = false; };
  }, [visible]);

  const refresh = useCallback(() => {
    void (async () => {
      const [screens, searches, commands] = await Promise.all([
        loadRecentScreens(),
        loadRecentSearches(),
        loadRecentCommands(),
      ]);
      setRecentScreens(screens);
      setRecentSearches(searches);
      setRecentCommands(commands);
    })();
  }, []);

  /**
   * Record a command execution. Persists to AsyncStorage (keeping the last
   * MAX_RECENT_COMMANDS) and updates local state so the "Recent" section
   * reflects the new order immediately.
   */
  const recordCommand = useCallback(async (commandId: string) => {
    const updated = await recordRecentCommand(commandId);
    setRecentCommands(updated);
  }, []);

  return {
    visible,
    open,
    close,
    toggle,
    recentScreens,
    recentSearches,
    recentCommands,
    recordCommand,
    refresh,
  };
}
