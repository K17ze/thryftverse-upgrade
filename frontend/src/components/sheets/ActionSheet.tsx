import React from 'react';
import { BottomSheet } from '../BottomSheet';

/**
 * ActionSheet — short choices, system-like, content-sized.
 *
 * Minimal shadow, no blur backdrop, small radius (12px). Used for action
 * menus, pickers, and confirmations where the user makes a quick selection
 * and dismisses. The material is deliberately restrained so the choices
 * themselves dominate, not the chrome.
 */
export interface ActionSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Fraction of screen height. Defaults to 0.4 — short, content-sized. */
  snapPoint?: number;
}

export function ActionSheet({
  visible,
  onDismiss,
  children,
  snapPoint = 0.4,
}: ActionSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={snapPoint}
      variant="system"
      topRadius={12}
    >
      {children}
    </BottomSheet>
  );
}
