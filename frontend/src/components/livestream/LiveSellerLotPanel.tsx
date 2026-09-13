/**
 * LiveSellerLotPanel — the lot command surface for a live broadcast:
 * current lot snapshot, real lot-engine transitions (open / close /
 * cancel / settle / next), settlement status and the queue count.
 */

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import type { LiveLotAggregate, LotSettlementStatus } from '../../services/liveShoppingApi';
import { lotStatusLabel, lotStatusColor, settlementLabel } from './liveSellerUtils';
import { useSellerStyles } from './liveSellerStyles';

interface LiveSellerLotPanelProps {
  currentLot: LiveLotAggregate;
  nextLot: LiveLotAggregate | null;
  currentLotIndex: number;
  lotsCount: number;
  remainingLots: number;
  settlementStatus: LotSettlementStatus | null;
  lotActionPending: boolean;
  settlePending: boolean;
  endingStream: boolean;
  onOpenLot: () => void;
  onCloseLot: () => void;
  onCancelLot: () => void;
  onNextLot: () => void;
  onSettleLot: () => void;
  onEndStream: () => void;
}

export function LiveSellerLotPanel({
  currentLot,
  nextLot,
  currentLotIndex,
  lotsCount,
  remainingLots,
  settlementStatus,
  lotActionPending,
  settlePending,
  endingStream,
  onOpenLot,
  onCloseLot,
  onCancelLot,
  onNextLot,
  onSettleLot,
  onEndStream }: LiveSellerLotPanelProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const styles = useSellerStyles();

  const canOpen = currentLot.status === 'scheduled';
  const canClose = currentLot.status === 'open' || currentLot.status === 'closing';
  const lotClosed = ['sold', 'passed', 'cancelled'].includes(currentLot.status);
  const needsSettle = currentLot.status === 'sold' && (settlementStatus == null || settlementStatus === 'none');
  const allDone = lotClosed && !nextLot;

  return (
    <View style={[styles.lotPanel, { borderColor: colors.border }]}>
      <View style={styles.lotPanelTop}>
        {currentLot.snapshot?.imageUrl ? (
          <CachedImage
            uri={currentLot.snapshot.imageUrl}
            style={styles.lotPanelThumb}
            contentFit="cover"
            accessible={false}
          />
        ) : null}
        <View style={styles.lotPanelInfo}>
          <Text style={[styles.lotPanelTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {currentLot.snapshot?.title ?? `Lot ${currentLot.lotNumber}`}
          </Text>
          <View style={styles.lotPanelMetaRow}>
            <Text style={[styles.lotPanelPrice, { color: colors.textPrimary }]}>
              {formatFromFiat((currentLot.highBidMinor > 0 ? currentLot.highBidMinor : currentLot.startPriceMinor) / 100, 'GBP')}
            </Text>
            <Text style={[styles.lotPanelStatus, { color: lotStatusColor(currentLot.status, colors) }]}>
              {lotStatusLabel(currentLot.status)}
            </Text>
          </View>
          {settlementLabel(settlementStatus) ? (
            <Text style={[styles.lotPanelSettle, { color: colors.textSecondary }]}>
              {settlementLabel(settlementStatus)}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.lotPanelIndex, { color: colors.textMuted }]}>
          {currentLotIndex + 1}/{lotsCount}
        </Text>
      </View>

      {/* Actions — real lot engine transitions only */}
      <View style={styles.lotActionsRow}>
        {canOpen && (
          <AnimatedPressable
            onPress={onOpenLot}
            disabled={lotActionPending}
            style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="Open bidding"
            accessibilityState={{ busy: lotActionPending }}
          >
            {lotActionPending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.lotActionText, { color: colors.textInverse }]}>Open bidding</Text>
            )}
          </AnimatedPressable>
        )}
        {canClose && (
          <>
            <AnimatedPressable
              onPress={onCloseLot}
              disabled={lotActionPending}
              style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Close lot"
              accessibilityState={{ busy: lotActionPending }}
            >
              {lotActionPending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={[styles.lotActionText, { color: colors.textInverse }]}>Close lot</Text>
              )}
            </AnimatedPressable>
            <AnimatedPressable
              onPress={onCancelLot}
              disabled={lotActionPending}
              style={[styles.lotActionGhost, { borderColor: colors.border }]}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Cancel lot"
            >
              <Text style={[styles.lotActionGhostText, { color: colors.textSecondary }]}>Cancel</Text>
            </AnimatedPressable>
          </>
        )}
        {lotClosed && needsSettle && (
          <AnimatedPressable
            onPress={onSettleLot}
            disabled={settlePending}
            style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="Settle lot"
            accessibilityState={{ busy: settlePending }}
          >
            {settlePending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.lotActionText, { color: colors.textInverse }]}>Settle</Text>
            )}
          </AnimatedPressable>
        )}
        {lotClosed && nextLot && (
          <AnimatedPressable
            onPress={onNextLot}
            disabled={lotActionPending}
            style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={`Next lot: ${nextLot.snapshot?.title ?? `Lot ${nextLot.lotNumber}`}`}
            accessibilityState={{ busy: lotActionPending }}
          >
            {lotActionPending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.lotActionText, { color: colors.textInverse }]}>
                Next lot
              </Text>
            )}
          </AnimatedPressable>
        )}
        {allDone && (
          <AnimatedPressable
            onPress={onEndStream}
            disabled={endingStream}
            style={[styles.lotActionBtn, { backgroundColor: colors.danger }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="End stream"
            accessibilityState={{ busy: endingStream }}
          >
            <Text style={[styles.lotActionText, { color: colors.textInverse }]}>End stream</Text>
          </AnimatedPressable>
        )}
      </View>

      {remainingLots > 0 && (
        <Text style={[styles.queueText, { color: colors.textMuted }]}>
          {remainingLots} lot{remainingLots === 1 ? '' : 's'} in queue
        </Text>
      )}
    </View>
  );
}
