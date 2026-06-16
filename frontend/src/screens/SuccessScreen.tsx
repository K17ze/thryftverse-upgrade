import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { Confetti } from '../components/Confetti';
import { useToast } from '../context/ToastContext';
import { Typography } from '../theme/designTokens';
import { FlagshipActionCluster } from '../components/flagship';
import { Space, Radius } from '../theme/designTokens';

export default function SuccessScreen() {
  const navigation = useNavigation<any>();
  const { show } = useToast();

  const handleOpenSupport = React.useCallback(() => {
    navigation.navigate('HelpSupport');
    show('Opening support.', 'info');
  }, [navigation, show]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      <Confetti />

      <View style={styles.centerContent}>
        <Reanimated.View entering={FadeInDown.duration(400)} style={styles.iconCircle}>
          <Ionicons name="checkmark" size={48} color={Colors.background} />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(400).delay(80)}>
          <Text style={styles.title}>Payment Successful</Text>
          <Text style={styles.subtitle}>
            Your order has been placed successfully.{ '\n' }
            The seller has 5 working days to send the parcel.
          </Text>
        </Reanimated.View>

        <Reanimated.View
          entering={FadeInDown.duration(400).delay(160)}
          style={styles.supportRow}
        >
          <View style={styles.supportIdentity}>
            <View style={[styles.supportAvatarWrap, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.textSecondary} />
            </View>
            <Text style={styles.supportText}>Need help? Visit support</Text>
          </View>

          <View style={styles.supportMessageBtn}>
            <Ionicons name="chevron-forward" size={14} color={Colors.textPrimary} />
          </View>
        </Reanimated.View>
      </View>

      <Reanimated.View entering={FadeInDown.duration(400).delay(240)} style={styles.footer}>
        <FlagshipActionCluster
          actions={[
            { label: 'Track Order', onPress: () => navigation.navigate('MyOrders'), variant: 'primary' },
            { label: 'Continue Browsing', onPress: () => navigation.navigate('MainTabs'), variant: 'secondary' },
          ]}
          layout="stack"
        />
      </Reanimated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, justifyContent: 'space-between' },

  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },

  title: { fontSize: 28, fontFamily: Typography.family.bold, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: Typography.family.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  supportRow: {
    marginTop: 18,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  supportIdentity: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportAvatarWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  supportText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  supportMessageBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
});