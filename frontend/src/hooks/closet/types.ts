import type { ClosetTabKey, ClosetSortOption } from '../../domain/closet';

export type { ClosetTabKey, ClosetSortOption };

/** ConfirmationSheet state for destructive closet actions (outfit delete). */
export interface ClosetConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
}
