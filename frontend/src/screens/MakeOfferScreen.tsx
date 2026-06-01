import React, { useState } from 'react';
import { Typography } from '../constants/typography';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  StatusBar,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CURRENCIES } from '../constants/currencies';
import { useToast } from '../context/ToastContext';
import {
  calculateOfferSummaryFromDisplay,
  convertGbpToDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { GlassCard } from '../components/ui/GlassSurface';
import { useBackendData } from '../context/BackendDataContext';
import { mockFind } from '../utils/mockGate';
import { MOCK_LISTINGS, MOCK_USERS } from '../data/mockData';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'MakeOffer'>;


const BG = Colors.background;
const CARD = Colors.surface;
const CARD_ALT = Colors.surfaceAlt;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const BRAND = Colors.brand;
const TIP_BG = Colors.surfaceAlt;
const TIP_BORDER = Colors.border;
const FOOTER_BG = Colors.background;

export default function MakeOfferScreen({ navigation, route }: Props) {
  const { itemId, price, title } = route.params;
  const { listings } = useBackendData();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { show } = useToast();
  const currencySymbol = CURRENCIES[currencyCode].symbol;
  const [offerPrice, setOfferPrice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const listing =
    listings.find((listingItem) => listingItem.id === itemId)
    || mockFind(MOCK_LISTINGS, (listingItem) => listingItem.id === itemId)
    || listings[0]
    || MOCK_LISTINGS[0];
  const seller = mockFind(MOCK_USERS, (user) => user.id === listing.sellerId) || MOCK_USERS[0];

  React.useEffect(() => {
    const defaultOffer = convertGbpToDisplayAmount(price, currencyCode, goldRates);
    setOfferPrice((Number.isFinite(defaultOffer) ? defaultOffer : price).toFixed(2));
  }, [currencyCode, goldRates, price]);
  
  const numericOffer = parseFloat(offerPrice) || 0;
  const {
    offerGbp: numericOfferGbp,
    platformChargeGbp,
    totalGbp: total,
  } = calculateOfferSummaryFromDisplay(numericOffer, currencyCode, goldRates);

  const handleOfferChange = (value: string) => {
    setOfferPrice(sanitizeDecimalInput(value));
    if (errorMsg) {
      setErrorMsg('');
    }
  };

  const handleSendOffer = () => {
    if (!numericOffer || !Number.isFinite(numericOfferGbp) || numericOfferGbp <= 0) {
      setErrorMsg('Enter a valid offer amount.');
      return;
    }

    if (numericOfferGbp > price * 2) {
      setErrorMsg('Offer seems too high. Please review the amount.');
      return;
    }

    setErrorMsg('');
    navigation.navigate('MainTabs', { screen: 'Inbox' } as any);
  };

  const handleMessageSeller = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: `offer_${seller.id}_${itemId}`,
      focusQuery: title,
      partnerUserId: seller.id,
    });
    show('Opening seller chat for your offer.', 'info');
  }, [itemId, navigation, seller.id, show, title]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />

      <ScreenHeader
        title="Make Offer"
        onBack={() => navigation.goBack()}
        backIcon="close"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Item Info Context */}
        <GlassCard style={styles.itemCard}>
          <View style={styles.itemThumb}>
            <Ionicons name="shirt-outline" size={24} color={MUTED} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.sellerActionRow}>
              <AnimatedPressable
                style={styles.sellerIdentityChip}
                onPress={() => navigation.navigate('UserProfile', { userId: seller.id })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open @${seller.username} profile`}
                accessibilityHint="Shows seller profile"
              >
                <CachedImage
                  uri={seller.avatar}
                  style={styles.sellerAvatar}
                  containerStyle={styles.sellerAvatarWrap}
                  contentFit="cover"
                />
                <Text style={styles.sellerHandle}>@{seller.username}</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.sellerMessageBtn}
                onPress={handleMessageSeller}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Message seller"
                accessibilityHint="Opens chat with the seller"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={12} color={Colors.textPrimary} />
              </AnimatedPressable>
            </View>
            <Text style={styles.itemListingPrice}>Listed at {formatFromFiat(price, 'GBP')}</Text>
          </View>
        </GlassCard>

        {/* Floating Input Block */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your offer</Text>
          <View style={styles.priceInputRow}>
            <Text style={styles.currencySymbol}>{currencySymbol}</Text>
            <TextInput
              style={styles.priceInput}
              value={offerPrice}
              onChangeText={handleOfferChange}
              keyboardType="decimal-pad"
              selectionColor={BRAND}
              placeholderTextColor={MUTED}
              placeholder="0.00"
            />
          </View>
        </View>

        {/* Spaced Anti-list Platform Charge */}
        <Text style={styles.sectionLabel}>Summary</Text>
        <GlassCard style={styles.protectionCard}>
          <View style={styles.protectionRow}>
            <Ionicons name="shield-checkmark" size={18} color={BRAND} />
            <Text style={styles.protectionLabel}>Platform charge</Text>
            <Text style={styles.protectionValue}>{formatFromFiat(platformChargeGbp, 'GBP')}</Text>
          </View>
          
          <View style={[styles.protectionRow, { marginTop: 12 }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatFromFiat(total, 'GBP')}</Text>
          </View>
          
          <Text style={styles.protectionNote}>
            Includes our platform charge for secure settlement and support.
          </Text>
        </GlassCard>

        {/* Tip Pill */}
        <GlassCard style={styles.tipCard}>
          <View style={styles.tipIconBox}>
            <Ionicons name="bulb" size={16} color={Colors.textInverse} />
          </View>
          <Text style={styles.tipText}>
            Offers within 10% of the listing price are <Text style={{ fontFamily: Typography.family.bold, color: TEXT }}>3x</Text> more likely to be accepted.
          </Text>
        </GlassCard>

        {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      </ScrollView>

      {/* Floating CTA matches CheckoutScreen */}
      <View style={styles.footer}>
        <AppButton
          style={styles.sendBtn}
          title="Send offer"
          subtitle={formatFromFiat(total, 'GBP')}
          icon={<Ionicons name="paper-plane-outline" size={16} color={Colors.textInverse} />}
          variant="primary"
          size="lg"
          onPress={handleSendOffer}
          disabled={numericOffer <= 0}
          accessibilityLabel={`Send offer totaling ${formatFromFiat(total, 'GBP')}`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  
  
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    marginBottom: 32,
    gap: 14,
  },
  itemThumb: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: { fontSize: 18, fontFamily: Typography.family.bold, color: TEXT, marginBottom: 4, maxWidth: '90%' },
  sellerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  sellerIdentityChip: {
    flex: 1,
    minHeight: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerAvatarWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  sellerAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  sellerHandle: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: MUTED,
  },
  sellerMessageBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemListingPrice: { fontSize: 15, fontFamily: Typography.family.medium, color: MUTED },
  
  section: { marginBottom: 32 },
  sectionLabel: { 
    fontSize: 14, 
    fontFamily: Typography.family.bold, 
    color: MUTED, 
    marginBottom: 12, 
    textTransform: 'uppercase', 
    letterSpacing: 1 
  },
  
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: BORDER,
  },
  currencySymbol: { fontSize: 48, fontFamily: Typography.family.bold, color: BRAND, marginRight: 12, marginBottom: 4 },
  priceInput: { 
    flex: 1, 
    fontSize: 56, 
    fontFamily: Typography.family.bold, 
    color: TEXT, 
    paddingVertical: 12,
    letterSpacing: -2,
  },
  
  protectionCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  protectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  protectionLabel: { flex: 1, fontSize: 15, fontFamily: Typography.family.medium, color: MUTED },
  protectionValue: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  
  totalLabel: { flex: 1, fontSize: 18, fontFamily: Typography.family.bold, color: TEXT },
  totalValue: { fontSize: 22, fontFamily: Typography.family.bold, color: BRAND },
  
  protectionNote: { 
    fontSize: 13, 
    fontFamily: Typography.family.regular, 
    color: MUTED, 
    lineHeight: 20, 
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER
  },
  
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TIP_BG,
    borderWidth: 1,
    borderColor: TIP_BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 16,
  },
  tipIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1, fontSize: 14, fontFamily: Typography.family.medium, color: Colors.textSecondary, lineHeight: 20 },
  errorText: {
    marginTop: 14,
    color: Colors.danger,
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  
  footer: { 
    paddingHorizontal: 20, 
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: FOOTER_BG,
  },
  sendBtn: { width: '100%' },
});

