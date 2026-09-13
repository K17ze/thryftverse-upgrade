import React from 'react';

import { AppButton } from '../ui/AppButton';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { createConvertStyles } from './convertStyles';
import type { ConvertStep } from './convertViewModels';

interface Props {
  step: ConvertStep;
  canReview: boolean;
  onReview: () => void;
  onConfirm: () => void;
  onBackToAmount: () => void;
  onDone: () => void;
}

// -- Footer actions per step --
// Sticky-footer actions for the amount (review CTA), review (confirm /
// back) and receipt (done) steps. Auth / executing / error render their
// actions inline instead.
export function ConvertFooter({
  step,
  canReview,
  onReview,
  onConfirm,
  onBackToAmount,
  onDone,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  if (step === 'amount') {
    return (
      <AppButton
        title="Review conversion"
        onPress={onReview}
        disabled={!canReview}
        variant="primary"
        style={[styles.primaryBtn, !canReview && styles.primaryBtnDisabled]}
        titleStyle={styles.primaryText}
        accessibilityLabel="Review conversion"
        accessibilityHint="Proceeds to the conversion review step"
        hapticFeedback="medium"
      />
    );
  }
  if (step === 'review') {
    return (
      <>
        <AppButton
          title="Confirm"
          onPress={onConfirm}
          variant="primary"
          style={styles.primaryBtn}
          titleStyle={styles.primaryText}
          accessibilityLabel="Confirm conversion"
          accessibilityHint="Triggers biometric authentication then executes the conversion"
          hapticFeedback="medium"
        />
        <AppButton
          title="Back to edit"
          onPress={onBackToAmount}
          variant="secondary"
          style={[styles.secondaryBtn, { marginTop: Space.sm }]}
          accessibilityLabel="Back to edit amount"
          accessibilityHint="Returns to the amount input step"
          hapticFeedback="light"
        />
      </>
    );
  }
  if (step === 'receipt') {
    return (
      <AppButton
        title="Done"
        onPress={onDone}
        variant="primary"
        style={styles.primaryBtn}
        titleStyle={styles.primaryText}
        accessibilityLabel="Done"
        accessibilityHint="Returns to the wallet screen"
        hapticFeedback="light"
      />
    );
  }
  return null;
}
