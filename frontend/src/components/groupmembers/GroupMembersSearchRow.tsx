/**
 * GroupMembersSearchRow — the member-list search field. Thin themed wrapper
 * over AppSearchBar, extracted verbatim from GroupMembersScreen.
 */

import React, { useMemo } from 'react';
import { AppSearchBar } from '../ui/AppSearchBar';
import { useAppTheme } from '../../theme/ThemeContext';
import { createGroupMembersStyles } from './createGroupMembersStyles';

export interface GroupMembersSearchRowProps {
  value: string;
  onChangeText: (query: string) => void;
}

export function GroupMembersSearchRow({ value, onChangeText }: GroupMembersSearchRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupMembersStyles(colors), [colors]);

  return (
    <AppSearchBar
      placeholder="Search members..."
      value={value}
      onChangeText={onChangeText}
      onClear={() => onChangeText('')}
      containerStyle={styles.searchRow}
    />
  );
}
