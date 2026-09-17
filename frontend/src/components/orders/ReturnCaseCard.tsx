import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';
import { getStepInState, getReturnCaseStatusLabel } from '../../utils/returnCase';
import type { ReturnCase } from '../../services/returnsApi';
import { ReturnCaseActions, type ReturnCaseAction } from './ReturnCaseActions';

interface Props {
  returnCase: ReturnCase;
  /** Only the buyer can request platform step-in. */
  isBuyer: boolean;
  isStepInSubmitting: boolean;
  onStepIn: () => void;
  onOpenLabel: (url: string) => void;
  formatPrice: (amountGbp: number) => string;
  /** Legal state-machine transition dispatch — wired to returnsApi in the
   *  parent. When absent the card renders status only. */
  onAction?: (action: ReturnCaseAction) => void;
  isActionSubmitting?: boolean;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Return/refund status card for the order detail screen. Flat section — a
 * status line, the requested amount, the platform step-in affordance, and
 * the return label when the backend provides one.
 *
 * Step-in copy is truthful by construction: the window shown is the
 * server-computed `stepInEligibleAt`, not a locally assumed duration.
 */
export function ReturnCaseCard({
  returnCase,
  isBuyer,
  isStepInSubmitting,
  onStepIn,
  onOpenLabel,
  formatPrice,
  onAction,
  isActionSubmitting = false }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    title: { color: colors.textPrimary },
    sub: { color: colors.textMuted },
    body: { color: colors.textSecondary },
    divider: { borderTopColor: colors.borderSubtle },
    stepInText: { color: colors.brand },
    labelText: { color: colors.brand } }), [colors]);

  const stepIn = getStepInState(returnCase);
  const statusLabel = getReturnCaseStatusLabel(returnCase);

  // refund_confirmed is only reachable via a succeeded refund execution, so
  // the success checkmark there is honest. remedy_accepted with a refund
  // remedy is "approved — processing", rendered with the in-flight icon.
  const isTerminal = returnCase.status === 'closed' || returnCase.status === 'refund_confirmed';
  const statusIcon = isTerminal
    ? 'checkmark-circle-outline'
    : returnCase.status === 'rejected'
      ? 'close-circle-outline'
      : returnCase.status === 'appealed'
        ? 'shield-outline'
        : 'time-outline';
  const statusColor = isTerminal
    ? colors.success
    : returnCase.status === 'rejected'
      ? colors.danger
      : returnCase.status === 'appealed'
        ? colors.warning
        : colors.brand;

  return (
    <View style={styles.section}>
      {/* Status line */}
      <View style={styles.statusRow}>
        <Ionicons name={statusIcon} size={20} color={statusColor} aria-hidden={true} />
        <View style={styles.statusText}>
          <Text style={[styles.title, themed.title]}>{statusLabel}</Text>
          {returnCase.requestedAmountGbp !== null ? (
            <Text style={[styles.sub, themed.sub]}>
              Requested refund: {formatPrice(returnCase.requestedAmountGbp)}
            </Text>
          ) : (
            <Text style={[styles.sub, themed.sub]}>Full refund requested</Text>
          )}
          {returnCase.status === 'appealed' && returnCase.appealedAt ? (
            <Text style={[styles.sub, themed.sub]}>
              Escalated {formatDateTime(returnCase.appealedAt)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Platform step-in — buyer only, while the case waits on the seller */}
      {isBuyer && stepIn.state === 'pending' && stepIn.eligibleAt ? (
        <Text style={[styles.body, themed.body]}>
          If the seller hasn&apos;t responded by {formatDateTime(stepIn.eligibleAt)}, you
          can ask Thryft to step in.
        </Text>
      ) : null}
      {isBuyer && stepIn.state === 'eligible' ? (
        <Pressable
          style={({ pressed }) => [styles.stepInRow, pressed && styles.pressed]}
          onPress={() => { haptics.tap(); onStepIn(); }}
          disabled={isStepInSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Ask Thryft to step in"
          accessibilityState={{ busy: isStepInSubmitting }}
        >
          <Ionicons name="shield-half-outline" size={18} color={colors.brand} aria-hidden={true} />
          <Text style={[styles.stepInText, themed.stepInText]}>
            {isStepInSubmitting ? 'Requesting…' : 'Ask Thryft to step in'}
          </Text>
        </Pressable>
      ) : null}
      {isBuyer && stepIn.state === 'escalated' ? (
        <Text style={[styles.body, themed.body]}>
          Thryft is reviewing this case and will decide the outcome.
        </Text>
      ) : null}

      {/* Return label — rendered only when the backend provides a URL. */}
      {returnCase.returnLabelUrl ? (
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          onPress={() => { haptics.tap(); onOpenLabel(returnCase.returnLabelUrl!); }}
          accessibilityRole="link"
          accessibilityLabel="Open return shipping label"
        >
          <Ionicons name="pricetag-outline" size={16} color={colors.brand} aria-hidden={true} />
          <Text style={[styles.linkText, themed.labelText]}>Return shipping label</Text>
          <Ionicons name="open-outline" size={14} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      ) : null}

      {/* Return tracking — when the reverse shipment exists */}
      {returnCase.returnTrackingNumber ? (
        <Text style={[styles.body, themed.body]} numberOfLines={1}>
          {returnCase.returnCarrier ? `${returnCase.returnCarrier} · ` : ''}
          {returnCase.returnTrackingNumber}
        </Text>
      ) : null}

      {/* Role/state-legal transitions — the server still re-validates; the
          card only surfaces moves the current status permits. */}
      {onAction ? (
        <ReturnCaseActions
          returnCase={returnCase}
          role={isBuyer ? 'buyer' : 'seller'}
          isSubmitting={isActionSubmitting}
          onAction={onAction}
          formatPrice={formatPrice}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: Space.sm,
    gap: Space.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit },
  statusText: {
    flex: 1,
    gap: Space.xs / 2 },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  sub: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  body: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 3,
    fontFamily: TypographyV2.meta.fontFamily },
  stepInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs,
    minHeight: Control.hit },
  stepInText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs,
    minHeight: Control.hit },
  linkText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  pressed: {
    opacity: 0.6 } });
