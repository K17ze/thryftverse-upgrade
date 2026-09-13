import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { FlagshipHeader } from '../flagship';

export interface PortfolioHeaderProps {
  onBack: () => void;
  /** Opens the order-history surface — the receipt glyph in the header. */
  onOpenActivity: () => void;
}

/**
 * Shared portfolio header — identical across the populated screen and the
 * loading / error / partial / empty scaffold states.
 */
export function PortfolioHeader({ onBack, onOpenActivity }: PortfolioHeaderProps) {
  const { colors } = useAppTheme();
  return (
    <FlagshipHeader
      title="Portfolio"
      onBack={onBack}
      rightAction={
        <AnimatedPressable
          onPress={onOpenActivity}
          scaleValue={0.9}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Activity"
          accessibilityHint="View order history"
        >
          <Ionicons name="receipt-outline" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
      }
    />
  );
}
