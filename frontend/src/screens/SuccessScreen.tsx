import React, { useEffect } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { Confetti } from '../components/Confetti';
import { useToast } from '../context/ToastContext';
import { MOCK_USERS } from '../data/mockData';
import { CachedImage } from '../components/CachedImage';
import { Typography } from '../theme/designTokens';

export default function SuccessScreen() {
  const navigation = useNavigation<any>();
  const { show } = useToast();
  const supportUser = MOCK_USERS[0];

  const handleOpenOrderSupport = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: 'c1',
      focusQuery: 'post-checkout support',
      partnerUserId: supportUser.id,
    });
    show('Opening support chat for your order.', 'info');
  }, [navigation, show, supportUser.id]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      <Confetti />
      
      <View style={styles.centerContent}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={48} color={Colors.background} />
        </View>
        
        <Text style={styles.title}>Payment Successful</Text>
        <Text style={styles.subtitle}>
          Your order has been placed successfully.{'\n'}
          The seller has 5 working days to send the parcel.
        </Text>

        <View style={styles.supportRow}>
          <AnimatedPressable
            style={styles.supportIdentity}
            onPress={() => navigation.navigate('UserProfile', { userId: supportUser.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Open @${supportUser.username} profile`}
            accessibilityHint="Shows support profile"
          >
            <CachedImage
              uri={supportUser.avatar}
              style={styles.supportAvatar}
              containerStyle={styles.supportAvatarWrap}
              contentFit="cover"
            />
            <Text style={styles.supportText}>Need help? @{supportUser.username}</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.supportMessageBtn}
            onPress={handleOpenOrderSupport}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Message support"
            accessibilityHint="Opens support chat for order help"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={12} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </View>

      <View style={styles.footer}>
        <AnimatedPressable 
          style={styles.primaryBtn} 
          activeOpacity={0.9} 
          onPress={() => navigation.navigate('MyOrders')}
        >
          <Text style={styles.primaryText}>Track Order</Text>
        </AnimatedPressable>
        
        <AnimatedPressable 
          style={styles.secondaryBtn} 
          activeOpacity={0.8}
          onPress={() => navigation.navigate('MainTabs')}
        >
          <Text style={styles.secondaryText}>Continue Browsing</Text>
        </AnimatedPressable>
      </View>
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
    marginBottom: 32 
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
    borderRadius: 14,
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
  supportAvatar: {
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
  primaryBtn: { backgroundColor: Colors.textPrimary, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.background, fontSize: 16, fontFamily: Typography.family.bold },
  secondaryBtn: { backgroundColor: 'transparent', height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: Colors.textPrimary, fontSize: 16, fontFamily: Typography.family.semibold },
});
