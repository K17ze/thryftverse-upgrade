import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { EmptyState } from '../EmptyState';
import { AppButton } from '../ui/AppButton';
import { MoodboardCollectionGrid } from '../profile/MoodboardCollectionGrid';
import { BoardEmptyGraphic } from '../profile/BoardEmptyGraphic';
import { ClosetBoardSkeleton } from './ClosetSkeletons';
import type { ClosetBoard } from '../../domain/closet';
import { closetStyles } from './closetStyles';

interface ClosetCollectionsSectionProps {
  /** collectionsLoading && no cached collections. */
  showSkeleton: boolean;
  /** collectionsSyncError && no cached collections. */
  showSyncError: boolean;
  boards: ClosetBoard[];
  onRetry: () => void;
  onCreateCollection: () => void;
  onPressBoard: (id: string) => void;
}

/**
 * Collections ("Closets") tab body — board grid over skeleton, sync-error
 * and empty states, plus the FAB-style create button.
 */
export function ClosetCollectionsSection({
  showSkeleton,
  showSyncError,
  boards,
  onRetry,
  onCreateCollection,
  onPressBoard,
}: ClosetCollectionsSectionProps) {
  const { colors } = useAppTheme();
  if (showSkeleton) return <ClosetBoardSkeleton />;
  if (showSyncError) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load collections"
        subtitle="Your collections couldn't be synced. Check your connection and try again."
        ctaLabel="Retry"
        onCtaPress={onRetry}
      />
    );
  }
  if (boards.length === 0) {
    return (
      <EmptyState
        graphic={<BoardEmptyGraphic title="No collections" subtitle="Create your first board" icon="folder-open-outline" size={140} />}
        title="No collections yet"
        subtitle="Group saved items by style, season, or vibe."
        ctaLabel="Create collection"
        onCtaPress={onCreateCollection}
      />
    );
  }
  return (
    <>
      <MoodboardCollectionGrid
        boards={boards}
        onPressBoard={onPressBoard}
      />
      {/* FAB-style create button on Collections tab */}
      <AppButton
        title="Create Collection"
        icon={<Ionicons name="add" size={16} color={colors.background} />}
        onPress={onCreateCollection}
        style={closetStyles.createCollectionBtn}
      />
    </>
  );
}
