import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchPosterStories, type PosterStory } from '../services/postersApi';

/**
 * Shared data source for the poster-story rail rendered by Home and Inbox
 * (HomeStoryRail). Fetches active stories on screen focus — which covers
 * the initial mount — so newly published stories and seen-state changes
 * picked up in PosterViewer are reflected when the user returns.
 *
 * Failures are silent: stories are an enrichment rail, so a failed fetch
 * simply renders no rail rather than an error surface.
 */
export function usePosterStories() {
  const [posters, setPosters] = useState<PosterStory[]>([]);
  const [postersLoading, setPostersLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setPostersLoading(true);
    fetchPosterStories({ active: true, limit: 20 })
      .then((res) => {
        if (mountedRef.current) setPosters(res.items);
      })
      .catch(() => { /* optional enrichment — the rail hides on failure */ })
      .finally(() => {
        if (mountedRef.current) setPostersLoading(false);
      });
  }, []);

  // Refetch on every focus — covers the initial mount and returns from
  // PosterViewer/creator flows where stories are published or marked seen.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { posters, postersLoading, refresh };
}
