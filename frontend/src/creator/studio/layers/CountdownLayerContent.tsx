import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Typography, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Countdown layer content ────────────────────────────────────────
// Countdown to a date/time with live timer.
export function CountdownLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'countdown' }> }) {
  const { payload } = layer;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endMs = new Date(payload.endDateTime).getTime();
  const remaining = Math.max(0, endMs - now);
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const days = Math.floor(hours / 24);
  const displayHours = hours % 24;

  const timeStr = days > 0
    ? `${days}d ${displayHours}h ${mins}m`
    : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={[countdownStyles.container, { backgroundColor: payload.color }]} accessibilityLabel={`Countdown, ${payload.label}, ${timeStr}`} accessibilityRole="timer" accessibilityHint="Counts down to the set end date">
      <View style={countdownStyles.iconRow}>
        <Ionicons name="time-outline" size={IconGrammar.badge} color={payload.textColor} aria-hidden={true} />
        <Text style={countdownStyles.label}>{payload.label}</Text>
      </View>
      <Text style={countdownStyles.time}>{timeStr}</Text>
    </View>
  );
}

const countdownStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    minWidth: 150,
    maxWidth: '100%',
    alignItems: 'center' },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2 },
  label: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.3,
    textTransform: 'uppercase' },
  time: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.screenTitle.size,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5 } });
