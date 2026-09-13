import React from 'react';
import { View, Text, ScrollView } from 'react-native';

import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import type { DynamicSignalChip } from '../../services/algorithmicSignalsService';
import type { BrowseStyles } from './browseStyles';

interface BrowseSignalRailProps {
  styles: BrowseStyles;
  signals: DynamicSignalChip[];
  activeSignal: DynamicSignalChip;
  onSelectSignal: (signal: DynamicSignalChip) => void;
}

export function BrowseSignalRail({
  styles,
  signals,
  activeSignal,
  onSelectSignal }: BrowseSignalRailProps) {
  const haptic = useHaptic();

  return (
    <View style={styles.signalSubRail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.signalSubRailContent}
        accessibilityRole="tablist"
        accessibilityLabel="Browse style suggestions"
      >
        {signals.map((signal) => {
          const isSelected = activeSignal.filterKey === signal.filterKey;
          return (
            <AnimatedPressable
              key={`browse-signal-${signal.id}-${signal.filterKey}`}
              style={[
                styles.signalSubChip,
                isSelected && styles.signalSubChipActive,
                signal.isPersonalized && !isSelected && styles.signalSubChipPersonalized,
              ]}
              onPress={() => {
                haptic.selection();
                onSelectSignal(signal);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${signal.label}${signal.isPersonalized ? ', personalized' : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              {signal.isPersonalized && signal.kind !== 'all' ? (
                <View style={[styles.signalSubDot, isSelected && styles.signalSubDotActive]} />
              ) : null}
              <Text
                style={[
                  styles.signalSubText,
                  isSelected && styles.signalSubTextActive,
                ]}
               maxFontSizeMultiplier={2}>
                {signal.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
