import { fetchJson } from '../lib/apiClient';

export interface FeedLook {
  id: string;
  creator: { id: string; name: string; avatar: string; isVerified?: boolean };
  title: string;
  description: string;
  coverImage: string;
  items: { id: string; label: string }[];
  likes: number;
  comments: number;
  timeAgo: string;
}

interface RankedFeedLook extends FeedLook {
  rank: number;
}

interface FeedLooksApiResponse {
  items: RankedFeedLook[];
}

const FALLBACK_RANKED_LOOKS: RankedFeedLook[] = [];

function toStableRankedLooks(items: RankedFeedLook[]) {
  return [...items].sort((a, b) => {
    const rankA = Number.isFinite(a.rank) ? a.rank : Number.MAX_SAFE_INTEGER;
    const rankB = Number.isFinite(b.rank) ? b.rank : Number.MAX_SAFE_INTEGER;

    if (rankA === rankB) {
      return a.id.localeCompare(b.id);
    }

    return rankA - rankB;
  });
}

function stripRank(items: RankedFeedLook[]): FeedLook[] {
  return items.map(({ rank: _rank, ...look }) => look);
}

export const DEFAULT_FEED_LOOKS: FeedLook[] = stripRank(toStableRankedLooks(FALLBACK_RANKED_LOOKS));

export async function fetchFeedLooksWithFallback(): Promise<{
  looks: FeedLook[];
  source: 'api' | 'stub';
  error?: string;
}> {
  try {
    const payload = await fetchJson<FeedLooksApiResponse>('/feed/looks');
    const rows = Array.isArray(payload.items) ? payload.items : [];

    if (rows.length === 0) {
      return {
        looks: [],
        source: 'api',
        error: 'API returned zero feed looks.',
      };
    }

    return {
      looks: stripRank(toStableRankedLooks(rows)),
      source: 'api',
    };
  } catch (error) {
    return {
      looks: [],
      source: 'api',
      error: (error as Error).message,
    };
  }
}