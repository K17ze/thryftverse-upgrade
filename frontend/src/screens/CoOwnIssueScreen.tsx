import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppInput } from '../components/ui/AppInput';
import { useToast } from '../context/ToastContext';
import { FlagshipEmptyGraphic, FlagshipActionCluster } from '../components/flagship';

type Props = StackScreenProps<RootStackParamList, 'CoOwnIssue'>;

const CATEGORIES = [
  { value: 'dispute', label: 'Ownership Dispute', icon: 'shield-half-outline' as const },
  { value: 'technical', label: 'Technical Problem', icon: 'bug-outline' as const },
  { value: 'fraud', label: 'Fraud / Scam', icon: 'warning-outline' as const },
  { value: 'other', label: 'Other', icon: 'chatbox-ellipses-outline' as const },
];

export default function CoOwnIssueScreen({ navigation, route }: Props) {
  const { show } = useToast();
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const assetId = route.params?.assetId;

  const handleSubmit = () => {
    if (!category) {
      show('Select an issue category', 'error');
      return;
    }
    if (!description.trim()) {
      show('Describe the issue', 'error');
      return;
    }
    setIsSubmitting(true);
    // Honest local-only handling — no fake backend call
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 800);
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <ScreenHeader title="Report Issue" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <FlagshipEmptyGraphic variant="box" size={140} />
          <Text style={styles.successTitle}>Report recorded</Text>
          <Text style={styles.successSub}>
            Your issue has been logged locally. Support connection is required for escalation.
          </Text>
          <FlagshipActionCluster
            actions={[
              { label: 'Back to Asset', onPress: () => navigation.goBack(), variant: 'primary' },
              { label: 'Contact Support', onPress: () => navigation.navigate('HelpSupport'), variant: 'secondary' },
            ]}
            style={{ marginTop: Space.lg, width: '100%', paddingHorizontal: Space.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      <ScreenHeader title="Report Issue" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {assetId && (
          <Reanimated.View entering={FadeInDown.duration(300)} style={styles.assetContext}>
            <Ionicons name="pricetag-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.assetContextText}>Asset: {assetId}</Text>
          </Reanimated.View>
        )}

        <Reanimated.View entering={FadeInDown.duration(300).delay(50)}>
          <Text style={styles.sectionLabel}>Issue Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const active = category === cat.value;
              return (
                <AnimatedPressable
                  key={cat.value}
                  style={[styles.categoryCard, active && styles.categoryCardActive]}
                  onPress={() => setCategory(cat.value)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={cat.icon} size={22} color={active ? Colors.brand : Colors.textSecondary} />
                  <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{cat.label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(100)} style={{ marginTop: Space.lg }}>
          <AppInput
            label="Description"
            placeholder="Describe what happened and what you need..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            containerStyle={{ marginBottom: 0 }}
          />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(150)} style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            Submission requires a support backend connection. This form logs your report locally.
          </Text>
        </Reanimated.View>

        <FlagshipActionCluster
          actions={[
            { label: isSubmitting ? 'Recording...' : 'Record Report', onPress: handleSubmit, variant: 'primary', disabled: isSubmitting, loading: isSubmitting },
          ]}
          style={{ marginTop: Space.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.lg },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.lg,
  },
  successTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: Space.sm },
  successSub: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, textAlign: 'center' },

  assetContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.sm,
    marginBottom: Space.md,
  },
  assetContextText: { fontSize: Type.caption.size, fontFamily: Typography.family.medium, color: Colors.textSecondary },

  sectionLabel: { fontSize: Type.meta.size, fontFamily: Typography.family.semibold, color: Colors.textMuted, marginBottom: Space.sm, textTransform: 'uppercase', letterSpacing: 0.5 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  categoryCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  categoryCardActive: { borderColor: Colors.brand, backgroundColor: Colors.surfaceAlt },
  categoryLabel: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  categoryLabelActive: { color: Colors.brand },

  note: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, lineHeight: 18 },
});