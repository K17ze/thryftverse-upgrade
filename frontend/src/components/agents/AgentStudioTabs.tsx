import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type AgentStudioTab = 'agents' | 'connections' | 'device';
const sections = [
  { key: 'agents', label: 'Agents' },
  { key: 'connections', label: 'Connections' },
  { key: 'device', label: 'Device tools' },
] as const;

export function AgentStudioTabs({ selected, onSelect }: { selected: AgentStudioTab; onSelect: (tab: AgentStudioTab) => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.rail, { borderBottomColor: colors.borderSubtle }]}>
      {sections.map(({ key, label }) => (
        <Pressable key={key} onPress={() => onSelect(key)} accessibilityRole="tab" accessibilityState={{ selected: selected === key }}
          style={({ pressed }) => [styles.tab, { borderBottomColor: selected === key ? colors.textPrimary : 'transparent', opacity: pressed ? 0.65 : 1 }]}>
          <Text style={[styles.label, { color: selected === key ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  rail: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: Space.md },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Space.xs, paddingVertical: Space.sm, borderBottomWidth: 2 },
  label: { fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, fontFamily: FontFamily.medium, textAlign: 'center' },
});
