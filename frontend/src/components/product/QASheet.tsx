import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { ListingQA } from './ListingQA';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface QASheetProps {
  visible: boolean;
  onDismiss: () => void;
  listingId: string;
  currentUserName: string;
  isSeller: boolean;
}

/**
 * Questions & answers bottom sheet — wraps ListingQA inside the canonical
 * BottomSheet with a consistent header/close affordance. Extracted from
 * ItemDetailScreen.
 */
export function QASheet({
  visible,
  onDismiss,
  listingId,
  currentUserName,
  isSeller,
}: QASheetProps) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.7}>
      <View style={[styles.qaSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
        <Text style={[styles.qaSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
          Questions & answers
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={styles.sheetCloseTarget}
          accessibilityLabel="Close questions and answers"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      <ListingQA
        listingId={listingId}
        currentUserName={currentUserName}
        isSeller={isSeller}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  qaSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qaSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
