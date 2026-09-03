import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormSheet } from './sheets/FormSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useHaptic } from '../hooks/useHaptic';
import {
  fetchMoodboardVersions,
  restoreMoodboardVersion,
  pinMoodboardVersion,
  type MoodboardVersion } from '../services/moodboardApi';
import { formatShortDateTime } from '../utils/dateFormat';
import { ConfirmationSheet } from './ConfirmationSheet';

export interface MoodboardVersionHistorySheetProps {
  visible: boolean;
  onDismiss: () => void;
  moodboardId: string;
  isOwner: boolean;
  onRestored: () => void;
}

export function MoodboardVersionHistorySheet({
  visible, onDismiss, moodboardId, isOwner, onRestored }: MoodboardVersionHistorySheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [versions, setVersions] = useState<MoodboardVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setVersions(await fetchMoodboardVersions(moodboardId));
    } catch {
      setError('Could not load versions.');
    } finally {
      setIsLoading(false);
    }
  }, [moodboardId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const sorted = useMemo(() => {
    const byNewest = (a: MoodboardVersion, b: MoodboardVersion) => b.revision - a.revision;
    const pinned = versions.filter((v) => v.isPinned).sort(byNewest);
    const rest = versions.filter((v) => !v.isPinned).sort(byNewest);
    return pinned.concat(rest);
  }, [versions]);

  const currentRevision = useMemo(
    () => versions.reduce((max, v) => Math.max(max, v.revision), 0),
    [versions],
  );

  const handlePin = useCallback(async (version: MoodboardVersion) => {
    haptic.light();
    setBusyId(version.id);
    try {
      await pinMoodboardVersion(moodboardId, version.id, !version.isPinned);
      setVersions((prev) =>
        prev.map((v) => (v.id === version.id ? { ...v, isPinned: !v.isPinned } : v)),
      );
    } catch {
      setConfirmSheet({
        visible: true,
        title: 'Could not update pin.',
        message: '',
        confirmLabel: 'OK',
        variant: 'default',
        onConfirm: () => {} });
    } finally {
      setBusyId(null);
    }
  }, [haptic, moodboardId]);

  const handleRestore = useCallback((version: MoodboardVersion) => {
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: 'Restore version',
      message: `This will replace the current canvas with revision ${version.revision}. A new version is created from the current state first.`,
      confirmLabel: 'Restore',
      variant: 'default',
      onConfirm: async () => {
        setBusyId(version.id);
        try {
          await restoreMoodboardVersion(moodboardId, version.id);
          await load();
          onRestored();
        } catch {
          setError('Restore failed. Try again.');
        } finally {
          setBusyId(null);
        }
      } });
  }, [haptic, moodboardId, load, onRestored]);

  const renderRow = (version: MoodboardVersion, index: number) => {
    const isCurrent = version.revision === currentRevision;
    const isBusy = busyId === version.id;
    return (
      <View key={version.id} style={[styles.row, version.isPinned && styles.rowPinned, index > 0 && styles.rowSeparator]}>
        <View style={styles.rowMain}>
          <View style={styles.rowHeader}>
            <Text style={styles.revision}>r{version.revision}</Text>
            <Text style={styles.label} numberOfLines={1}>{version.label?.trim() || 'Untitled'}</Text>
            <Text style={styles.source}>{version.source}</Text>
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.timestamp}>{formatShortDateTime(version.createdAt)}</Text>
            {version.createdByName ? <Text style={styles.createdBy} numberOfLines={1}>{version.createdByName}</Text> : null}
          </View>
        </View>

        {isOwner && (
          <View style={styles.rowActions}>
            <AnimatedPressable
              style={styles.iconButton}
              onPress={() => handlePin(version)}
              disabled={isBusy}
              hapticFeedback="light"
              accessibilityLabel={version.isPinned ? 'Unpin version' : 'Pin version'}
            >
              <Ionicons
                name={version.isPinned ? 'pin' : 'pin-outline'}
                size={18}
                color={version.isPinned ? colors.brand : colors.textMuted}
              />
            </AnimatedPressable>
            {!isCurrent && (
              <AnimatedPressable
                style={styles.restoreButton}
                onPress={() => handleRestore(version)}
                disabled={isBusy}
                hapticFeedback="medium"
                accessibilityLabel={`Restore revision ${version.revision}`}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={styles.restoreText}>Restore</Text>
                )}
              </AnimatedPressable>
            )}
          </View>
        )}
      </View>
    );
  };

  let content: React.ReactNode;
  if (isLoading && versions.length === 0) {
    content = (
      <View style={styles.stateWrap}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  } else if (error && versions.length === 0) {
    content = (
      <View style={styles.stateWrap}>
        <Text style={styles.stateText}>{error}</Text>
        <AnimatedPressable style={styles.retryButton} onPress={load} hapticFeedback="light">
          <Text style={styles.retryText}>Retry</Text>
        </AnimatedPressable>
      </View>
    );
  } else if (versions.length === 0) {
    content = (
      <View style={styles.stateWrap}>
        <Text style={styles.stateText}>No versions saved yet</Text>
      </View>
    );
  } else {
    content = <View style={styles.list}>{sorted.map(renderRow)}</View>;
  }

  return (
    <>
      <FormSheet
        visible={visible}
        onDismiss={onDismiss}
        title="Version history"
        snapPoint={0.7}
      >
        {content}
      </FormSheet>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    list: { paddingBottom: Space.lg },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: Space.md, paddingHorizontal: Space.xs },
    rowPinned: { backgroundColor: colors.brandSubtle, borderRadius: Radius.sm },
    rowSeparator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
    rowMain: { flex: 1, marginRight: Space.sm },
    rowHeader: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
    revision: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.numericMeta.size, lineHeight: TypographyV2.numericMeta.lineHeight,
      color: colors.brand },
    label: {
      flexShrink: 1, fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size, lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary },
    source: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size, lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted },
    rowMeta: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm, marginTop: Space.xxs },
    timestamp: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size, lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted },
    createdBy: {
      flexShrink: 1, fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size, lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textSecondary },
    rowActions: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
    iconButton: {
      width: 36, height: 36, borderRadius: Radius.sm,
      alignItems: 'center', justifyContent: 'center' },
    restoreButton: {
      height: 32, paddingHorizontal: Space.sm, borderRadius: Radius.md,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.brandSubtle },
    restoreText: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.meta.size, color: colors.brand },
    stateWrap: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: Space.xl, paddingHorizontal: Space.md },
    stateText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary, textAlign: 'center' },
    retryButton: {
      marginTop: Space.md, paddingHorizontal: Space.md, height: 36,
      borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.brandSubtle },
    retryText: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.meta.size, color: colors.brand } });
