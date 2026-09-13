import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';
import { createFilterStyles } from './filterStyles';

interface Props {
  /** !hasActiveSelection — disables and dims Reset. */
  resetDisabled: boolean;
  onReset: () => void;
  /** 'Loading options...' | 'Apply filters' | `Show ${count} items`. */
  applyLabel: string;
  /** showFilterLoadingState — disables and dims Apply. */
  applyDisabled: boolean;
  onApply: () => void;
}

// Sticky bottom action — Reset + Apply side by side.
function FilterFooterBase({ resetDisabled, onReset, applyLabel, applyDisabled, onApply }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <View style={styles.footer}>
      <AppButton
        style={[styles.resetBtn, resetDisabled && styles.resetBtnDisabled]}
        title="Reset"
        titleStyle={[styles.resetBtnText, resetDisabled && styles.resetBtnTextDisabled]}
        onPress={onReset}
        disabled={resetDisabled}
        variant="secondary"
        size="lg"
        accessibilityLabel="Reset all filters"
      />
      <AppButton
        style={[styles.applyBtn, applyDisabled && styles.applyBtnDisabled]}
        title={applyLabel}
        titleStyle={[styles.applyBtnText, applyDisabled && styles.applyBtnTextDisabled]}
        onPress={onApply}
        disabled={applyDisabled}
        variant="primary"
        size="lg"
        align="center"
        accessibilityLabel={applyLabel}
      />
    </View>
  );
}

const FilterFooter = React.memo(FilterFooterBase);
FilterFooter.displayName = 'FilterFooter';
export { FilterFooter };
