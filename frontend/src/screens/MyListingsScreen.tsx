import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, RouteProp, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { TypeStyles } from '../constants/typography';
import { Space } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'MyListings'>;

export default function MyListingsScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const filterType = route.params?.type;

  const headerTitle =
    filterType === 'coown' ? 'My Co-Own Listings' : 'My Listings';
  const emptySubtitle =
    filterType === 'coown'
      ? 'Co-own offerings you create will appear here.'
      : 'Items you list for sale will appear here.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.title}>{headerTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <EmptyState
          icon="pricetags-outline"
          title="No listings yet"
          subtitle={emptySubtitle}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TypeStyles.title,
    color: Colors.textPrimary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
});
