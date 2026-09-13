import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { PackageContents } from './PackageContents';
import { EtaBanner } from './EtaBanner';
import { OrderTrackingTimeline, type TimelineEntry } from './OrderTrackingTimeline';
import {
  orderDetailScreenStyles as styles,
  createOrderDetailThemedStyles } from './orderDetailScreenStyles';

interface OrderTrackingSectionProps {
  /** Reports the section's Y offset so the footer "Track parcel" action can scroll to it. */
  onTimelineLayout: (e: LayoutChangeEvent) => void;
  packageTitle: string;
  packageImageUrl: string;
  packageSubtitle?: string;
  onPackagePress?: () => void;
  isBuyer: boolean;
  etaWindow: string | null;
  normalisedStatus: string;
  estimatedDeliveryDate: Date | null;
  estimatedDeliveryLabel: string | null;
  serviceName: string | null;
  isStaleTracking: boolean;
  latestEventSummary: string | null;
  entries: TimelineEntry[];
  warningText?: string;
}

/**
 * Tracking / order timeline section — package contents row, ETA banner,
 * stale-tracking warning, latest-event summary line, and the timeline
 * itself. Relocated verbatim from OrderDetailScreen.
 */
export function OrderTrackingSection({
  onTimelineLayout,
  packageTitle,
  packageImageUrl,
  packageSubtitle,
  onPackagePress,
  isBuyer,
  etaWindow,
  normalisedStatus,
  estimatedDeliveryDate,
  estimatedDeliveryLabel,
  serviceName,
  isStaleTracking,
  latestEventSummary,
  entries,
  warningText }: OrderTrackingSectionProps) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createOrderDetailThemedStyles(colors), [colors]);

  return (
    <View
      style={styles.timelineSection}
      onLayout={onTimelineLayout}
    >
      {/* Package contents — compact row so buyer can see WHAT is in the parcel */}
      <View style={styles.packageContentsWrap}>
        <Text style={[styles.packageContentsLabel, themed.detailLabel]}>Package contents</Text>
        <PackageContents
          title={packageTitle}
          imageUrl={packageImageUrl}
          subtitle={packageSubtitle}
          onPress={onPackagePress}
        />
      </View>

      {/* ETA banner — shown when in transit with an ETA window.
          Per report §11.3: ETA disappears when stale (past) so the
          buyer is never shown a false delivery promise. The stale
          tracking warning below covers the overdue case. */}
      {isBuyer && etaWindow && (normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery') && (!estimatedDeliveryDate || estimatedDeliveryDate.getTime() >= Date.now()) ? (
        <EtaBanner
          etaWindow={etaWindow}
          estimatedDeliveryLabel={estimatedDeliveryLabel}
          serviceName={serviceName}
        />
      ) : null}

      {/* Stale tracking warning — last event > 48h old while in transit */}
      {isStaleTracking ? (
        <View style={[styles.staleBanner, themed.staleBanner]}>
          <Ionicons name="time-outline" size={16} color={colors.warning} aria-hidden={true} />
          <Text style={[styles.staleText, themed.staleText]}>
            Tracking hasn't updated in over 48 hours — the carrier may be delayed.
          </Text>
        </View>
      ) : null}

      {/* Latest parcel event — single muted text line above the timeline.
          Per report §11.3: gives the buyer "where is my parcel now?" at a
          glance. One text line, not a card. Only when there are parcel
          events and the order is not completed. */}
      {latestEventSummary ? (
        <Text style={[styles.latestEventLine, themed.lastUpdated]} numberOfLines={1}>
          {latestEventSummary}
        </Text>
      ) : null}

      <OrderTrackingTimeline
        entries={entries}
        warningText={warningText}
      />
    </View>
  );
}
