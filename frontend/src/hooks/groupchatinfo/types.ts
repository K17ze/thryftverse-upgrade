import type { Dispatch, SetStateAction } from 'react';

/** Shared confirmation-sheet state for the group details screen. */
export interface GroupInfoConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'danger';
}

export type GroupInfoConfirmSheetSetter = Dispatch<
  SetStateAction<GroupInfoConfirmSheetState>
>;
