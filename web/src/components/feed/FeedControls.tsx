'use client';

/**
 * FeedControls — the feed-control context for a feed surface.
 *
 * Wrap a feed and every ProductTile inside it gains the overflow menu
 * ("Not interested" / "Show less like this" / "Why am I seeing this?")
 * plus the mounted explanation sheet. Outside this provider ProductTile
 * renders unchanged — the context is null and no menu is offered.
 *
 * Port of the mobile feed-controls loop (UnifiedDiscoveryScreen +
 * FeedExplanationSheet): the choice is applied locally at once and the
 * durable write reports persisted/session-local honestly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { useToast } from '@/components/ui/Toast';
import {
  useFeedActions,
  type FeedSource,
  type ServeItemMeta,
} from '@/lib/hooks/feed-queries';
import {
  confirmRecommendationImpressions,
  type FeedbackAttribution,
  type FeedControlResult,
} from '@/lib/api/services/recommendations';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useFeedPrefs,
  type NotInterestedReason,
} from '@/lib/feedPrefs';
import { FeedExplanationSheet } from './FeedExplanationSheet';
import { NotInterestedReasonSheet } from './NotInterestedReasonSheet';

export interface FeedControlsValue {
  feedSource: FeedSource;
  /** Serve attribution for a listing when it came from the ranked serve. */
  attributionFor: (listingId: string) => FeedbackAttribution | undefined;
  metaFor: (listingId: string) => ServeItemMeta | undefined;
  notInterested: (listing: DiscoveryListingSummary) => void;
  showFewer: (listing: DiscoveryListingSummary) => void;
  explain: (listing: DiscoveryListingSummary) => void;
}

const FeedControlsContext = createContext<FeedControlsValue | null>(null);

/** Null outside a feed surface — tiles must render without the menu. */
export function useFeedControls(): FeedControlsValue | null {
  return useContext(FeedControlsContext);
}

interface FeedControlsProviderProps {
  source: FeedSource;
  metaByListing?: Record<string, ServeItemMeta>;
  requestId?: string | null;
  policyVersion?: string | null;
  serveMode?: string | null;
  surface?: string;
  children: React.ReactNode;
}

export function FeedControlsProvider({
  source,
  metaByListing,
  requestId,
  policyVersion,
  serveMode,
  surface = 'home_feed',
  children,
}: FeedControlsProviderProps) {
  const { show } = useToast();
  const { user } = useSession();
  const actions = useFeedActions();
  const hideListing = useFeedPrefs((s) => s.hideListing);
  const unhideListing = useFeedPrefs((s) => s.unhideListing);
  const applyNotInterestedReason = useFeedPrefs((s) => s.applyNotInterestedReason);
  const [explained, setExplained] = useState<DiscoveryListingSummary | null>(null);
  /** The listing hidden by "Not interested" awaiting its reason — the
   *  durable write is deferred until the sheet resolves (reason, skip,
   *  dismiss) or the provider unmounts, so Undo before commit is exact
   *  (mobile's undo-window semantics, without the timer). */
  const [reasonFor, setReasonFor] = useState<DiscoveryListingSummary | null>(null);
  const pendingHide = useRef<{
    listing: DiscoveryListingSummary;
    attribution?: FeedbackAttribution;
  } | null>(null);

  const attributionFor = useCallback(
    (listingId: string): FeedbackAttribution | undefined => {
      const meta = metaByListing?.[listingId];
      if (!meta) return undefined;
      return {
        surface,
        requestId: requestId ?? undefined,
        position: meta.position,
        model: meta.model || undefined,
        policyVersion: policyVersion ?? undefined,
      };
    },
    [metaByListing, requestId, policyVersion, surface],
  );

  const metaFor = useCallback(
    (listingId: string) => metaByListing?.[listingId],
    [metaByListing],
  );

  // Client-confirmed exposure — the serve only counts as an impression once
  // the cells actually rendered. 'rendered' status is literal truth here;
  // viewability upgrades are a later iteration (mobile tracks per-cell).
  const confirmedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (source !== 'recommendations' || !requestId) return;
    if (confirmedRef.current.has(requestId)) return;
    const ids = Object.keys(metaByListing ?? {});
    if (ids.length === 0) return;
    confirmedRef.current.add(requestId);
    void confirmRecommendationImpressions(
      requestId,
      ids.map((listingId) => ({ listingId, status: 'rendered' as const })),
    );
  }, [source, requestId, metaByListing]);

  /** Commit the deferred hide: local hide is already applied; the durable
   *  write fires now with the reason (when given) and the honest outcome
   *  toasts with Undo — the same copy ladder the old immediate write used. */
  const commitNotInterested = useCallback(
    (reason?: NotInterestedReason) => {
      const pending = pendingHide.current;
      pendingHide.current = null;
      setReasonFor(null);
      if (!pending) return;
      const { listing, attribution } = pending;
      if (reason) applyNotInterestedReason(listing, reason);
      void actions
        .notInterested(listing, attribution, reason)
        .then((result: FeedControlResult) => {
          const message = result.persisted
            ? reason
              ? 'Got it — we’ll show fewer like this'
              : 'Got it — we won’t show this again'
            : result.failure === 'fixture_mode'
              ? 'Hidden on this device'
              : result.failure === 'anonymous'
                ? 'Hidden for now — sign in to keep the preference'
                : 'Hidden for now — couldn’t save that';
          show(message, result.persisted ? 'success' : 'info', {
            label: 'Undo',
            onPress: () => void actions.undoNotInterested(listing),
          });
        });
    },
    [actions, applyNotInterestedReason, show],
  );

  const notInterested = useCallback(
    (listing: DiscoveryListingSummary) => {
      // Instant local hide, then the optional reason follow-up — the
      // durable write waits for the sheet's answer (or its dismissal).
      hideListing(listing.id);
      pendingHide.current = {
        listing,
        attribution: attributionFor(listing.id),
      };
      setReasonFor(listing);
    },
    [attributionFor, hideListing],
  );

  /** Pre-commit undo: nothing durable has landed, so the local unhide is
   *  an exact reversal — no compensating write needed. */
  const undoPendingHide = useCallback(() => {
    const pending = pendingHide.current;
    pendingHide.current = null;
    setReasonFor(null);
    if (pending) unhideListing(pending.listing.id);
  }, [unhideListing]);

  // Flush on unmount — an explicit choice must still reach the backend
  // when the surface closes while the reason sheet is open (mobile's
  // unmount flush for queued hides). No reason, no toast: the provider
  // is gone.
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
  useEffect(
    () => () => {
      const pending = pendingHide.current;
      pendingHide.current = null;
      if (pending) {
        void actionsRef.current.notInterested(pending.listing, pending.attribution);
      }
    },
    [],
  );

  const showFewer = useCallback(
    (listing: DiscoveryListingSummary) => {
      void actions
        .showFewer(listing, attributionFor(listing.id))
        .then((result) => {
          const message = result.persisted
            ? 'We’ll show you less like this'
            : result.failure === 'fixture_mode'
              ? 'We’ll show you less like this on this device'
              : result.failure === 'anonymous'
                ? 'Noted for this session — sign in to keep it'
                : 'Couldn’t save that preference';
          show(message, result.persisted ? 'success' : 'info');
        });
    },
    [actions, attributionFor, show],
  );

  const explain = useCallback((listing: DiscoveryListingSummary) => {
    setExplained(listing);
  }, []);

  /** Topic-level tunes ("See more like this", "Remove this topic") are
   *  durable intent-ledger writes — they only exist when a signed-in live
   *  session can persist them. Fixture/guest sessions keep the two local
   *  controls that genuinely work; no fake controls render. */
  const canTuneTopics = DATA_MODE === 'live' && user != null;

  const seeMore = useCallback(
    (listing: DiscoveryListingSummary) => {
      void actions.seeMore(listing).then((result) => {
        const message = result.persisted
          ? 'We’ll show you more like this'
          : result.failure === 'fixture_mode'
            ? 'Noted on this device'
            : result.failure === 'anonymous'
              ? 'Noted for this session — sign in to keep it'
              : 'Couldn’t save that preference';
        show(message, result.persisted ? 'success' : 'info');
      });
    },
    [actions, show],
  );

  const removeTopic = useCallback(
    (listing: DiscoveryListingSummary) => {
      const topic =
        listing.category?.trim() || listing.brand?.trim() || 'this topic';
      void actions.removeTopic(listing).then((result) => {
        const message = result.persisted
          ? `Removed “${topic}” — it won’t shape your feed`
          : result.failure === 'fixture_mode'
            ? `We’ll show less “${topic}” on this device`
            : result.failure === 'anonymous'
              ? 'Noted for this session — sign in to keep it'
              : 'Couldn’t save that preference';
        show(message, result.persisted ? 'success' : 'info');
      });
    },
    [actions, show],
  );

  const value = useMemo<FeedControlsValue>(
    () => ({
      feedSource: source,
      attributionFor,
      metaFor,
      notInterested,
      showFewer,
      explain,
    }),
    [source, attributionFor, metaFor, notInterested, showFewer, explain],
  );

  return (
    <FeedControlsContext.Provider value={value}>
      {children}
      <FeedExplanationSheet
        open={explained !== null}
        onClose={() => setExplained(null)}
        listing={explained}
        meta={explained ? metaFor(explained.id) : undefined}
        feedSource={source}
        serveMode={serveMode}
        onShowLess={(listing) => {
          showFewer(listing);
          setExplained(null);
        }}
        onNotInterested={(listing) => {
          notInterested(listing);
          setExplained(null);
        }}
        onSeeMore={
          canTuneTopics
            ? (listing) => {
                seeMore(listing);
                setExplained(null);
              }
            : undefined
        }
        onRemoveTopic={
          canTuneTopics
            ? (listing) => {
                removeTopic(listing);
                setExplained(null);
              }
            : undefined
        }
      />
      <NotInterestedReasonSheet
        open={reasonFor !== null}
        listing={reasonFor}
        onPick={commitNotInterested}
        onSkip={() => commitNotInterested()}
        onUndo={undoPendingHide}
      />
    </FeedControlsContext.Provider>
  );
}
