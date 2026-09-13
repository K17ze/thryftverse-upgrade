/**
 * GroupInfoHeaderAction — the header right control on the group details
 * screen. Shows an edit glyph for managers and an overflow/share glyph
 * otherwise; the owning screen decides what the press does (navigation
 * wiring stays in the orchestrator).
 */

import React from 'react';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { styles } from './groupChatInfoStyles';

export interface GroupInfoHeaderActionProps {
  /** True when the viewer can edit group info (owner/admin). */
  canEdit: boolean;
  onPress: () => void;
}

export function GroupInfoHeaderAction({ canEdit, onPress }: GroupInfoHeaderActionProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.headerAction}
      activeOpacity={0.68}
      scaleValue={0.94}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={canEdit ? 'Edit group' : 'Share group'}
    >
      <AppIcon
        name={canEdit ? 'edit' : 'more'}
        size="lg"
        color="textPrimary"
        accessible={false}
      />
    </AnimatedPressable>
  );
}
