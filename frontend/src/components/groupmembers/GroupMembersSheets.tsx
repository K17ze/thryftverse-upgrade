/**
 * GroupMembersSheets — the confirmation sheet (remove / promote / demote /
 * transfer / leave) and the long-press member action sheet. Pure
 * presentation; state lives in useGroupMembersActions. Extracted verbatim
 * from GroupMembersScreen.
 */

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { ConfirmationSheet } from '../ConfirmationSheet';
import { ActionSheet } from '../sheets/ActionSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import { createGroupMembersStyles } from './createGroupMembersStyles';
import type {
  GroupMemberMenuState,
  GroupMembersConfirmSheetState,
} from './groupMembersViewModels';

export interface GroupMembersSheetsProps {
  confirmSheet: GroupMembersConfirmSheetState;
  onDismissConfirm: () => void;
  memberActionMenu: GroupMemberMenuState | null;
  onDismissActionMenu: () => void;
}

export function GroupMembersSheets({
  confirmSheet,
  onDismissConfirm,
  memberActionMenu,
  onDismissActionMenu,
}: GroupMembersSheetsProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);

  return (
    <>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={onDismissConfirm}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />
      <ActionSheet
        visible={memberActionMenu !== null}
        onDismiss={onDismissActionMenu}
      >
        {memberActionMenu && (
          <View style={styles.memberActionSheet}>
            <Text style={styles.memberActionTitle}>{memberActionMenu.member.name}</Text>
            {memberActionMenu.actions.map((action) => (
              <AnimatedPressable
                key={action.label}
                style={styles.memberActionRow}
                onPress={() => {
                  onDismissActionMenu();
                  action.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={[styles.memberActionLabel, action.destructive && styles.memberActionLabelDanger]}>
                  {action.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        )}
      </ActionSheet>
    </>
  );
}
