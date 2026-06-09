import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Space, Radius } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PremiumSelectRow } from '../components/ui/PremiumSelectRow';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { EmptyState } from '../components/EmptyState';
import { Headline, Body, Meta } from '../components/ui/Text';

export default function DesignReviewScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Design QA" onBack={() => {}} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Buttons */}
        <SectionTitle>Buttons</SectionTitle>
        <View style={styles.row}>
          <AppButton title="Primary" variant="primary" onPress={() => {}} />
          <AppButton title="Secondary" variant="secondary" onPress={() => {}} />
        </View>
        <View style={styles.row}>
          <AppButton title="Disabled" variant="primary" disabled onPress={() => {}} />
          <AppButton title="Danger" variant="secondary" onPress={() => {}} />
        </View>

        {/* Inputs */}
        <SectionTitle>Inputs</SectionTitle>
        <View style={styles.card}>
          <PremiumTextField label="Name" value="" onChangeText={() => {}} placeholder="Enter name" />
          <PremiumTextField label="Website" value="" onChangeText={() => {}} placeholder="https://" />
        </View>

        {/* Status Pills */}
        <SectionTitle>Status Pills</SectionTitle>
        <View style={styles.rowWrap}>
          <PremiumStatusPill tone="delivered" label="Delivered" />
          <PremiumStatusPill tone="pending" label="Pending" />
          <PremiumStatusPill tone="error" label="Cancelled" />
          <PremiumStatusPill tone="shipped" label="Shipped" />
        </View>

        {/* Empty States */}
        <SectionTitle>Empty States</SectionTitle>
        <View style={[styles.card, { minHeight: 200 }]}>
          <EmptyState
            icon="cube-outline"
            title="No orders yet"
            subtitle="Your orders will appear here."
          />
        </View>

        {/* Surfaces */}
        <SectionTitle>Surfaces</SectionTitle>
        <View style={[styles.surface, { backgroundColor: Colors.surface }]}>
          <Meta>Surface</Meta>
        </View>
        <View style={[styles.surface, { backgroundColor: Colors.surfaceAlt }]}>
          <Meta>Surface Alt</Meta>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Headline style={styles.sectionTitle}>{children}</Headline>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Space.md, paddingBottom: Space.xxl },
  sectionTitle: { marginTop: Space.lg, marginBottom: Space.sm },
  row: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, marginBottom: Space.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  surface: {
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
