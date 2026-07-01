import React from 'react';
import { useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';

type NavT = StackNavigationProp<RootStackParamList>;

export default function TradeHubScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute();

  React.useEffect(() => {
    const params = (route.params as { destination?: 'auction' | 'co_own' }) ?? {};
    if (params.destination === 'co_own') {
      navigation.replace('CoOwnHub');
    } else {
      navigation.replace('AuctionHome');
    }
  }, [navigation, route]);

  return null;
}