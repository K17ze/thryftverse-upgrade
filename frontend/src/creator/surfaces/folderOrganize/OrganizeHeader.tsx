/**
 * OrganizeHeader — header row for the generic FolderOrganizeSheet
 * surface. Extracted verbatim from FolderOrganizeSheet.tsx.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { createStyles } from './folderOrganizeStyles';

interface OrganizeHeaderProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  closeIcon: keyof typeof Ionicons.glyphMap;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}

export function OrganizeHeader({ title, closeLabel, onClose, closeIcon, styles, colors }: OrganizeHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        style={styles.closeBtn}
        accessibilityLabel={closeLabel}
        accessibilityHint="Closes this sheet"
        accessibilityRole="button"
        hitSlop={8}
      >
        <Ionicons name={closeIcon} size={22} color={closeIcon === 'checkmark' ? colors.brand : colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.closeBtn} />
    </View>
  );
}
