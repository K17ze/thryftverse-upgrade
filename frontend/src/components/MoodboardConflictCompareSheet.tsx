import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { FormSheet } from './sheets/FormSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { useAppTheme } from '../theme/ThemeContext';
import { FontFamily, Radius, Space, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { getThemeById, type Moodboard } from '../services/moodboardApi';

interface MoodboardConflictCompareSheetProps {
  visible: boolean;
  onDismiss: () => void;
  localVersion: Moodboard | null;
  serverVersion: Moodboard | null;
  onKeepLocal: () => void;
  onKeepServer: () => void;
}

/**
 * MoodboardConflictCompareSheet — side-by-side resolution surface for when
 * the server reports a conflict during moodboard editing. Shows the local
 * and canonical versions with a mini canvas preview so the user can make an
 * informed choice, then commit to one side.
 */
export function MoodboardConflictCompareSheet({
  visible,
  onDismiss,
  localVersion,
  serverVersion,
  onKeepLocal,
  onKeepServer }: MoodboardConflictCompareSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const loading = !localVersion || !serverVersion;

  const identical = React.useMemo(
    () =>
      !!localVersion &&
      !!serverVersion &&
      localVersion.revision === serverVersion.revision &&
      localVersion.title === serverVersion.title &&
      localVersion.theme === serverVersion.theme &&
      localVersion.items.length === serverVersion.items.length,
    [localVersion, serverVersion],
  );

  const renderColumn = (label: string, version: Moodboard | null) => {
    const theme = version ? getThemeById(version.theme) : null;
    return (
      <View style={styles.column}>
        <Text style={styles.columnLabel}>{label}</Text>
        <View
          style={[
            styles.miniCanvas,
            { backgroundColor: theme?.backgroundColor ?? colors.surfaceAlt },
          ]}
        >
          {version?.items.map((item) => (
            <View
              key={item.id}
              style={{
                position: 'absolute',
                left: item.position.x * 100 - 3,
                top: item.position.y * 100 - 3,
                width: 6,
                height: 6,
                borderRadius: 1,
                backgroundColor: colors.textPrimary }}
            />
          ))}
        </View>
        <Text style={styles.boardTitle} numberOfLines={1}>
          {version?.title ?? '—'}
        </Text>
        <Text style={styles.metaText} numberOfLines={1}>
          {theme?.label ?? '—'}
        </Text>
        <Text style={styles.metaText}>
          {version ? `${version.items.length} items` : '—'}
        </Text>
      </View>
    );
  };

  return (
    <FormSheet visible={visible} onDismiss={onDismiss} title="Resolve conflict" snapPoint={0.6}>
      {loading ? (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>Loading versions…</Text>
        </View>
      ) : identical ? (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>Versions are identical</Text>
          <AnimatedPressable
            style={styles.singleButton}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.primaryButtonText}>Dismiss</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.compareRow}>
            {renderColumn('Your version', localVersion)}
            <View style={styles.separator} />
            {renderColumn('Server version', serverVersion)}
          </View>
          <View style={styles.actionRow}>
            <AnimatedPressable
              style={[styles.button, styles.primaryButton]}
              onPress={onKeepLocal}
              accessibilityRole="button"
              accessibilityLabel="Keep my version"
            >
              <Text style={styles.primaryButtonText}>Keep my version</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.button, styles.secondaryButton]}
              onPress={onKeepServer}
              accessibilityRole="button"
              accessibilityLabel="Keep server version"
            >
              <Text style={styles.secondaryButtonText}>Keep server version</Text>
            </AnimatedPressable>
          </View>
        </View>
      )}
    </FormSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    body: { flex: 1 },
    compareRow: { flexDirection: 'row', alignItems: 'stretch' },
    column: { flex: 1, alignItems: 'center', paddingHorizontal: Space.sm },
    separator: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle },
    columnLabel: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textSecondary,
      marginBottom: Space.sm },
    miniCanvas: {
      width: 100,
      height: 100,
      borderRadius: Radius.sm,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
      marginBottom: Space.sm,
      overflow: 'hidden' },
    boardTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary,
      marginBottom: Space.xxs,
      textAlign: 'center' },
    metaText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center' },
    actionRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, paddingHorizontal: Space.sm },
    button: { flex: 1, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    primaryButton: { backgroundColor: colors.brand },
    secondaryButton: { backgroundColor: colors.surfaceAlt, borderWidth: Stroke.standard, borderColor: colors.border },
    primaryButtonText: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.body.size, color: colors.textInverse },
    secondaryButtonText: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.body.size, color: colors.textPrimary },
    messageContainer: { alignItems: 'center', paddingVertical: Space.xl },
    messageText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      marginBottom: Space.md,
      textAlign: 'center' },
    singleButton: {
      height: 44,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center' } });
