import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Type,
  FontFamily,
  Stroke,
  Control,
} from '../../theme/designTokens';

type Confidence = 'high' | 'medium' | 'low';

interface Props {
  fieldName: string;
  label: string;
  importedValue: string | null;
  resolvedValue: string | null;
  confidence: Confidence;
  onEdit?: () => void;
}

const WARNING_GLYPH_SIZE = 14;

/**
 * ImportedFieldDiff — the "Imported vs ThryftVerse" row for a single field
 * in the item editor.
 *
 * Composition is a hairline separator above, the label on the left, the
 * resolved value on the right, and the imported value below when it differs.
 * A low-confidence warning glyph sits next to the resolved value — not a
 * decorative badge, just the glyph. When `onEdit` is provided the whole row
 * is tappable and a chevron marks the affordance.
 */
export function ImportedFieldDiff({
  label,
  importedValue,
  resolvedValue,
  confidence,
  onEdit,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const hasDiff =
    importedValue !== null &&
    importedValue !== undefined &&
    importedValue !== resolvedValue;

  const showWarning = confidence === 'low';
  const isEditable = typeof onEdit === 'function';

  const handlePress = React.useCallback(() => {
    if (onEdit) onEdit();
  }, [onEdit]);

  const content = (
    <View style={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>

        <View style={styles.valueWrap}>
          {showWarning ? (
            <Ionicons
              name="alert-circle"
              size={WARNING_GLYPH_SIZE}
              color={colors.warning}
              style={styles.warningGlyph}
            />
          ) : null}
          <Text
            style={styles.resolvedValue}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {resolvedValue ?? '\u2014'}
          </Text>
          {isEditable ? (
            <Ionicons
              name="chevron-forward"
              size={Control.iconCompact}
              color={colors.textMuted}
              style={styles.chevron}
            />
          ) : null}
        </View>
      </View>

      {hasDiff ? (
        <View style={styles.importedRow}>
          <Text style={styles.importedLabel} numberOfLines={1}>
            IMPORTED
          </Text>
          <Text
            style={styles.importedValue}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {importedValue}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!isEditable) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <AnimatedPressable
      style={styles.row}
      onPress={handlePress}
      scaleValue={1}
      hapticFeedback="selection"
      accessibilityRole="button"
      accessibilityLabel={`${label} field`}
      accessibilityHint="Opens the field editor"
    >
      {content}
    </AnimatedPressable>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    row: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.border,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
    },
    content: {
      gap: Space.xs,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.md,
    },
    label: {
      flexShrink: 0,
      maxWidth: 120,
      fontFamily: FontFamily.semibold,
      fontSize: Type.metaElevated.size,
      lineHeight: Type.metaElevated.lineHeight,
      letterSpacing: Type.metaElevated.letterSpacing,
      color: colors.textMuted,
      paddingTop: 2,
    },
    valueWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: Space.xs,
    },
    warningGlyph: {
      flexShrink: 0,
    },
    resolvedValue: {
      flexShrink: 1,
      textAlign: 'right',
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      color: colors.textPrimary,
    },
    chevron: {
      flexShrink: 0,
    },
    importedRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      paddingLeft: 0,
    },
    importedLabel: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      letterSpacing: Type.meta.letterSpacing,
      color: colors.textMuted,
      paddingTop: 1,
    },
    importedValue: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      color: colors.textSecondary,
    },
  });
