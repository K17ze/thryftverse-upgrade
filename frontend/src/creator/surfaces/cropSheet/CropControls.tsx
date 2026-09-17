/**
 * CropControls — ratio chips + tool row + straighten slider for
 * CreatorCropSheet. Extracted verbatim from the sheet's JSX; handlers are
 * passed in as props, theme/haptics are pulled from the same hooks.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { PressScale } from '../../shared/CreatorAnimations';
import { CreatorSlider } from '../../controls';
import { ASPECT_PRESETS, SAFE_ZONES, type CropDestination } from './cropSheetShared';
import { cropSheetStyles as styles } from './cropSheetStyles';

// ─── Crop controls: ratio chips + tool row + straighten slider ──────────────
export function CropControls({
  selectedRatio,
  applyRatio,
  rotation,
  onRotate,
  flippedH,
  flippedV,
  onFlipH,
  onFlipV,
  straighten,
  onStraightenChange,
  onStraightenDragState,
  onStraightenReset,
  destination,
  safeZonesOn,
  onToggleSafeZones }: {
  selectedRatio: number | null;
  applyRatio: (ratio: number | null) => void;
  rotation: number;
  onRotate: () => void;
  flippedH: boolean;
  flippedV: boolean;
  onFlipH: () => void;
  onFlipV: () => void;
  straighten: number;
  onStraightenChange: (value: number) => void;
  onStraightenDragState: (dragging: boolean) => void;
  onStraightenReset: () => void;
  destination?: CropDestination;
  safeZonesOn: boolean;
  onToggleSafeZones: () => void;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const [straightenTool, setStraightenTool] = useState(false);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ratioRow}
      >
        {ASPECT_PRESETS.map((preset) => {
          const active = selectedRatio === preset.ratio;
          return (
            <PressScale
              key={preset.label}
              onPress={() => applyRatio(preset.ratio)}
              style={[
                styles.ratioChip,
                active
                  ? { backgroundColor: colors.surfaceElevated }
                  : { backgroundColor: 'transparent' },
              ]}
              accessibilityLabel={`Aspect ratio ${preset.label}`}
              accessibilityHint="Sets this aspect ratio"
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[
                styles.ratioText,
                { color: active ? colors.textPrimary : colors.scrimTextSecondary },
              ]}>
                {preset.label}
              </Text>
            </PressScale>
          );
        })}
      </ScrollView>

      <View style={styles.toolRow}>
        <PressScale
          onPress={onRotate}
          style={styles.toolBtn}
          accessibilityLabel={`Rotate ${rotation} degrees`}
          accessibilityHint="Rotates the image 90 degrees"
          accessibilityRole="button"
          hitSlop={8}
        >
          <AppIcon
            name="refresh-outline"
            size={IconGrammar.standard}
            color={rotation % 360 !== 0 ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        <PressScale
          onPress={onFlipH}
          style={styles.toolBtn}
          accessibilityLabel="Flip horizontally"
          accessibilityHint="Mirrors the image horizontally"
          accessibilityRole="button"
          accessibilityState={{ selected: flippedH }}
          hitSlop={8}
        >
          <AppIcon
            name="swap-horizontal-outline"
            size={IconGrammar.standard}
            color={flippedH ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        <PressScale
          onPress={onFlipV}
          style={styles.toolBtn}
          accessibilityLabel="Flip vertically"
          accessibilityHint="Mirrors the image vertically"
          accessibilityRole="button"
          accessibilityState={{ selected: flippedV }}
          hitSlop={8}
        >
          <AppIcon
            name="swap-vertical-outline"
            size={IconGrammar.standard}
            color={flippedV ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        <PressScale
          onPress={() => { haptic.selection(); setStraightenTool((v) => !v); }}
          style={styles.toolBtn}
          accessibilityLabel="Straighten"
          accessibilityHint="Adjusts the image rotation"
          accessibilityRole="button"
          accessibilityState={{ selected: straightenTool || straighten !== 0 }}
          hitSlop={8}
        >
          <AppIcon
            name="construct-outline"
            size={IconGrammar.standard}
            color={straightenTool || straighten !== 0 ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
          />
        </PressScale>
        {destination && (
          <PressScale
            onPress={() => { haptic.selection(); onToggleSafeZones(); }}
            style={styles.toolBtn}
            accessibilityLabel={`Safe zones ${safeZonesOn ? 'on' : 'off'} for ${SAFE_ZONES[destination].label}`}
            accessibilityHint="Toggles preview of platform UI regions that will cover this media"
            accessibilityRole="button"
            accessibilityState={{ selected: safeZonesOn }}
            hitSlop={8}
          >
            <AppIcon
              name="shield-checkmark-outline"
              size={IconGrammar.standard}
              color={safeZonesOn ? 'brand' : 'textPrimary'}
              opticalCenter={true}
              accessible={false}
            />
          </PressScale>
        )}
      </View>

      {(straightenTool || straighten !== 0) && (
        <View style={styles.straightenRow}>
          <View style={styles.straightenSlider}>
            <CreatorSlider
              value={straighten}
              min={-30}
              max={30}
              step={0.5}
              neutral={0}
              onValueChange={onStraightenChange}
              onDragStateChange={onStraightenDragState}
              hapticAtNeutral={true}
              showNeutralTick={true}
              accessibilityLabel="Straighten"
              accessibilityHint="Slide to straighten the photo between -30 and 30 degrees"
            />
          </View>
          <Text style={[styles.straightenReadout, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {straighten.toFixed(1)}°
          </Text>
          <PressScale
            onPress={onStraightenReset}
            disabled={straighten === 0}
            style={[styles.straightenReset, { opacity: straighten === 0 ? 0.35 : 1 }]}
            accessibilityLabel="Reset straighten to zero"
            accessibilityHint="Returns the angle to 0 degrees"
            accessibilityRole="button"
            hitSlop={6}
          >
            <AppIcon name="arrow-undo-outline" size={18} color="textPrimary" opticalCenter={true} accessible={false} />
          </PressScale>
        </View>
      )}
    </>
  );
}
