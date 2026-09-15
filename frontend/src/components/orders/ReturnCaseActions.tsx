import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppInput } from '../ui/AppInput';
import { haptics } from '../../utils/haptics';
import type { ReturnCase, ReturnCaseStatus, ReturnRemedy } from '../../services/returnsApi';
import type { OrderRole } from './orderCapabilities';

/**
 * Legal state-machine transitions for a return case — mirrors
 * backend routes/returns.ts VALID_TRANSITIONS. Every action the card
 * renders maps 1:1 to a server route; nothing here invents a transition.
 */
export type ReturnCaseAction =
  | { type: 'decision'; decision: 'approved' | 'rejected'; reason: string }
  | { type: 'reverse_shipment'; carrier: string; trackingNumber: string; labelUrl?: string }
  | { type: 'receipt' }
  | { type: 'inspection'; notes: string; condition: string }
  | { type: 'remedy'; remedy: ReturnRemedy; amountGbp?: number; notes?: string }
  | { type: 'remedy_accept' }
  | { type: 'remedy_reject'; reason: string }
  | { type: 'appeal'; reason: string };

type FormKind =
  | 'decision_approved'
  | 'decision_rejected'
  | 'shipment'
  | 'inspection'
  | 'remedy'
  | 'appeal'
  | 'remedy_reject';

const REMEDY_OPTIONS: { remedy: ReturnRemedy; label: string }[] = [
  { remedy: 'full_refund', label: 'Full refund' },
  { remedy: 'partial_refund', label: 'Partial refund' },
  { remedy: 'replacement', label: 'Replacement' },
  { remedy: 'repair', label: 'Repair' },
  { remedy: 'reject', label: 'No refund' },
];

function remedyLabel(remedy: ReturnRemedy | null): string {
  switch (remedy) {
    case 'full_refund': return 'Full refund';
    case 'partial_refund': return 'Partial refund';
    case 'replacement': return 'Replacement';
    case 'repair': return 'Repair';
    case 'reject': return 'No refund offered';
    default: return 'Remedy pending';
  }
}

interface ActionRowProps {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface Props {
  returnCase: ReturnCase;
  role: OrderRole;
  isSubmitting: boolean;
  onAction: (action: ReturnCaseAction) => void;
  formatPrice: (amountGbp: number) => string;
}

/**
 * Per-role, per-status transition controls for the return case card.
 * Only transitions legal for the current status are rendered — the server
 * still re-validates (409 on an illegal move), so this is a UX mirror, not
 * a second source of truth.
 */
export function ReturnCaseActions({ returnCase, role, isSubmitting, onAction, formatPrice }: Props) {
  const { colors } = useAppTheme();
  const [activeForm, setActiveForm] = useState<FormKind | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [carrierText, setCarrierText] = useState('');
  const [trackingText, setTrackingText] = useState('');
  const [labelUrlText, setLabelUrlText] = useState('');
  const [conditionText, setConditionText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [remedyChoice, setRemedyChoice] = useState<ReturnRemedy>('full_refund');
  const [remedyAmountText, setRemedyAmountText] = useState('');

  const styles = useMemo(() => createStyles(), []);
  const status: ReturnCaseStatus = returnCase.status;
  const isBuyer = role === 'buyer';

  const openForm = (kind: FormKind, presetReason = '') => {
    haptics.tap();
    setReasonText(presetReason);
    setActiveForm(kind);
  };

  const submit = (action: ReturnCaseAction) => {
    haptics.tap();
    onAction(action);
  };

  const ActionRow = ({ label, icon, onPress, disabled, danger }: ActionRowProps) => (
    <Pressable
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled || isSubmitting}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: isSubmitting }}
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.brand} aria-hidden={true} />
      <Text style={[styles.actionText, { color: danger ? colors.danger : colors.brand }]}>{label}</Text>
    </Pressable>
  );

  const FormShell = ({ children, submitLabel, submitDisabled, onSubmit }: {
    children: React.ReactNode;
    submitLabel: string;
    submitDisabled?: boolean;
    onSubmit: () => void;
  }) => (
    <View style={styles.form}>
      {children}
      <View style={styles.formActions}>
        <Pressable
          onPress={() => setActiveForm(null)}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [styles.formCancel, pressed && styles.pressed]}
        >
          <Text style={[styles.formCancelText, { color: colors.textMuted }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={isSubmitting || submitDisabled}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ busy: isSubmitting, disabled: isSubmitting || !!submitDisabled }}
          style={({ pressed }) => [
            styles.formSubmit,
            { backgroundColor: colors.brand },
            (pressed || isSubmitting || submitDisabled) && styles.pressed,
          ]}
        >
          <Text style={[styles.formSubmitText, { color: colors.textInverse }]}>
            {isSubmitting ? 'Submitting…' : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Seller transitions ──
  if (!isBuyer) {
    return (
      <View style={styles.container}>
        {(status === 'requested' || status === 'evidence_review') && (
          <>
            <ActionRow
              label="Approve return"
              icon="checkmark-circle-outline"
              onPress={() => openForm('decision_approved', 'Return approved')}
            />
            <ActionRow
              label="Decline return"
              icon="close-circle-outline"
              danger
              onPress={() => openForm('decision_rejected')}
            />
          </>
        )}
        {status === 'approved' && (
          <ActionRow
            label="Add return tracking"
            icon="cube-outline"
            onPress={() => openForm('shipment')}
          />
        )}
        {status === 'reverse_shipped' && (
          <ActionRow
            label="Item received"
            icon="archive-outline"
            onPress={() => submit({ type: 'receipt' })}
          />
        )}
        {status === 'received' && (
          <ActionRow
            label="Record inspection"
            icon="search-outline"
            onPress={() => openForm('inspection')}
          />
        )}
        {status === 'inspected' && (
          <ActionRow
            label="Propose remedy"
            icon="cash-outline"
            onPress={() => openForm('remedy')}
          />
        )}

        {activeForm === 'decision_approved' || activeForm === 'decision_rejected' ? (
          <FormShell
            submitLabel={activeForm === 'decision_approved' ? 'Approve' : 'Decline'}
            submitDisabled={!reasonText.trim()}
            onSubmit={() =>
              submit({
                type: 'decision',
                decision: activeForm === 'decision_approved' ? 'approved' : 'rejected',
                reason: reasonText.trim(),
              })
            }
          >
            <AppInput
              appearance="outline"
              placeholder={activeForm === 'decision_approved' ? 'Note for the buyer' : 'Reason for declining'}
              value={reasonText}
              onChangeText={setReasonText}
              maxLength={1000}
              multiline
            />
          </FormShell>
        ) : null}

        {activeForm === 'shipment' ? (
          <FormShell
            submitLabel="Save tracking"
            submitDisabled={!carrierText.trim() || !trackingText.trim()}
            onSubmit={() =>
              submit({
                type: 'reverse_shipment',
                carrier: carrierText.trim(),
                trackingNumber: trackingText.trim(),
                labelUrl: labelUrlText.trim() || undefined,
              })
            }
          >
            <AppInput appearance="outline" placeholder="Carrier (e.g. Royal Mail)" value={carrierText} onChangeText={setCarrierText} maxLength={100} />
            <AppInput appearance="outline" placeholder="Tracking number" value={trackingText} onChangeText={setTrackingText} maxLength={200} autoCapitalize="characters" />
            <AppInput appearance="outline" placeholder="Return label URL (optional)" value={labelUrlText} onChangeText={setLabelUrlText} keyboardType="url" autoCapitalize="none" />
          </FormShell>
        ) : null}

        {activeForm === 'inspection' ? (
          <FormShell
            submitLabel="Record inspection"
            submitDisabled={!notesText.trim() || !conditionText.trim()}
            onSubmit={() =>
              submit({ type: 'inspection', notes: notesText.trim(), condition: conditionText.trim() })
            }
          >
            <AppInput appearance="outline" placeholder="Condition (e.g. as described, damaged)" value={conditionText} onChangeText={setConditionText} maxLength={100} />
            <AppInput appearance="outline" placeholder="Inspection notes" value={notesText} onChangeText={setNotesText} maxLength={2000} multiline />
          </FormShell>
        ) : null}

        {activeForm === 'remedy' ? (
          <FormShell
            submitLabel="Propose remedy"
            submitDisabled={
              remedyChoice === 'partial_refund' &&
              (!remedyAmountText.trim() || !Number.isFinite(Number(remedyAmountText)) || Number(remedyAmountText) <= 0)
            }
            onSubmit={() =>
              submit({
                type: 'remedy',
                remedy: remedyChoice,
                amountGbp:
                  remedyChoice === 'partial_refund' ? Number(remedyAmountText) : undefined,
                notes: notesText.trim() || undefined,
              })
            }
          >
            <View style={styles.remedyChips}>
              {REMEDY_OPTIONS.map((option) => {
                const selected = remedyChoice === option.remedy;
                return (
                  <Pressable
                    key={option.remedy}
                    onPress={() => { haptics.tap(); setRemedyChoice(option.remedy); }}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.remedyChip,
                      { borderColor: selected ? colors.brand : colors.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.remedyChipText, { color: selected ? colors.brand : colors.textSecondary }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {remedyChoice === 'partial_refund' ? (
              <AppInput
                appearance="outline"
                placeholder="Refund amount (£)"
                value={remedyAmountText}
                onChangeText={setRemedyAmountText}
                keyboardType="decimal-pad"
              />
            ) : null}
            <AppInput appearance="outline" placeholder="Notes for the buyer (optional)" value={notesText} onChangeText={setNotesText} maxLength={2000} multiline />
          </FormShell>
        ) : null}
      </View>
    );
  }

  // ── Buyer transitions ──
  return (
    <View style={styles.container}>
      {status === 'remedy_proposed' && (
        <View style={styles.remedySummary}>
          <Text style={[styles.remedySummaryTitle, { color: colors.textPrimary }]}>
            {remedyLabel(returnCase.proposedRemedy)}
            {returnCase.remedyAmountGbp != null ? ` · ${formatPrice(returnCase.remedyAmountGbp)}` : ''}
          </Text>
          <ActionRow
            label="Accept remedy"
            icon="checkmark-circle-outline"
            onPress={() => submit({ type: 'remedy_accept' })}
          />
          <ActionRow
            label="Decline — ask Thryft to review"
            icon="shield-half-outline"
            onPress={() => openForm('remedy_reject')}
          />
        </View>
      )}
      {status === 'rejected' && (
        <ActionRow
          label="Appeal this decision"
          icon="shield-half-outline"
          onPress={() => openForm('appeal')}
        />
      )}

      {activeForm === 'appeal' || activeForm === 'remedy_reject' ? (
        <FormShell
          submitLabel={activeForm === 'appeal' ? 'Submit appeal' : 'Decline remedy'}
          submitDisabled={!reasonText.trim()}
          onSubmit={() =>
            submit(
              activeForm === 'appeal'
                ? { type: 'appeal', reason: reasonText.trim() }
                : { type: 'remedy_reject', reason: reasonText.trim() }
            )
          }
        >
          <AppInput
            appearance="outline"
            placeholder={activeForm === 'appeal' ? 'Why are you appealing?' : 'Why is this remedy not acceptable?'}
            value={reasonText}
            onChangeText={setReasonText}
            maxLength={1000}
            multiline
          />
        </FormShell>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    gap: Space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
  },
  actionText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  pressed: {
    opacity: 0.6,
  },
  form: {
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Space.sm,
  },
  formCancel: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  formCancelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  formSubmit: {
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.md,
    borderRadius: 10,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  formSubmitText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  remedyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  remedyChip: {
    borderWidth: Stroke.standard,
    borderRadius: 999,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm + 2,
  },
  remedyChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  remedySummary: {
    gap: Space.xs,
  },
  remedySummaryTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
});
