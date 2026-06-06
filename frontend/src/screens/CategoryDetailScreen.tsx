import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveTheme, Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MOCK_CATEGORIES } from '../data/mockData';
import { mockFind } from '../utils/mockGate';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { Typography } from '../theme/designTokens';

const { width } = Dimensions.get('window');
const GRID_SPACING = 2;
const ITEM_SIZE = (width - (GRID_SPACING * 2)) / 3;

export default function CategoryDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();
  const { categoryId } = route.params || {};
  
  const category = mockFind(MOCK_CATEGORIES, (c: any) => c.id === categoryId) || MOCK_CATEGORIES[0];
  // Filter listings based on the selected category for the grid preview.
  const gridData = listings.filter(l => l.category.toLowerCase() === category.name.toLowerCase() || categoryId === 'cat1');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      
      {/* Heavy Typography Header */}
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.hugeTitle}>{category.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Horizontal Subcategory Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {category.subItems?.map((sub: any, idx: number) => (
            <AnimatedPressable 
              key={idx} style={styles.chip}
              onPress={() => navigation.navigate('Browse', { categoryId: category.id, subcategoryId: sub.id, title: sub.name })}
              accessibilityRole="button"
              accessibilityLabel={`Open ${sub.name} subcategory`}
              accessibilityHint="Shows listings for this subcategory"
            >
              <Text style={styles.chipText}>{sub.name}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>

        {/* Dense Grid - Restored Navigation & Real Data Mapping */}
        <View style={styles.grid}>
          {gridData.map((item) => (
            <View key={item.id} style={styles.gridCard}>
              <AnimatedPressable
                style={styles.gridItemTap}
                activeOpacity={0.9}
                onPress={() => navigation.push('ItemDetail', { itemId: item.id })}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                accessibilityHint={`View listing details priced at ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}`}
              >
                <SharedTransitionView
                  style={styles.sharedImageLayer}
                  sharedTransitionTag={`image-${item.id}-0`}
                >
                  <CachedImage uri={getListingCoverUri(item.images, '')} style={styles.gridImage} contentFit="cover" />
                </SharedTransitionView>
                <View style={styles.pricePill}>
                  <Text style={styles.priceText}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
                </View>
              </AnimatedPressable>
            </View>
          ))}
        </View>
        {gridData.length === 0 && (
          <Text style={{color: Colors.textMuted, textAlign: 'center', marginTop: 40}}>No items found in this category.</Text>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  hugeTitle: { fontSize: 34, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, letterSpacing: -0.5 },
  content: { paddingBottom: 40 },
  chipsScroll: { paddingHorizontal: 20, gap: 8, paddingBottom: 24 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surface },
  chipText: { color: Colors.textPrimary, fontSize: 13, fontFamily: Typography.family.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_SPACING },
  gridCard: { width: ITEM_SIZE, marginBottom: 6 },
  gridItemTap: { width: ITEM_SIZE, height: ITEM_SIZE * 1.15, backgroundColor: Colors.surface, position: 'relative', overflow: 'hidden', borderRadius: 10 },
  sharedImageLayer: { ...StyleSheet.absoluteFillObject },
  gridImage: { width: '100%', height: '100%' },
  pricePill: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8 },
  priceText: { color: '#fff', fontSize: 11, fontFamily: Typography.family.bold },
  gridSellerRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  gridSellerChip: {
    flex: 1,
    minHeight: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  gridSellerAvatarWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  gridSellerAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  gridSellerAvatarFallback: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  gridSellerText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 9,
    fontFamily: Typography.family.semibold,
  },
  gridMessageBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
