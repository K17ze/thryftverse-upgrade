import React, {
  useState,
  useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles, TEXT_COLORS } from './pickerShared';

// ── Weather Picker ────────────────────────────────────────────────

type WeatherPayload = Extract<CreatorLayer, { type: 'weather' }>['payload'];

export const WeatherPicker = React.memo(function WeatherPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'weather';
  const existingPayload = editingLayer?.type === 'weather' ? editingLayer.payload : null;

  const [temperature, setTemperature] = useState(existingPayload?.temperature ?? 22);
  const [condition, setCondition] = useState(existingPayload?.condition ?? 'Sunny');
  const [emoji, setEmoji] = useState(existingPayload?.emoji ?? '☀️');
  const [locationName, setLocationName] = useState(existingPayload?.locationName ?? '');

  const WEATHER_OPTIONS = [
    { condition: 'Sunny', emoji: '☀️' },
    { condition: 'Partly Cloudy', emoji: '⛅' },
    { condition: 'Cloudy', emoji: '☁️' },
    { condition: 'Rainy', emoji: '🌧️' },
    { condition: 'Stormy', emoji: '⛈️' },
    { condition: 'Snowy', emoji: '❄️' },
    { condition: 'Foggy', emoji: '🌫️' },
    { condition: 'Windy', emoji: '💨' },
  ];

  const handleAdd = useCallback(() => {
    const payload: WeatherPayload = {
      temperature,
      condition,
      emoji,
      locationName: locationName.trim(),
      textColor: TEXT_COLORS[0] };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('weather'), 10),
        type: 'weather',
        width: 0.35,
        height: 0.08,
        payload });
    }
    haptic.medium();
    onClose();
  }, [temperature, condition, emoji, locationName, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Weather' : 'Add Weather'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        {/* Premium weather preview pill */}
        <View style={styles.weatherPreviewPill}>
          <Text style={styles.weatherPreviewEmoji}>{emoji}</Text>
          <View style={styles.weatherPreviewInfo}>
            <Text style={styles.weatherPreviewTemp}>{temperature}°</Text>
            <Text style={styles.weatherPreviewCondition}>{condition}</Text>
          </View>
          {locationName.trim().length > 0 && (
            <View style={styles.weatherPreviewLocation}>
              <Ionicons name="location-outline" size={IconGrammar.badge} color={colors.scrimTextSecondary} aria-hidden={true} />
              <Text style={styles.weatherPreviewLocationText} numberOfLines={1}>{locationName.trim()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.pickerSectionLabel}>Condition</Text>
        <View style={styles.weatherGrid}>
          {WEATHER_OPTIONS.map((w) => {
            const isActive = condition === w.condition;
            return (
              <Pressable
                key={w.condition}
                onPress={() => { haptic.selection(); setCondition(w.condition); setEmoji(w.emoji); }}
                style={({ pressed }) => [
                  styles.weatherCell,
                  isActive && styles.weatherCellActive,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                accessibilityLabel={`Weather ${w.condition}`}
                accessibilityHint="Selects this weather condition"
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.weatherCellEmoji, isActive && { color: colors.scrimTextPrimary }]}>{w.emoji}</Text>
                <Text style={[styles.weatherCellLabel, isActive && { color: colors.scrimTextPrimary }]} numberOfLines={1}>{w.condition}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.inputCardLabel}>Temperature</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.inputCardText}
            placeholder="22"
            placeholderTextColor={colors.textMuted}
            value={String(temperature)}
            onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n)) setTemperature(n); }}
            keyboardType="numeric"
            accessibilityLabel="Temperature"
            accessibilityHint="Type the temperature"
          />
          <Text style={styles.inputCardSuffix}>°C</Text>
        </View>
        <Text style={styles.inputCardLabel}>Location</Text>
        <View style={styles.inputCard}>
          <Ionicons name="location-outline" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
          <TextInput
            style={styles.inputCardText}
            placeholder="London, UK"
            placeholderTextColor={colors.textMuted}
            value={locationName}
            onChangeText={setLocationName}
            maxLength={80}
            accessibilityLabel="Weather location"
            accessibilityHint="Type the location name"
          />
        </View>
        <Pressable onPress={handleAdd} style={styles.saveBtn} accessibilityLabel={isEditing ? 'Update weather' : 'Add weather'}
        accessibilityHint="Saves the weather sticker" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Weather'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
