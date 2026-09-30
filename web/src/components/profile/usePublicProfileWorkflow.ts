import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useReviews, useReviewSummary } from '@/lib/hooks/queries';
import {
  PROFILE_AGGREGATE_ROOT,
  usePublicProfileByUsername,
  useSellerListingsPaged,
} from '@/lib/hooks/profile-queries';
import { LOOKS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { unblockUser } from '@/lib/api/services/users';
import { useInboxSafety } from '@/components/inbox/inboxSafety';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useToast } from '@/components/ui/Toast';
import { useOwnerBoards } from '@/components/profile/useOwnerBoards';
import type { ProfileStatKey } from '@/components/profile/ProfileHero';
import { closetMosaicCells, CLOSET_MOSAIC_MIN } from '@/components/closet';
import { getListingCoverUri } from '@/lib/utils/media';

export type ProfileTabKey = 'items' | 'sold' | 'looks' | 'boards' | 'about' | 'reviews';

export function usePublicProfileWorkflow() {
  const params = useParams();
  const username = String(params.username ?? '');
  const router = useRouter();
  const { user: me } = useSession();
  const [tab, setTab] = useState<ProfileTabKey>('items');
  const tabContentRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { show } = useToast();
  const [unblockPending, setUnblockPending] = useState(false);

  const {
    data: aggregate,
    isLoading,
    isFetched,
    isError,
    refetch,
  } = usePublicProfileByUsername(username);
  const user = aggregate?.user ?? null;

  const {
    data: listings,
    isLoading: listingsLoading,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useSellerListingsPaged(user?.id ?? '');

  const { data: reviews, isLoading: reviewsLoading } = useReviews(user?.id ?? '');
  const { data: reviewSummary } = useReviewSummary(user?.id ?? '');

  useEffect(() => {
    if (user?.id && me?.id === user.id) router.replace('/profile');
  }, [user?.id, me?.id, router]);

  const closetThumbs = useMemo(
    () => (listings ?? []).slice(0, 3).map((l) => getListingCoverUri(l.images)),
    [listings],
  );

  const looksQuery = useQuery({
    queryKey: ['looks', 'creator', user?.id, DATA_MODE],
    queryFn: () => socialService.fetchLooks({ creatorId: user?.id }),
    enabled: DATA_MODE === 'live' && !!user?.id,
  });

  const looks = useMemo(
    () =>
      DATA_MODE === 'live'
        ? (looksQuery.data ?? [])
        : LOOKS.filter((l) => l.creatorId === user?.id),
    [looksQuery.data, user?.id],
  );

  const boards = useOwnerBoards(user?.id ?? '', false);

  const closetListings = listings ?? [];
  const forSale = closetListings.filter((l) => !l.isSold);
  const soldListings = closetListings.filter((l) => l.isSold);
  const reviewRows = reviews ?? [];

  const away = aggregate?.away ?? null;
  const trader = aggregate?.trader ?? null;
  const storefront = aggregate?.storefront ?? null;
  const canViewSocial = aggregate?.canViewSocialContent !== false;
  const closetVisible = canViewSocial && aggregate?.canViewShop !== false;

  const closetMediaPool = closetVisible ? [...forSale, ...soldListings] : [];
  const showMosaic =
    user != null &&
    !user.coverPhoto &&
    !user.coverVideo &&
    closetMosaicCells(closetMediaPool).length >= CLOSET_MOSAIC_MIN;

  const tabs: { key: ProfileTabKey; label: string; count?: number }[] = [
    ...(closetVisible
      ? [
          {
            key: 'items' as const,
            label: 'For sale',
            count: listingsLoading ? undefined : forSale.length,
          },
          {
            key: 'sold' as const,
            label: 'Sold',
            count: listingsLoading ? undefined : soldListings.length,
          },
        ]
      : []),
    ...(canViewSocial && looks.length > 0
      ? [{ key: 'looks' as const, label: 'Looks', count: looks.length }]
      : []),
    ...(canViewSocial && boards.length > 0
      ? [{ key: 'boards' as const, label: 'Boards', count: boards.length }]
      : []),
    { key: 'about' as const, label: 'About' },
    ...(canViewSocial
      ? [
          {
            key: 'reviews' as const,
            label: 'Reviews',
            count: reviewsLoading ? undefined : reviewRows.length,
          },
        ]
      : []),
  ];

  const activeTab: ProfileTabKey = tabs.some((t) => t.key === tab) ? tab : 'about';

  const onStatPress = (stat: ProfileStatKey) => {
    setTab(stat === 'sold' ? 'sold' : stat === 'reviews' ? 'reviews' : 'items');
    requestAnimationFrame(() =>
      tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const handleUnblock = () => {
    if (!user) return;
    const write = DATA_MODE === 'live' ? unblockUser(user.id) : Promise.resolve();
    setUnblockPending(true);
    void write
      .then(() => {
        if (useInboxSafety.getState().blockedUserIds.includes(user.id)) {
          useInboxSafety.getState().toggleBlocked(user.id);
        }
        useSettingsPrefs.getState().unblockUser(user.id);
        void qc.invalidateQueries({ queryKey: PROFILE_AGGREGATE_ROOT });
        show(`@${user.username} unblocked`, 'info');
      })
      .catch(() => show('Could not unblock this member', 'error'))
      .finally(() => setUnblockPending(false));
  };

  return {
    user,
    me,
    aggregate,
    isLoading,
    isFetched,
    isError,
    refetch,
    listingsLoading,
    closetListings,
    forSale,
    soldListings,
    closetThumbs,
    closetMediaPool,
    showMosaic,
    looks,
    boards,
    reviewRows,
    reviewSummary,
    reviewsLoading,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    tab,
    setTab,
    activeTab,
    tabs,
    tabContentRef,
    onStatPress,
    away,
    trader,
    storefront,
    closetVisible,
    unblockPending,
    handleUnblock,
  };
}
