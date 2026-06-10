import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Share
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, Radius, Type, Typography, LetterSpacing } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'InviteFriends'>;

const ACCENT = Colors.brand;
const BG = Colors.background;
const CARD = Colors.surface;
const CARD_ALT = Colors.surfaceAlt;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;

export default function InviteFriendsScreen({ navigation }: Props) {
  const inviteLink = 'https://thryftverse.app/invite/user123';
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on Thryftverse - the premium marketplace for second-hand fashion! ${inviteLink}`,
        title: 'Invite to Thryftverse',
      });
    } catch {}
  };

  const handleCopyLink = React.useCallback(async () => {
    await Clipboard.setStringAsync(inviteLink);
    show('Invite link copied to clipboard.', 'success');
  }, [inviteLink, show]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      <ScreenHeader title="Invite friends" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Reanimated.View
          style={styles.heroCard}
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(0).duration(400)}
        >
          <Ionicons name="gift-outline" size={48} color={ACCENT} />
          <Text style={styles.heroTitle}>Invite & earn</Text>
          <Text style={styles.heroSubtitle}>
            Invite friends to Thryftverse. When they make their first sale, you both get a reward.
          </Text>
        </Reanimated.View>

        {/* Share Link */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(100).duration(400)}
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>YOUR INVITE LINK</Text>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} numberOfLines={1}>
                {inviteLink}
              </Text>
              <AnimatedPressable style={styles.copyBtn} onPress={() => void handleCopyLink()}>
                <Ionicons name="copy-outline" size={16} color={ACCENT} />
                <Text style={styles.copyText}>Copy</Text>
              </AnimatedPressable>
            </View>
          </View>
        </Reanimated.View>

        {/* Share Options */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(200).duration(400)}
        >
          <View style={styles.shareRow}>
            {[
              { icon: 'logo-whatsapp', label: 'WhatsApp', color: '#25D366' },
              { icon: 'logo-instagram', label: 'Instagram', color: '#E1306C' },
              { icon: 'mail-outline', label: 'Email', color: ACCENT },
              { icon: 'share-social-outline', label: 'More', color: MUTED },
            ].map(s => (
              <AnimatedPressable key={s.label} style={styles.shareIconBtn} onPress={handleShare}>
                <View style={[styles.shareIconCircle, { borderColor: s.color }]}>
                  <Ionicons name={s.icon as any} size={22} color={s.color} />
                </View>
                <Text style={styles.shareIconLabel}>{s.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: Space.lg },
  heroCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.xl,
    padding: Space.xl,
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  heroTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: Type.title.letterSpacing,
    fontFamily: Typography.family.extrabold,
    color: TEXT,
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  heroSubtitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
    fontFamily: Typography.family.regular,
    color: MUTED,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: LetterSpacing.caps,
    fontFamily: Typography.family.medium,
    color: MUTED,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  section: { marginBottom: Space.lg },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  linkText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  copyText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    letterSpacing: Type.captionElevated.letterSpacing,
    fontFamily: Typography.family.semibold,
    color: ACCENT,
  },
  shareRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Space.xl,
  },
  shareIconBtn: { alignItems: 'center', gap: 6 },
  shareIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_ALT,
  },
  shareIconLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
    fontFamily: Typography.family.medium,
    color: MUTED,
  },
});
