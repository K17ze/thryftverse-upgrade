import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { collectionById } from '@/components/profile/fixtures';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';
import { userById } from '@/lib/data/fixtures';
import {
  USER_COLLECTION_SEED,
  type UserCollection,
} from '@/lib/data/fixtures-collections';
import type { ApiCollection } from '@/lib/api/services/collections';
import type { BoardPref } from '@/components/profile/boardPrefs';
import type { Listing, User } from '@/lib/contracts/domain';
import { timeAgo } from '@/lib/utils/format';
import type { CollectionOverlay } from '@/lib/store/collectionEdits';
import {
  EMPTY_IDS,
  LIVE,
  USER_COLLECTIONS_KEY,
  type ResolvedCollection,
} from './collectionDetailTypes';

export interface UseCollectionResolutionParams {
  id: string;
  isCloset: boolean;
  me: User | null;
  hydrated: boolean;
  queryClient: QueryClient;
  boardPref?: BoardPref;
  closetOwner?: User | null;
  closetItems?: Listing[];
  loading: boolean;
  boardQueryData?: ApiCollection | null;
  edits?: CollectionOverlay;
}

export function useCollectionResolution({
  id,
  isCloset,
  me,
  hydrated,
  queryClient,
  boardPref,
  closetOwner,
  closetItems,
  loading,
  boardQueryData,
  edits,
}: UseCollectionResolutionParams) {
  const resolved = useMemo<ResolvedCollection | null>(() => {
    if (isCloset) {
      if (loading || !closetOwner) return null;
      return {
        id,
        title: `${closetOwner.username}'s closet`,
        itemIds: (closetItems ?? []).map((l) => l.id),
        owner: closetOwner,
        editable: false,
      };
    }
    if (LIVE) {
      const board = boardQueryData;
      if (!board || !me) return null;
      return {
        id,
        title: edits?.title ?? board.name,
        description:
          edits && 'description' in edits ? edits.description : board.description,
        itemIds: [...board.itemIds],
        owner: me,
        ownerId: me.id,
        isPrivate:
          (hydrated ? boardPref?.isPrivate : undefined) ?? board.isPrivate,
        meta: board.updatedAt ? `Updated ${timeAgo(board.updatedAt)}` : undefined,
        editable: true,
      };
    }
    const c = collectionById(id);
    if (!c) return null;
    const ownerId = 'ownerId' in c ? c.ownerId : 'me';
    const uc = (
      queryClient.getQueryData<UserCollection[]>(USER_COLLECTIONS_KEY) ??
      USER_COLLECTION_SEED
    ).find((x) => x.id === c.id);
    const isPrivate =
      (hydrated ? boardPref?.isPrivate : undefined) ??
      ('isPrivate' in c ? c.isPrivate : undefined) ??
      uc?.isPrivate ??
      false;
    return {
      id,
      title: edits?.title ?? c.title,
      description:
        edits && 'description' in edits ? edits.description : uc?.description ?? null,
      itemIds: [...c.itemIds],
      owner: ownerId && ownerId !== 'me' ? userById(ownerId) : undefined,
      ownerId,
      isPrivate,
      meta: c.createdAt ? `Updated ${timeAgo(c.createdAt)}` : undefined,
      editable: !!me && ownerId === me.id,
    };
  }, [
    id,
    isCloset,
    loading,
    closetOwner,
    closetItems,
    me,
    queryClient,
    hydrated,
    boardPref?.isPrivate,
    edits,
    boardQueryData,
  ]);

  const itemIds = useMemo(
    () => edits?.itemIds ?? resolved?.itemIds ?? [],
    [edits?.itemIds, resolved],
  );

  const coverItemId = hydrated ? boardPref?.coverItemId : undefined;
  const heroThumbs = useBoardCoverThumbs(
    isCloset ? EMPTY_IDS : itemIds,
    4,
    undefined,
    coverItemId,
  );
  const showHero = !isCloset && heroThumbs.length > 0;

  return {
    resolved,
    itemIds,
    coverItemId,
    heroThumbs,
    showHero,
  };
}
