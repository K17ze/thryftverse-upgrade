/**
 * MoodboardImportTray — slim strip of in-flight photo/video imports.
 *
 * One square thumbnail per job (the local asset URI — the upload's true
 * subject), the real pipeline stage underneath, tap-to-retry on failure.
 * Renders nothing while no jobs exist. This is the honesty surface:
 * stages are reported verbatim from the upload pipeline — no spinners
 * without real work behind them.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Control, GlyphShadow } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { HorizontalRail } from '../HorizontalRail';
import type {
  MoodboardImportJob,
  MoodboardImportJobStage } from './useMoodboardImport';

export const IMPORT_TRAY_TILE = 56;

const COVER_FIT: ImageContentFit = 'cover';
const SPINNER_SIZE = 'small' as const;
const POINTER_NONE = 'none' as const;
const WAITING_FOR_CONNECTION = 'Waiting for connection';

export interface MoodboardImportTrayProps {
  jobs: MoodboardImportJob[];
  isOffline: boolean;
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

const STAGE_LABEL: Record<MoodboardImportJobStage, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  uploading: 'Uploading',
  finalizing: 'Finishing',
  added: 'Added',
  failed: 'Retry',
};

const ACTIVE_STAGES: ReadonlySet<MoodboardImportJobStage> = new Set([
  'preparing',
  'uploading',
  'finalizing',
]);

function JobTile({
  job,
  onRetry,
  onDismiss,
}: {
  job: MoodboardImportJob;
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}) {
  const { colors } = useAppTheme();
  const failed = job.stage === 'failed';
  const active = ACTIVE_STAGES.has(job.stage);
  const fileLabel = job.asset.filename ?? 'media';

  return (
    <View style={styles.jobTile}>
      <AnimatedPressable
        style={styles.jobThumbWrap}
        onPress={failed ? () => onRetry(job.id) : undefined}
        disabled={!failed}
        activeOpacity={0.85}
        scaleValue={0.96}
        accessibilityRole="button"
        accessibilityLabel={
          failed
            ? `Retry import of ${fileLabel}`
            : `Importing ${fileLabel}, ${STAGE_LABEL[job.stage]}`
        }
        accessibilityHint={failed ? 'Retries this upload' : 'Upload in progress'}
        accessibilityState={failed ? { disabled: false } : { busy: true }}
      >
        <Image
          source={{ uri: job.asset.uri }}
          style={styles.jobThumb as ImageStyle}
          contentFit={COVER_FIT}
        />
        {/* Stage overlay — spinner for active work, refresh glyph for a
            failed job that can be retried by tapping the tile. */}
        {(active || failed) && (
          <View
            style={[styles.jobOverlay, { backgroundColor: colors.mediaOverlayScrim }]}
            pointerEvents={POINTER_NONE}
          >
            {active ? (
              <ActivityIndicator size={SPINNER_SIZE} color={colors.scrimTextPrimary} />
            ) : (
              <AppIcon
                name="refresh"
                size={IconSize.md}
                color={colors.scrimTextPrimary}
                glyphStyle={GlyphShadow.glyph}
                accessible={false}
              />
            )}
          </View>
        )}
        {/* Dismiss affordance — only on jobs the user can act on (failed or
            still queued); active and completed jobs leave on their own. */}
        {(failed || job.stage === 'queued') && (
          <AnimatedPressable
            style={[styles.jobDismiss, { backgroundColor: colors.mediaOverlayScrim }]}
            onPress={() => onDismiss(job.id)}
            activeOpacity={0.8}
            scaleValue={0.9}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${fileLabel} from imports`}
            accessibilityHint="Removes this item without adding it"
          >
            <AppIcon
              name="close"
              size={IconSize.micro}
              color={colors.scrimTextPrimary}
              accessible={false}
            />
          </AnimatedPressable>
        )}
      </AnimatedPressable>
      <Text
        style={[
          styles.jobStage,
          { color: failed ? colors.dangerText : colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {STAGE_LABEL[job.stage]}
      </Text>
    </View>
  );
}

export const MoodboardImportTray = React.memo(function MoodboardImportTray({
  jobs,
  isOffline,
  onRetry,
  onDismiss,
}: MoodboardImportTrayProps) {
  const { colors } = useAppTheme();
  if (jobs.length === 0) return null;

  const waiting = isOffline && jobs.some((job) => job.stage === 'queued');

  return (
    <View style={styles.tray}>
      <HorizontalRail
        contentContainerStyle={styles.trayContent}
        showsHorizontalScrollIndicator={false}
      >
        {jobs.map((job) => (
          <JobTile key={job.id} job={job} onRetry={onRetry} onDismiss={onDismiss} />
        ))}
      </HorizontalRail>
      {waiting && (
        <Text style={[styles.waitingText, { color: colors.textMuted }]}>
          {WAITING_FOR_CONNECTION}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  tray: {
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
    gap: Space.xs },
  trayContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm },
  jobTile: {
    width: IMPORT_TRAY_TILE,
    gap: Space.xs / 2 },
  jobThumbWrap: {
    width: IMPORT_TRAY_TILE,
    height: IMPORT_TRAY_TILE,
    borderRadius: Radius.md,
    overflow: 'hidden' },
  jobThumb: {
    width: IMPORT_TRAY_TILE,
    height: IMPORT_TRAY_TILE },
  jobOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  jobDismiss: {
    position: 'absolute',
    top: Space.xs / 2,
    right: Space.xs / 2,
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  jobStage: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  waitingText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    paddingHorizontal: Space.md } });
