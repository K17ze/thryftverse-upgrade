import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { AppButton, AppButtonVariant, AppButtonSize } from '../ui/AppButton';
import { Colors } from '../../constants/colors';

export interface ActionItem {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

interface FlagshipActionClusterProps {
  actions: ActionItem[];
  layout?: 'stack' | 'row' | 'row-reverse';
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function FlagshipActionCluster({
  actions,
  layout = 'stack',
  style,
  fullWidth = true,
}: FlagshipActionClusterProps) {
  const isRow = layout === 'row' || layout === 'row-reverse';

  return (
    <View
      style={[
        styles.root,
        isRow ? styles.row : styles.stack,
        layout === 'row-reverse' && styles.rowReverse,
        style,
      ]}
    >
      {actions.map((action, index) => (
        <View
          key={`${action.label}-${index}`}
          style={[
            fullWidth && !isRow ? styles.full : styles.auto,
            isRow && styles.rowItem,
          ]}
        >
          <AppButton
            title={action.label}
            variant={action.variant ?? 'primary'}
            size={action.size ?? 'md'}
            onPress={action.onPress}
            disabled={action.disabled}
            loading={action.loading}
            icon={action.icon}
            hapticFeedback={action.variant === 'danger' ? 'heavy' : 'medium'}
            style={[
              action.variant === 'primary' && styles.primaryShadow,
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space.sm,
  },
  stack: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  full: {
    width: '100%',
  },
  auto: {
    flex: 1,
  },
  rowItem: {
    flex: 1,
  },
  primaryShadow: {
    ...Elevation.floating,
  },
});
