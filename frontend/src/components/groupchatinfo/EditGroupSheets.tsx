/**
 * EditGroupSheets — the bottom-sheet cluster for the edit-group screen:
 * the shared confirmation sheet (discard changes, leave group) and the
 * media source/preset picker. Presentation only — the screen owns all
 * state and wiring. Mirrors GroupChatInfoSheets; extracted verbatim from
 * EditGroupScreen.
 */

import React from 'react';
import { ConfirmationSheet } from '../ConfirmationSheet';
import {
  GroupMediaSourceSheet,
  type GroupMediaSource,
} from '../chat/GroupMediaSourceSheet';
import { getAestheticPresets } from '../../constants/groupAesthetics';
import type { GroupInfoConfirmSheetState } from '../../hooks/groupchatinfo/types';
import type { EditGroupMediaSheetState } from '../../hooks/groupchatinfo/useEditGroupMedia';

export interface EditGroupSheetsProps {
  confirmSheet: GroupInfoConfirmSheetState;
  onDismissConfirmSheet: () => void;
  mediaSheet: EditGroupMediaSheetState;
  onCloseMediaSheet: () => void;
  onSelectMediaSource: (source: GroupMediaSource) => void;
  onSelectPreset: (url: string) => void;
  canRemoveMedia: boolean;
  onRemoveMedia: () => void;
}

export function EditGroupSheets({
  confirmSheet,
  onDismissConfirmSheet,
  mediaSheet,
  onCloseMediaSheet,
  onSelectMediaSource,
  onSelectPreset,
  canRemoveMedia,
  onRemoveMedia,
}: EditGroupSheetsProps) {
  return (
    <>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={onDismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        cancelLabel={confirmSheet.cancelLabel ?? 'Cancel'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />

      <GroupMediaSourceSheet
        visible={mediaSheet.visible}
        onClose={onCloseMediaSheet}
        onSelect={onSelectMediaSource}
        title={mediaSheet.target === 'avatar' ? 'Group photo' : 'Cover photo'}
        presets={getAestheticPresets(mediaSheet.target)}
        onSelectPreset={onSelectPreset}
        canRemove={canRemoveMedia}
        onRemove={onRemoveMedia}
      />
    </>
  );
}
