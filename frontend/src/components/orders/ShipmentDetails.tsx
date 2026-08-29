import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { DetailRow } from './OrderDetailRows';
import type { CommerceOrder } from '../../services/commerceApi';

interface Props {
  order: CommerceOrder;
  carrierTrackingUrl: string | null;
  shipmentLastUpdated?: string;
  packageSummary: string | null;
  destinationSummary?: string | null;
  onCopyTracking: (trackingNumber: string) => void;
  onTrackOnCarrierSite: () => void;
  onOpenShippingLabel: (url: string) => void;
}

export function ShipmentDetails({
  order,
  carrierTrackingUrl,
  shipmentLastUpdated,
  packageSummary,
  destinationSummary,
  onCopyTracking,
  onTrackOnCarrierSite,
  onOpenShippingLabel }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    sectionLabel: { color: colors.textMuted },
    detailLabel: { color: colors.textSecondary },
    detailValueLink: { color: colors.brand },
    shippingLabelBtnText: { color: colors.brand } }), [colors]);

  return (
    <View style={styles.shipmentSection}>
      <Text style={[styles.sectionLabel, themed.sectionLabel]}>Shipment details</Text>
      {order.shippingProvider ? (
        <DetailRow label="Carrier" value={order.shippingProvider} />
      ) : null}
      {order.trackingNumber ? (
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, themed.detailLabel]}>Tracking number</Text>
          <Pressable
            onPress={() => onCopyTracking(order.trackingNumber!)}
            style={styles.copyRow}
            accessibilityRole="button"
            accessibilityLabel={`Copy tracking number ${order.trackingNumber}`}
          >
            <Text style={[styles.detailValueLink, themed.detailValueLink]}>{order.trackingNumber}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.brand} aria-hidden={true} />
          </Pressable>
        </View>
      ) : null}
      {carrierTrackingUrl ? (
        <Pressable
          onPress={onTrackOnCarrierSite}
          style={styles.textLinkRow}
          accessibilityRole="link"
          accessibilityLabel="Track on carrier website"
        >
          <Text style={[styles.textLink, themed.detailValueLink]}>Track on carrier site</Text>
          <Ionicons name="open-outline" size={14} color={colors.brand} aria-hidden={true} />
        </Pressable>
      ) : null}
      {shipmentLastUpdated ? (
        <DetailRow label="Last carrier update" value={shipmentLastUpdated} />
      ) : null}
      {packageSummary ? (
        <DetailRow label="Package" value={packageSummary} />
      ) : null}
      {destinationSummary ? (
        <DetailRow label="Destination" value={destinationSummary} />
      ) : null}
      {order.shippingLabelUrl ? (
        <Pressable
          style={styles.shippingLabelBtn}
          onPress={() => onOpenShippingLabel(order.shippingLabelUrl!)}
          accessibilityRole="button"
          accessibilityLabel="Open shipping label"
        >
          <Ionicons name="open-outline" size={16} color={colors.brand} aria-hidden={true} />
          <Text style={[styles.shippingLabelBtnText, themed.shippingLabelBtnText]}>Open shipping label</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shipmentSection: {
    paddingVertical: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    gap: Space.md },
  detailLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  detailValueLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  shippingLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm + 2,
    marginTop: Space.xs,
    minHeight: Control.hit },
  shippingLabelBtnText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  textLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    marginTop: Space.xs,
    minHeight: Control.hit },
  textLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing } });
