import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { EmptyState } from '../components/EmptyState';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useBackendData } from '../context/BackendDataContext';
import { MasonryGrid } from '../components/ProductCardV2';

type NavT = StackNavigationProp<RootStackParamList>;
const HEADER_BUTTON_BG = Colors.surface;
const HEADER_BUTTON_BORDER = Colors.border;
const HEADER_LABEL_COLOR = Colors.brand;

export default function FavouritesScreen() {
  const navigation = useNavigation<NavT>();
  const wishlistIds = useStore((state) => state.wishlist);
  const { listings, refreshListings } = useBackendData();

  const [refreshing, setRefreshing] = React.useState(false);
  const scrollY = useSharedValue(0);

  const favouriteItems = React.useMemo(
    () => listings.filter((item) => wishlistIds?.includes(item.id) ?? false),
    [listings, wishlistIds]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    setTimeout(() => setRefreshing(false), 350);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View>
          <Text style={styles.headerLabel}>WATCHLIST</Text>
          <Text style={styles.headerTitle}>Watchlist</Text>
        </View>
        <Text style={styles.countText}>{favouriteItems.length}</Text>
      </View>

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      {favouriteItems.length > 0 ? (
        <Reanimated.ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            scrollY.value = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
            />
          }
        >
          <MasonryGrid
            items={favouriteItems}
            onPressItem={(item) => navigation.push('ItemDetail', { itemId: item.id })}
            numColumns={2}
            showSeller={true}
            showSaveButton={true}
          />
        </Reanimated.ScrollView>
      ) : (
        <EmptyState
          icon="heart-outline"
          title="No watchlist items yet"
          subtitle="Products you like will appear here."
          ctaLabel="Browse Closet"
          onCtaPress={() => (navigation as any).navigate('MainTabs', { screen: 'Search' })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md - Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: HEADER_BUTTON_BORDER,
    backgroundColor: HEADER_BUTTON_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    color: HEADER_LABEL_COLOR,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  headerTitle: {
    marginTop: 2,
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  countText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    minWidth: 24,
    textAlign: 'right',
  },
  listContent: {
    paddingHorizontal: Space.sm,
    paddingBottom: 120,
  },
  columnWrap: {
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
});
