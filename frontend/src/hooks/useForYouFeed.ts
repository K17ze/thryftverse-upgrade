import React from 'react';
import { useStore } from '../store/useStore';
import { fetchJson } from '../lib/apiClient';
import { mapBackendListingToListing, isDisplayReadyListing, type BackendListingRow } from '../services/listingMapper';
import type { Listing } from '../data/mockData';

interface ForYouFeedState {
  listings: Listing[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  source: 'decision_service' | 'cache' | 'heuristic_baseline' | null;
  refresh: () => Promise<void>;
}

interface RecommendationItem {
  listing: BackendListingRow;
  score: number;
  model: string;
  policy: string;
  position: number;
  reasonCodes: string[];
  componentScores: Record<string, number>;
}

interface RecommendationsResponse {
  source: 'decision_service' | 'cache' | 'heuristic_baseline';
  decision: {
    requestId: string;
    policyVersion: string;
    capabilityLevel: string;
    trainedModel: boolean;
    generatedAt: string;
    explorationRate: number;
    coldStart: boolean;
    diagnostics: Record<string, unknown>;
  };
  items: RecommendationItem[];
}

/**
 * Fetches personalised recommendations from the backend
 * /recommendations/:userId endpoint. Falls back gracefully
 * when the user is not authenticated or the endpoint fails.
 *
 * The backend uses a heuristic baseline policy with a decision
 * service that scores candidates by quality, popularity, and
 * seller trust. When the decision service is unavailable, it
 * falls back to a heuristic ranking.
 */
export function useForYouFeed(): ForYouFeedState {
  const currentUser = useStore((s) => s.currentUser);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<ForYouFeedState['source']>(null);

  const userId = currentUser?.id ?? null;

  const loadForYouFeed = React.useCallback(
    async (isRefresh: boolean) => {
      if (!userId) {
        setListings([]);
        setSource(null);
        return;
      }

      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const payload = await fetchJson<RecommendationsResponse>(
          `/recommendations/${encodeURIComponent(userId)}?surface=home`
        );

        setSource(payload.source);

        const mapped: Listing[] = payload.items
          .map((item) => {
            const listing = mapBackendListingToListing(item.listing);
            return isDisplayReadyListing(listing) ? listing : null;
          })
          .filter((item): item is Listing => item !== null);

        setListings(mapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load recommendations';
        setError(message);
        setListings([]);
        setSource(null);
      } finally {
        if (isRefresh) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [userId]
  );

  React.useEffect(() => {
    void loadForYouFeed(false);
  }, [loadForYouFeed]);

  const refresh = React.useCallback(() => loadForYouFeed(true), [loadForYouFeed]);

  return {
    listings,
    isLoading,
    isRefreshing,
    error,
    source,
    refresh,
  };
}
