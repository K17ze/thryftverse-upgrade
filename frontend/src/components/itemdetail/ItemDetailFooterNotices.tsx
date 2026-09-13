import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SyncRetryBanner } from '../SyncRetryBanner';
import { CommerceDetailUnavailableInline } from '../commerce/detail';
import { Space } from '../../theme/designTokens';

export interface ItemDetailFooterNoticesProps {
  /** recsError && recommendationSections.length === 0. */
  showRecsError: boolean;
  /** Truthy when a backend sync error exists (lastError). */
  hasSyncError: boolean;
  isSyncing: boolean;
  onSyncRetry: () => void;
}

/**
 * Bottom-of-scroll status notices — the recommendations-unavailable
 * inline error and the sync retry banner. Rendered at the tail of the
 * detail content; both are silent when healthy.
 */
export function ItemDetailFooterNotices({
  showRecsError,
  hasSyncError,
  isSyncing,
  onSyncRetry,
}: ItemDetailFooterNoticesProps) {
  return (
    <>
      {showRecsError && (
        <View style={styles.recErrorRow}>
          <CommerceDetailUnavailableInline
            title="Recommendations unavailable"
            body="Recommendations are temporarily unavailable."
          />
        </View>
      )}

      {/* Sync retry banner — only when there is a real sync error */}
      {hasSyncError ? (
        <View style={styles.syncRetryWrap}>
          <SyncRetryBanner
            message="Pull latest listing changes now."
            onRetry={onSyncRetry}
            isRetrying={isSyncing}
            telemetryContext="item_detail_listing_sync"
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Discovery ──
  recErrorRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  // ── Sync retry ──
  syncRetryWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
});
