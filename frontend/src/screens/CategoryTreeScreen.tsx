import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ImageBackground
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { Typography } from '../theme/designTokens';

type RouteT = RouteProp<RootStackParamList, 'CategoryTree'>;
const HEADER_BORDER = Colors.border;
const BANNER_BG = Colors.surfaceAlt;
const PILL_BG = Colors.surface;
const PILL_BORDER = Colors.border;

// Premium imagery for category headers
const CAT_IMAGES: Record<string, string> = {
  Clothing: '',
  Shoes: '',
  Bags: '',
  Accessories: '',
  Girls: '',
  Boys: '',
  Baby: '',
};

const TREES: Record<string, { title: string; subs: string[] }[]> = {
  Women: [
    { title: 'Clothing', subs: ['Dresses', 'Tops & T-Shirts', 'Trousers', 'Jackets & Coats', 'Knitwear'] },
    { title: 'Shoes', subs: ['Trainers', 'Boots', 'Heels', 'Flats'] },
    { title: 'Bags', subs: ['Shoulder Bags', 'Tote Bags', 'Crossbody Bags'] },
    { title: 'Accessories', subs: ['Jewellery', 'Belts', 'Sunglasses'] }
  ],
  Men: [
    { title: 'Clothing', subs: ['T-Shirts', 'Hoodies & Sweatshirts', 'Trousers', 'Jackets & Coats', 'Jeans'] },
    { title: 'Shoes', subs: ['Trainers', 'Boots', 'Formal Shoes'] },
    { title: 'Accessories', subs: ['Watches', 'Hats & Caps', 'Belts'] }
  ],
  Kids: [
    { title: 'Girls', subs: ['Clothing', 'Shoes', 'Accessories'] },
    { title: 'Boys', subs: ['Clothing', 'Shoes', 'Accessories'] },
    { title: 'Baby', subs: ['0-6 Months', '6-12 Months', '12-24 Months'] }
  ]
};

export default function CategoryTreeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { categoryPrefix } = route.params;

  const resolvedPrefix = TREES[categoryPrefix] ? categoryPrefix : 'Women';

  const sections = TREES[resolvedPrefix];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>{resolvedPrefix}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* View All Master Button */}
        <AnimatedPressable 
          style={styles.viewAllRow}
          onPress={() => navigation.navigate('Browse', { categoryId: resolvedPrefix.toLowerCase(), title: `All ${resolvedPrefix}` })}
          activeOpacity={0.9}
        >
          <Text style={styles.viewAllText}>View All {resolvedPrefix}</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.background} />
        </AnimatedPressable>

        {sections.map((section, index) => (
          <View key={section.title} style={styles.section}>
             {/* Edge-to-edge imagery for category headers */}
            <AnimatedPressable 
              activeOpacity={0.9} 
              onPress={() => navigation.navigate('Browse', { 
                categoryId: resolvedPrefix.toLowerCase(), 
                title: `${resolvedPrefix} ${section.title}`
              })}
            >
              <ImageBackground 
                source={{ uri: CAT_IMAGES[section.title] || CAT_IMAGES['Clothing'] }} 
                style={styles.categoryBanner}
                imageStyle={{ opacity: 0.6 }}
              >
                <View style={styles.bannerOverlay}>
                  <Text style={styles.bannerTitle}>{section.title}</Text>
                  <Ionicons name="arrow-forward" size={24} color="#fff" />
                </View>
              </ImageBackground>
            </AnimatedPressable>

            {/* Premium Pilled Subcategories instead of standard rows */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subsScroll}>
              {section.subs.map(sub => (
                <AnimatedPressable 
                  key={sub} 
                  style={styles.subPill}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Browse', { 
                    categoryId: resolvedPrefix.toLowerCase(), 
                    subcategoryId: sub.toLowerCase(),
                    title: sub
                  })}
                >
                  <Text style={styles.subPillText}>{sub}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </View>
        ))}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    height: 56, 
    borderBottomWidth: 1, 
    borderBottomColor: HEADER_BORDER 
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontFamily: Typography.family.bold, color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 1 },

  viewAllRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 24, 
    backgroundColor: Colors.textPrimary,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
    borderRadius: 16,
  },
  viewAllText: { fontSize: 16, fontFamily: Typography.family.bold, color: Colors.background, textTransform: 'uppercase', letterSpacing: 0.5 },
  supportRow: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  supportIdentity: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PILL_BORDER,
    backgroundColor: PILL_BG,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  supportAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  supportText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  supportMessageBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PILL_BORDER,
    backgroundColor: PILL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { marginTop: 16 },
  
  categoryBanner: {
    height: 140,
    justifyContent: 'flex-end',
    backgroundColor: BANNER_BG,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bannerOverlay: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bannerTitle: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: -0.5,
  },

  subsScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  subPill: {
    backgroundColor: PILL_BG,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PILL_BORDER,
  },
  subPillText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
});
