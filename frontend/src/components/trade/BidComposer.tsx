import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { Headline, Meta, Body } from '../ui/Text';

interface BidComposerProps {
  visible: boolean;
  auctionTitle: string;
  currentBid?: string;
  minimumNextBid?: string;
  bidInput: string;
  currencyCode: string;
  isSubmitting: boolean;
  onBidChange: (value: string) => void;
  onBump: (pct: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function BidComposer({
  visible,
  auctionTitle,
  currentBid,
  minimumNextBid,
  bidInput,
  currencyCode,
  isSubmitting,
  onBidChange,
  onBump,
  onCancel,
  onSubmit,
}: BidComposerProps) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <AnimatedPressable
        style={styles.dismissLayer}
        activeOpacity={1}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss bid composer"
        accessibilityHint="Closes bid modal without submitting"
      />

      <View style={styles.card}>
        <Headline style={styles.title} numberOfLines={1}>
          {auctionTitle}
        </Headline>

        {(currentBid || minimumNextBid) && (
          <View style={styles.bidInfoRow}>
            {currentBid && (
              <View style={styles.bidInfoItem}>
                <Meta style={styles.bidInfoLabel}>Current bid</Meta>
                <Body style={styles.bidInfoValue}>{currentBid}</Body>
              </View>
            )}
            {minimumNextBid && (
              <View style={styles.bidInfoItem}>
                <Meta style={styles.bidInfoLabel}>Minimum</Meta>
                <Body style={[styles.bidInfoValue, styles.bidInfoMin]}>{minimumNextBid}</Body>
              </View>
            )}
          </View>
        )}

        <AppInput
          value={bidInput}
          onChangeText={onBidChange}
          keyboardType="decimal-pad"
          placeholder="0.00"
          prefix={currencyCode}
          accessibilityLabel="Bid amount"
          accessibilityHint="Enter your bid amount"
          containerStyle={styles.input}
        />

        <View style={styles.bumpRow}>
          {[0.01, 0.03, 0.05].map((pct) => (
            <AppButton
              key={pct}
              title={`+${Math.round(pct * 100)}%`}
              style={styles.bumpChip}
              variant="secondary"
              size="sm"
              onPress={() => onBump(pct)}
              accessibilityLabel={`Increase bid by ${Math.round(pct * 100)} percent`}
              accessibilityHint="Applies quick bid increment"
            />
          ))}
        </View>

        <View style={styles.actions}>
          <AppButton
            style={styles.actionBtn}
            onPress={onCancel}
            variant="secondary"
            size="sm"
            align="center"
            title="Cancel"
            accessibilityLabel="Cancel bid"
            accessibilityHint="Closes bid composer"
          />
          <AppButton
            style={[styles.actionBtn, styles.submitBtn]}
            onPress={onSubmit}
            disabled={isSubmitting}
            variant="primary"
            size="sm"
            align="center"
            title={isSubmitting ? 'Submitting...' : 'Place Bid'}
            hapticFeedback="medium"
            accessibilityLabel={isSubmitting ? 'Submitting bid' : 'Place bid'}
            accessibilityHint="Submits your bid"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.xl,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    marginBottom: Space.md,
    textAlign: 'center',
  },
  bidInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Space.md,
    paddingHorizontal: Space.md,
  },
  bidInfoItem: {
    alignItems: 'center',
  },
  bidInfoLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  bidInfoValue: {
    fontSize: 15,
  },
  bidInfoMin: {
    color: Colors.brand,
  },
  input: {
    marginBottom: Space.sm,
  },
  bumpRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  bumpChip: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  actionBtn: {
    flex: 1,
  },
  submitBtn: {
    flex: 1.5,
  },
});