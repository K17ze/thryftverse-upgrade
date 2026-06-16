import React from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Space, Radius } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PremiumSelectRow } from '../components/ui/PremiumSelectRow';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { EmptyState } from '../components/EmptyState';
import { Headline, Body, Meta } from '../components/ui/Text';
import {
  FlagshipProfileMedia,
  FlagshipProductCard,
  FlagshipOrderCard,
  FlagshipAssetCard,
  FlagshipEmptyGraphic,
  FlagshipHeroSection,
  FlagshipActionCluster,
} from '../components/flagship';

const { width: SCREEN_W } = Dimensions.get('window');

export default function DesignReviewScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Design QA" onBack={() => {}} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. Profile Cover / Avatar Editor */}
        <SectionTitle>FlagshipProfileMedia</SectionTitle>
        <FlagshipProfileMedia
          coverUri="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80"
          avatarUri="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80"
          isSelf
          onEditCover={() => {}}
          onEditAvatar={() => {}}
        />
        <View style={{ height: 40 }} />
        <FlagshipProfileMedia
          coverUri={null}
          avatarUri={null}
          isSelf={false}
        />

        {/* 2. Product Card Grid */}
        <SectionTitle>FlagshipProductCard</SectionTitle>
        <View style={styles.productRow}>
          <FlagshipProductCard
            imageUri="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80"
            title="Nike Air Max 90"
            price="£89"
            sellerName="@sneakerhead"
            condition="Very good"
            onPress={() => {}}
            onToggleSave={() => {}}
            isSaved
          />
          <FlagshipProductCard
            imageUri="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=80"
            title="Vintage Denim Jacket"
            price="£45"
            onPress={() => {}}
          />
        </View>

        {/* 3. Order Card */}
        <SectionTitle>FlagshipOrderCard</SectionTitle>
        <FlagshipOrderCard
          imageUri="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80"
          listingTitle="Nike Air Max 90"
          status="shipped"
          price="£89"
          sellerName="@sneakerhead"
          orderDate="12 May 2026"
          onPress={() => {}}
        />
        <FlagshipOrderCard
          imageUri={null}
          listingTitle="Vintage Denim Jacket"
          status="pending"
          price="£45"
          onPress={() => {}}
        />

        {/* 4. Co-own Asset Card */}
        <SectionTitle>FlagshipAssetCard</SectionTitle>
        <FlagshipAssetCard
          imageUri="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=200&q=80"
          name="Rare Vintage Chair"
          unitPrice="£120"
          yourUnits={3}
          totalUnits={10}
          status="active"
          actionLabel="Trade"
          onAction={() => {}}
        />
        <FlagshipAssetCard
          imageUri={null}
          name="Abstract Print"
          unitPrice="£45"
          yourUnits={1}
          totalUnits={8}
          status="pending"
        />

        {/* 5. Empty Graphics */}
        <SectionTitle>FlagshipEmptyGraphic</SectionTitle>
        <View style={styles.emptyRow}>
          <FlagshipEmptyGraphic variant="bag" size={100} />
          <FlagshipEmptyGraphic variant="box" size={100} />
          <FlagshipEmptyGraphic variant="search" size={100} />
          <FlagshipEmptyGraphic variant="chat" size={100} />
          <FlagshipEmptyGraphic variant="image" size={100} />
        </View>

        {/* 6. Hero Section */}
        <SectionTitle>FlagshipHeroSection</SectionTitle>
        <FlagshipHeroSection
          imageUri="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80"
          title="Curated Drops"
          subtitle="Hand-picked by our community"
          ctaLabel="Explore"
          onCta={() => {}}
          height={260}
        />

        {/* 7. Action Cluster */}
        <SectionTitle>FlagshipActionCluster</SectionTitle>
        <View style={styles.card}>
          <FlagshipActionCluster
            actions={[
              { label: 'Confirm', onPress: () => {}, variant: 'primary' },
              { label: 'Cancel', onPress: () => {}, variant: 'secondary' },
            ]}
          />
          <FlagshipActionCluster
            layout="row"
            actions={[
              { label: 'Buy', onPress: () => {}, variant: 'primary' },
              { label: 'Offer', onPress: () => {}, variant: 'secondary' },
            ]}
          />
        </View>

        {/* Legacy Primitives */}
        <SectionTitle>Buttons</SectionTitle>
        <View style={styles.row}>
          <AppButton title="Primary" variant="primary" onPress={() => {}} />
          <AppButton title="Secondary" variant="secondary" onPress={() => {}} />
        </View>
        <View style={styles.row}>
          <AppButton title="Disabled" variant="primary" disabled onPress={() => {}} />
          <AppButton title="Danger" variant="danger" onPress={() => {}} />
        </View>

        <SectionTitle>Inputs</SectionTitle>
        <View style={styles.card}>
          <PremiumTextField label="Name" value="" onChangeText={() => {}} placeholder="Enter name" />
          <PremiumTextField label="Website" value="" onChangeText={() => {}} placeholder="https://" />
        </View>

        <SectionTitle>Status Pills</SectionTitle>
        <View style={styles.rowWrap}>
          <PremiumStatusPill tone="delivered" label="Delivered" />
          <PremiumStatusPill tone="pending" label="Pending" />
          <PremiumStatusPill tone="error" label="Cancelled" />
          <PremiumStatusPill tone="shipped" label="Shipped" />
        </View>

        <SectionTitle>Empty States</SectionTitle>
        <View style={[styles.card, { minHeight: 200 }]}>
          <EmptyState
            icon="cube-outline"
            title="No orders yet"
            subtitle="Your orders will appear here."
          />
        </View>

        <SectionTitle>Surfaces</SectionTitle>
        <View style={[styles.surface, { backgroundColor: Colors.surface }]}>
          <Meta>Surface</Meta>
        </View>
        <View style={[styles.surface, { backgroundColor: Colors.surfaceAlt }]}>
          <Meta>Surface Alt</Meta>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Headline style={styles.sectionTitle}>{children}</Headline>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Space.md, paddingBottom: Space.xxl },
  sectionTitle: { marginTop: Space.lg, marginBottom: Space.sm },
  row: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, marginBottom: Space.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  surface: {
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  productRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  emptyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
});