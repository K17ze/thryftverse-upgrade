'use client';

/**
 * MoodboardSheetsGroup — auxiliary sheets for moodboard detail:
 * Import candidates sheet, Comments sheet, Collaborators sheet,
 * Version history sheet, and Version comparison sheet.
 */

import { MoodboardCommentsSheet } from '@/components/moodboard/MoodboardCommentsSheet';
import { MoodboardCollaboratorsSheet } from '@/components/moodboard/MoodboardCollaboratorsSheet';
import { MoodboardCompareSheet } from '@/components/moodboard/MoodboardCompareSheet';
import { MoodboardImportSheet } from '@/components/moodboard/MoodboardImportSheet';
import { MoodboardVersionsSheet } from '@/components/moodboard/MoodboardVersionsSheet';
import type {
  DiscoveryListingSummary,
  Listing,
} from '@/lib/contracts/domain';
import type {
  MoodboardItemPosition,
  MoodboardVersionRow,
} from '@/lib/data/fixtures-content';

interface MoodboardSheetsGroupProps {
  boardId: string;
  importOpen: boolean;
  onCloseImport: () => void;
  importCandidates: DiscoveryListingSummary[];
  onAddItems: (ids: string[]) => void;

  commentsOpen: boolean;
  onCloseComments: () => void;
  commentAnchor: string | null;
  anchorRowId: string | null;
  listingIdByRowId: Record<string, string>;
  boardItems: Listing[];
  canModerateComments: boolean;
  canComment?: boolean;

  collabOpen: boolean;
  onCloseCollab: () => void;
  isOwner: boolean;

  versionsOpen: boolean;
  onCloseVersions: () => void;
  compareVersion: MoodboardVersionRow | null;
  onCloseCompare: () => void;
  currentSnapshot: {
    itemIds: string[];
    positions: Record<string, MoodboardItemPosition>;
    themeId: string;
  };
  onCompareVersion: (v: MoodboardVersionRow) => void;
  onRestoreVersion: (v: MoodboardVersionRow) => void;
}

export function MoodboardSheetsGroup({
  boardId,
  importOpen,
  onCloseImport,
  importCandidates,
  onAddItems,
  commentsOpen,
  onCloseComments,
  commentAnchor,
  anchorRowId,
  listingIdByRowId,
  boardItems,
  canModerateComments,
  canComment,
  collabOpen,
  onCloseCollab,
  isOwner,
  versionsOpen,
  onCloseVersions,
  compareVersion,
  onCloseCompare,
  currentSnapshot,
  onCompareVersion,
  onRestoreVersion,
}: MoodboardSheetsGroupProps) {
  return (
    <>
      <MoodboardImportSheet
        open={importOpen}
        onClose={onCloseImport}
        candidates={importCandidates}
        onAdd={onAddItems}
      />

      {/* Board comments — anchored to a canvas item when opened from a
          selection, otherwise the board-level thread. */}
      <MoodboardCommentsSheet
        boardId={boardId}
        open={commentsOpen}
        onClose={onCloseComments}
        anchorItemId={commentAnchor}
        anchorRowId={anchorRowId}
        listingIdByRowId={listingIdByRowId}
        boardItems={boardItems}
        canModerate={canModerateComments}
        canComment={canComment}
      />

      <MoodboardCollaboratorsSheet
        boardId={boardId}
        open={collabOpen}
        onClose={onCloseCollab}
        isOwner={isOwner}
      />

      <MoodboardVersionsSheet
        boardId={boardId}
        open={versionsOpen}
        onClose={onCloseVersions}
        current={currentSnapshot}
        onCompare={onCompareVersion}
        onRestore={onRestoreVersion}
      />

      <MoodboardCompareSheet
        open={compareVersion !== null}
        onClose={onCloseCompare}
        version={compareVersion}
        current={currentSnapshot}
        onRestore={onRestoreVersion}
      />
    </>
  );
}
