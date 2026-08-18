import React from 'react';
import { BottomSheet } from '../BottomSheet';

/**
 * InspectorSheet — medium/large detent, contextual to a selected object.
 *
 * Uses the `inspector` variant which keeps a lighter backdrop (media behind
 * the sheet stays partially visible) and a larger radius (20px). Used for
 * object inspectors and detail panels where the user examines something they
 * tapped without fully losing the context behind the sheet.
 */
export interface InspectorSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Fraction of screen height. Defaults to 0.7 — medium/large detent. */
  snapPoint?: number;
}

export function InspectorSheet({
  visible,
  onDismiss,
  children,
  snapPoint = 0.7,
}: InspectorSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={snapPoint}
      variant="inspector"
    >
      {children}
    </BottomSheet>
  );
}
