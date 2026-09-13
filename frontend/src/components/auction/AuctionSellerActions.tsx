import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  visible: boolean;
  title: string;
  bidCount: number;
  onDismiss: () => void;
  onViewBids: () => void;
  onViewListing?: () => void;
  onViewOrder?: () => void;
  onViewAll: () => void;
  onCancel?: () => void;
  cancelPending: boolean;
}

/** Management stays scoped to the auction the seller is viewing. */
export function AuctionSellerActions(props: Props) {
  const { colors } = useAppTheme();
  const actions: Array<{
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    run: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }> = [
    { label: `Bid history · ${props.bidCount}`, icon: 'list-outline', run: props.onViewBids },
    ...(props.onViewOrder ? [{ label: 'Manage sale order', icon: 'receipt-outline' as const, run: props.onViewOrder }] : []),
    ...(props.onViewListing ? [{ label: 'View item listing', icon: 'shirt-outline' as const, run: props.onViewListing }] : []),
    { label: 'All your auctions', icon: 'albums-outline', run: props.onViewAll },
    ...(props.onCancel ? [{ label: props.cancelPending ? 'Cancelling…' : 'Cancel auction', icon: 'close-circle-outline' as const, run: props.onCancel, destructive: true, disabled: props.cancelPending }] : []),
  ];
  return (
    <BottomSheet visible={props.visible} onDismiss={props.onDismiss} snapPoint={0.6}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>Manage auction</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>{props.title}</Text>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => { props.onDismiss(); action.run(); }}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled, busy: action.disabled }}
          style={({ pressed }) => [styles.row, { borderTopColor: colors.borderSubtle, opacity: pressed || action.disabled ? 0.6 : 1 }]}
        >
          <Ionicons name={action.icon} size={22} color={action.destructive ? colors.danger : colors.textSecondary} />
          <Text style={[styles.label, { color: action.destructive ? colors.danger : colors.textPrimary }]}>{action.label}</Text>
          {!action.destructive ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
        </Pressable>
      ))}
      <View style={{ height: Space.md }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FontFamily.semibold, fontSize: TypographyV2.sectionTitle.size, lineHeight: TypographyV2.sectionTitle.lineHeight },
  subtitle: { fontFamily: FontFamily.regular, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, marginTop: Space.xs, marginBottom: Space.lg },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: Space.md, gap: Space.md, borderTopWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, fontFamily: FontFamily.medium, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight },
});
