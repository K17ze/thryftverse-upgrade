import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_RECENT_SEARCHES = 8;
const STORAGE_KEY = (userId: string) => `@thryftverse_recent_searches:${userId}`;

export interface RecentSearchEntry {
  query: string;
  searchedAt: number;
}

/**
 * Load recent searches for a user (or guest). Returns newest-first.
 * This is the single source of truth for recent search history —
 * replaces both the AsyncStorage calls in SearchScreen/UnifiedDiscoveryScreen
 * and the in-memory store in searchAutocompleteApi.
 */
export async function loadRecentSearches(userId?: string): Promise<RecentSearchEntry[]> {
  const key = STORAGE_KEY(userId ?? 'guest');
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Support both legacy string[] and new RecentSearchEntry[] formats
    return parsed.map((item: unknown) => {
      if (typeof item === 'string') {
        return { query: item, searchedAt: 0 };
      }
      if (item && typeof item === 'object' && 'query' in item) {
        const obj = item as Record<string, unknown>;
        return { query: String(obj.query), searchedAt: Number(obj.searchedAt ?? 0) };
      }
      return null;
    }).filter((item: RecentSearchEntry | null): item is RecentSearchEntry => item !== null);
  } catch {
    return [];
  }
}

/**
 * Record a search query. Deduplicates by query text, moves to front,
 * trims to MAX_RECENT_SEARCHES. Returns the updated list.
 */
export async function recordRecentSearch(query: string, userId?: string): Promise<RecentSearchEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const existing = await loadRecentSearches(userId);
  const filtered = existing.filter((s) => s.query !== trimmed);
  const updated = [{ query: trimmed, searchedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  const key = STORAGE_KEY(userId ?? 'guest');
  try {
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // Best-effort persistence
  }
  return updated;
}

/**
 * Clear all recent searches for a user.
 */
export async function clearRecentSearches(userId?: string): Promise<void> {
  const key = STORAGE_KEY(userId ?? 'guest');
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Get recent search query strings (for backward compatibility with
 * components that expect string[] instead of RecentSearchEntry[]).
 */
export async function loadRecentSearchStrings(userId?: string): Promise<string[]> {
  const entries = await loadRecentSearches(userId);
  return entries.map((e) => e.query);
}
