import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import {
  listUserAddresses,
  deleteUserAddress,
  CommerceAddress } from '../services/commerceApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { FlashList } from '@shopify/flash-list';

import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { t } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedAddresses'>;

type LoadState = 'loading' | 'populated' | 'empty' | 'error';

function formatAddressLine(address: CommerceAddress): string {
  // CommerceAddress is now mapped from backend (street→streetAddress, postcode→postalCode)
  const parts: string[] = [];
  if (address.streetAddress) parts.push(address.streetAddress);
  if (address.city) parts.push(address.city);
  if (address.postalCode) parts.push(address.postalCode);
  return parts.filter(Boolean).join(', ');
}

function formatAddressDetail(address: CommerceAddress): string {
  const parts: string[] = [];
  if (address.country) parts.push(address.country);
  if (address.region) parts.push(address.region);
  return parts.filter(Boolean).join(', ');
}

export default function SavedAddressesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const { show } = useToast();
  const haptic = useHaptic();

  const [addresses, setAddresses] = useState<CommerceAddress[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const fetchAddresses = useCallback(
    async (isRefresh = false) => {
      const userId = currentUser?.id;
      if (!userId) {
        setLoadState('empty');
        return;
      }
      if (!isRefresh) setLoadState('loading');
      else setIsRefreshing(true);
      try {
        const items = await listUserAddresses(userId);
        setAddresses(items);
        // Sync the single savedAddress in store with the default backend address
        const defaultAddr = items.find((a) => a.isDefault) ?? items[0] ?? null;
        if (defaultAddr) {
          saveAddress({
            id: defaultAddr.id,
            name: defaultAddr.name,
            streetAddress: defaultAddr.streetAddress,
            apartment: defaultAddr.apartment,
            city: defaultAddr.city,
            region: defaultAddr.region,
            postalCode: defaultAddr.postalCode,
            countryCode: defaultAddr.countryCode,
            country: defaultAddr.country,
            isDefault: defaultAddr.isDefault });
        } else if (items.length === 0) {
          clearSavedAddress();
        }
        setLoadState(items.length > 0 ? 'populated' : 'empty');
      } catch (error) {
        const parsed = parseApiError(error, 'Could not load addresses.');
        if (isRefresh) {
          show(parsed.message, 'error');
        }
        // Fall back to store-only address if backend fails
        if (savedAddress) {
          setLoadState('populated');
        } else {
          setLoadState('error');
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [currentUser?.id, savedAddress, saveAddress, clearSavedAddress, show]
  );

  useEffect(() => {
    void fetchAddresses();
  }, [fetchAddresses]);

  const handleDelete = useCallback(
    (address: CommerceAddress) => {
      setConfirmSheet({
        visible: true,
        title: 'Remove address?',
        message: `The address for ${address.name} will be removed from your saved addresses.`,
        confirmLabel: 'Remove',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          const userId = currentUser?.id;
          if (!userId || address.id === undefined) {
            show('Unable to remove this address right now.', 'error');
            return;
          }
          setDeletingId(address.id);
          try {
            await deleteUserAddress(userId, address.id);
            haptic.medium();
            const remaining = addresses.filter((a) => a.id !== address.id);
            setAddresses(remaining);
            if (remaining.length === 0) {
              clearSavedAddress();
              setLoadState('empty');
            } else if (savedAddress?.id === address.id) {
              const newDefault = remaining.find((a) => a.isDefault) ?? remaining[0];
              if (newDefault) {
                saveAddress({
                  id: newDefault.id,
                  name: newDefault.name,
                  streetAddress: newDefault.streetAddress,
                  apartment: newDefault.apartment,
                  city: newDefault.city,
                  region: newDefault.region,
                  postalCode: newDefault.postalCode,
                  countryCode: newDefault.countryCode,
                  country: newDefault.country,
                  isDefault: newDefault.isDefault });
              }
            }
            show('Address removed', 'success');
          } catch (error) {
            const parsed = parseApiError(error, 'Could not remove address.');
            show(parsed.message, 'error');
          } finally {
            setDeletingId(null);
          }
        },
        variant: 'danger' });
    },
    [addresses, currentUser?.id, savedAddress?.id, clearSavedAddress, saveAddress, show, haptic]
  );

  const handleEdit = useCallback(
    (address: CommerceAddress) => {
      // Ensure the store has this address loaded for the edit form
      saveAddress({
        id: address.id,
        name: address.name,
        streetAddress: address.streetAddress,
        apartment: address.apartment,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
        country: address.country,
        isDefault: address.isDefault });
      navigation.navigate('AddressForm', { mode: 'edit', source: 'postage' });
    },
    [navigation, saveAddress]
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('AddressForm', { mode: 'add', source: 'postage' });
  }, [navigation]);

  const renderAddressCard = useCallback(
    (address: CommerceAddress, index: number) => {
      const isDefault = address.isDefault;
      const isDeleting = deletingId === address.id;
      const detail = formatAddressDetail(address);
      return (
        <View key={address.id}>
          <View style={[styles.addressCard, { backgroundColor: colors.surface, borderColor: colors.border }, isDefault && { borderColor: colors.brand, borderWidth: Stroke.emphasis }]}>
            <View style={styles.addressCardHeader}>
              <View style={styles.addressCardHeaderLeft}>
                {isDefault ? (
                  <View style={[styles.defaultBadge, { backgroundColor: colors.brandSubtle }]}>
                    <Ionicons name="star" size={11} color={colors.brand} />
                    <Text style={[styles.defaultBadgeText, { color: colors.brand }]}>DEFAULT</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.addressCardActions}>
                <AnimatedPressable
                  onPress={() => handleEdit(address)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  scaleValue={0.95}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel={`Edit address for ${address.name}`}
                >
                  <Text style={[styles.editAction, { color: colors.brand }]}>Edit</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => handleDelete(address)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  scaleValue={0.95}
                  hapticFeedback="light"
                  disabled={isDeleting}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove address for ${address.name}`}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  )}
                </AnimatedPressable>
              </View>
            </View>
            <View style={styles.addressCardBody}>
              <Text style={[styles.addressName, { color: colors.textPrimary }]} numberOfLines={1}>
                {address.name}
              </Text>
              <Text style={[styles.addressLine, { color: colors.textSecondary }]} numberOfLines={2}>
                {formatAddressLine(address)}
              </Text>
              {detail ? (
                <Text style={[styles.addressDetail, { color: colors.textMuted }]} numberOfLines={1}>
                  {detail}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [colors, deletingId, handleEdit, handleDelete]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CommerceAddress; index: number }) => renderAddressCard(item, index),
    [renderAddressCard]
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Saved addresses"
          subtitle={
            loadState === 'populated'
              ? `${addresses.length} saved`
              : 'Delivery addresses'
          }
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={handleAdd}
              scaleValue={0.92}
              hapticFeedback="light"
              style={[styles.addBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Add new address"
            >
              <Ionicons name="add" size={22} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <FlashList
        data={loadState === 'populated' ? addresses : []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void fetchAddresses(true)}
            tintColor={colors.textMuted}
          />
        }
        ListHeaderComponent={
          loadState === 'populated' ? (
            <View style={styles.postureSummary}>
              <Text style={[styles.postureTitle, { color: colors.textPrimary }]}>
                {addresses.length} address{addresses.length === 1 ? '' : 'es'}
              </Text>
              <Text style={[styles.postureSubtitle, { color: colors.textSecondary }]}>
                {addresses.find((a) => a.isDefault) ? `${addresses.find((a) => a.isDefault)?.name} is default` : 'No default set'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadState === 'populated' ? (
            <Text style={[styles.listFootnote, { color: colors.textMuted }]}>
              Addresses are used at checkout and for delivery. The default address is selected automatically.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          loadState === 'loading' ? (
            <View style={styles.skeletonWrap}>
              {[0, 1].map((i) => (
                <View key={i} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.skeletonLine, { width: '30%', backgroundColor: colors.surfaceAlt }]} />
                  <View style={{ height: 8 }} />
                  <View style={[styles.skeletonLine, { width: '90%', backgroundColor: colors.surfaceAlt }]} />
                  <View style={{ height: 6 }} />
                  <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.surfaceAlt }]} />
                </View>
              ))}
            </View>
          ) : loadState === 'empty' ? (
            <FlagshipState
              variant="empty"
              icon="location-outline"
              title="No saved addresses"
              subtitle="Add a delivery address for faster checkout. Add multiple addresses and choose a default."
              actionLabel="Add address"
              onAction={handleAdd}
            />
          ) : loadState === 'error' ? (
            <FlagshipState
              variant="error"
              title="Could not load addresses"
              subtitle="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void fetchAddresses()}
            />
          ) : null
        }
        ItemSeparatorComponent={loadState === 'populated' ? () => <View style={{ height: Space.md }} /> : undefined}
      />

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center' },
  postureSummary: {
    paddingVertical: Space.sm },
  postureTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  postureSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 2 },
  skeletonWrap: {
    paddingTop: Space.sm,
    gap: Space.md },
  skeletonCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md },
  skeletonLine: {
    height: Space.md,
    borderRadius: Radius.sm },
  listWrap: {
    paddingTop: Space.sm,
    gap: Space.md },
  addressCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md },
  addressCardBody: {
    gap: Space.xs / 2 },
  addressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm },
  addressCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  addressCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm - 2,
    paddingVertical: Space.xs - 1,
    borderRadius: Radius.full },
  defaultBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  editAction: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  addressName: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    marginBottom: Space.xs / 2 },
  addressLine: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight + 2,
    letterSpacing: TypographyV2.body.letterSpacing },
  addressDetail: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2 },
  listFootnote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'center',
    marginTop: Space.sm,
    paddingHorizontal: Space.md } });
