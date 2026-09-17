/**
 * BackgroundSections — the per-type option sections of BackgroundSheet:
 * Solid (swatches + CreatorColorPicker), Gradient (preset swatches +
 * GradientEditor), Blurred (photo preview + blur slider) and Image
 * (library picker + blur slider). Extracted verbatim from
 * BackgroundSheet.tsx.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { CreatorColorPicker, GradientEditor } from '../../color/';
import type { CreatorColor, GradientDefinition, RecentColor } from '../../color/';
import type { CreatorBackground } from '../../core/projectStore/composition';
import { SOLID_SWATCHES, GRADIENT_PRESETS } from './backgroundSheetShared';
import type { createStyles } from './backgroundSheetStyles';

// ── Solid ───────────────────────────────────────────────────────────

interface SolidSectionProps {
  styles: ReturnType<typeof createStyles>;
  activeSolidValue: string | null;
  solidColor: CreatorColor;
  recents: RecentColor[];
  onSolidSelect: (value: string) => void;
  onSolidColorChange: (color: CreatorColor) => void;
  onSolidColorCommit: (color: CreatorColor) => void;
  onCommitRecent: (color: CreatorColor) => void;
}

export function SolidSection({
  styles,
  activeSolidValue,
  solidColor,
  recents,
  onSolidSelect,
  onSolidColorChange,
  onSolidColorCommit,
  onCommitRecent }: SolidSectionProps) {
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.swatchRow}
      >
        {SOLID_SWATCHES.map((sw) => {
          const isActive = activeSolidValue === sw.value;
          return (
            <Pressable
              key={sw.value}
              onPress={() => onSolidSelect(sw.value)}
              style={styles.swatchWrap}
              accessibilityLabel={`${sw.label} background${isActive ? ', selected' : ''}`}
              accessibilityHint="Applies this background color"
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.swatch,
                  isActive && styles.swatchActive,
                ]}
              >
                <View style={[styles.swatchFill, { backgroundColor: sw.value }]} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Shared CreatorColorPicker — compact row with HEX, eyedropper, recents, alpha */}
      <View style={styles.colorPickerSection}>
        <CreatorColorPicker
          color={solidColor}
          onChange={onSolidColorChange}
          onCommit={onSolidColorCommit}
          mode="compact"
          recents={recents}
          onCommitRecent={onCommitRecent}
          accessibilityLabel="Background solid color"
          accessibilityHint="Choose a background color"
        />
      </View>
    </View>
  );
}

// ── Gradient ────────────────────────────────────────────────────────

interface GradientSectionProps {
  styles: ReturnType<typeof createStyles>;
  draft: CreatorBackground;
  gradientDef: GradientDefinition;
  onGradientPresetSelect: (value: string, secondaryValue: string) => void;
  onGradientChange: (g: GradientDefinition) => void;
  onGradientCommit: (g: GradientDefinition) => void;
}

export function GradientSection({
  styles,
  draft,
  gradientDef,
  onGradientPresetSelect,
  onGradientChange,
  onGradientCommit }: GradientSectionProps) {
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.swatchRow}
      >
        {GRADIENT_PRESETS.map((g) => {
          // A preset is "active" if the draft matches and no custom stops.
          const isActive = draft.value === g.value &&
            draft.secondaryValue === g.secondaryValue &&
            !draft.gradientStops;
          return (
            <Pressable
              key={g.label}
              onPress={() => onGradientPresetSelect(g.value, g.secondaryValue)}
              style={styles.swatchWrap}
              accessibilityLabel={`${g.label} gradient${isActive ? ', selected' : ''}`}
              accessibilityHint="Applies this gradient"
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.swatch,
                  isActive && styles.swatchActive,
                ]}
              >
                <LinearGradient
                  colors={[g.value, g.secondaryValue]}
                  style={styles.swatchFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <GradientEditor
        gradient={gradientDef}
        onChange={onGradientChange}
        onCommit={onGradientCommit}
      />
    </View>
  );
}

// ── Blurred ─────────────────────────────────────────────────────────

interface BlurSectionProps {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  blurPreviewUri: string;
  blurRadius: number;
  onBlurRadiusChange: (radius: number) => void;
}

export function BlurSection({
  styles,
  colors,
  blurPreviewUri,
  blurRadius,
  onBlurRadiusChange }: BlurSectionProps) {
  return (
    <View>
      <Text style={styles.sectionLabel}>Blurred photo</Text>
      {blurPreviewUri ? (
        <View style={styles.blurPreviewWrap}>
          <Image
            source={{ uri: blurPreviewUri }}
            style={styles.blurPreview}
            contentFit="cover"
            blurRadius={blurRadius}
            cachePolicy="memory-disk"
          />
          <Text style={[styles.blurHint, { color: colors.textMuted }]}>
            Blurred version of your first photo
          </Text>
        </View>
      ) : (
        <View style={[styles.blurEmpty, { borderColor: colors.border }]}>
          <Text style={[styles.blurEmptyText, { color: colors.textMuted }]}>
            Add a photo to the canvas first
          </Text>
        </View>
      )}
      <View style={styles.sliderRow}>
        <View style={styles.sliderHeader}>
          <Text style={[styles.sliderLabel, { color: colors.textPrimary }]}>
            Blur intensity
          </Text>
          <Text style={[styles.sliderValue, { color: colors.textMuted }]}>
            {blurRadius}
          </Text>
        </View>
        <CreatorSlider
          value={blurRadius}
          min={0}
          max={50}
          step={1}
          onValueChange={onBlurRadiusChange}
          onCommit={onBlurRadiusChange}
          accessibilityLabel="Background blur intensity"
          accessibilityHint="Adjusts the blur amount"
        />
      </View>
    </View>
  );
}

// ── Image ───────────────────────────────────────────────────────────

interface ImageSectionProps {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  imageUri: string | null;
  imageBlur: number;
  isPickingImage: boolean;
  onPickImage: () => void;
  onImageBlurChange: (blur: number) => void;
}

export function ImageSection({
  styles,
  colors,
  imageUri,
  imageBlur,
  isPickingImage,
  onPickImage,
  onImageBlurChange }: ImageSectionProps) {
  return (
    <View>
      <Text style={styles.sectionLabel}>Background photo</Text>
      {imageUri ? (
        <View style={styles.imagePreviewWrap}>
          <Image
            source={{ uri: imageUri }}
            style={styles.imagePreview}
            contentFit="cover"
            blurRadius={imageBlur}
            cachePolicy="memory-disk"
          />
          <PressScale
            onPress={onPickImage}
            style={[styles.imageChangeBtn, { borderColor: colors.border }]}
            accessibilityLabel="Change image"
            accessibilityHint="Opens the photo library to pick a different background image"
          >
            <Ionicons name="swap-horizontal-outline" size={IconGrammar.metadata} color={colors.textPrimary} />
            <Text style={[styles.imageChangeBtnText, { color: colors.textPrimary }]}>
              {isPickingImage ? 'Opening…' : 'Change Image'}
            </Text>
          </PressScale>
        </View>
      ) : (
        <PressScale
          onPress={onPickImage}
          style={[styles.imagePickerEmpty, { borderColor: colors.border }]}
          accessibilityLabel="Pick a background photo"
          accessibilityHint="Opens the photo library to select a background image"
        >
          <Text style={[styles.imagePickerEmptyTitle, { color: colors.textPrimary }]}>
            {isPickingImage ? 'Opening photo library…' : 'Choose from library'}
          </Text>
          <Text style={[styles.imagePickerEmptyHint, { color: colors.textMuted }]}>
            Tap to browse your photos
          </Text>
        </PressScale>
      )}
      {imageUri && (
        <View style={styles.sliderRow}>
          <CreatorSlider
            value={imageBlur}
            min={0}
            max={20}
            step={1}
            onValueChange={onImageBlurChange}
            onCommit={onImageBlurChange}
            label="Blur"
            accessibilityLabel="Background image blur intensity"
            accessibilityHint="Adjusts the image blur"
          />
        </View>
      )}
    </View>
  );
}
