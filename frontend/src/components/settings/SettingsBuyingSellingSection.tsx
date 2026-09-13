import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/** BUYING & SELLING — payments, payouts, orders, co-own, disputes. */
export function SettingsBuyingSellingSection() {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savedAddress = useStore((state) => state.savedAddress);

  return (
    <SettingsSection title={ts('sections.buyingSelling')}>
      <SettingsRow
        icon="location"
        title={ts('rows.savedAddresses')}
        subtitle={savedAddress ? ts('rows.oneSaved') : ts('rows.noneSaved')}
        onPress={() => navigation.navigate('SavedAddresses')}
        isFirst
      />
      <SettingsRow
        icon="card"
        title={ts('rows.paymentMethods')}
        subtitle={savedPaymentMethod ? savedPaymentMethod.label : ts('rows.noneSaved')}
        onPress={() => navigation.navigate('Payments')}
      />
      <SettingsRow
        icon="bookmark"
        title={ts('rows.savedCollections')}
        onPress={() => navigation.navigate('Closet')}
      />
      <SettingsRow
        icon="wallet"
        title={ts('rows.payoutAccount')}
        subtitle={ts('rows.payoutAccountSubtitle')}
        onPress={() => navigation.navigate('Wallet')}
      />
      <SettingsRow
        icon="receipt"
        title={ts('rows.payoutHistory')}
        onPress={() => navigation.navigate('BalanceHistory')}
      />
      <SettingsRow
        icon="box"
        title={ts('rows.shippingPreferences')}
        onPress={() => navigation.navigate('Postage')}
      />
      <SettingsRow
        icon="notifications"
        title={ts('rows.priceAlerts')}
        subtitle={ts('rows.priceAlertsSubtitle')}
        onPress={() => navigation.navigate('CoOwnPriceAlerts')}
      />
      <SettingsRow
        icon="folder"
        title={ts('rows.resolutionCentre')}
        subtitle={ts('rows.resolutionCentreSubtitle')}
        onPress={() => navigation.navigate('ResolutionCentre')}
        isLast
      />
    </SettingsSection>
  );
}
