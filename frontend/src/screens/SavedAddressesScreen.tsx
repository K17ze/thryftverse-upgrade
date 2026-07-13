import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import {
  listUserAddresses,
  deleteUserAddress,
  CommerceAddress,
} from '../services/commerceApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';

type Props = StackScreenProps<RootStackParamList, 'SavedAddresses'>;

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
            isDefault: defaultAddr.isDefault,
          });
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
      Alert.alert(
        'Remove address?',
        `The address for ${address.name} will be removed from your saved addresses.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
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
                      isDefault: newDefault.isDefault,
                    });
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
          },
        ]
      );
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
        isDefault: address.isDefault,
      });
      navigation.navigate('AddressForm', { mode: 'edit', source: 'postage' });
    },
    [navigation, saveAddress]
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('AddressForm', { mode: 'add', source: 'postage' });
  }, [navigation]);

  const renderAddressCard = (address: CommerceAddress, index: number) => {
    const isDefault = address.isDefault;
    const isDeleting = deletingId === address.id;
    const detail = formatAddressDetail(address);
    return (
      <Reanimated.View key={address.id} entering={FadeIn.duration(250).delay(index * 40)}>
        <View style={[styles.addressCard, { backgroundColor: Colors.surface, borderColor: Colors.border }, isDefault && { borderColor: Colors.brand, borderWidth: 1.5 }]}>
          <View style={styles.addressCardHeader}>
            <View style={styles.addressCardHeaderLeft}>
              {isDefault ? (
                <View style={[styles.defaultBadge, { backgroundColor: `${Colors.brand}15` }]}>
                  <Ionicons name="star" size={11} color={Colors.brand} />
                  <Text style={[styles.defaultBadgeText, { color: Colors.brand }]}>DEFAULT</Text>
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
                <Text style={[styles.editAction, { color: Colors.brand }]}>Edit</Text>
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
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                )}
              </AnimatedPressable>
            </View>
          </View>
          <View style={styles.addressCardBody}>
            <Text style={[styles.addressName, { color: Colors.textPrimary }]} numberOfLines={1}>
              {address.name}
            </Text>
            <Text style={[styles.addressLine, { color: Colors.textSecondary }]} numberOfLines={2}>
              {formatAddressLine(address)}
            </Text>
            {detail ? (
              <Text style={[styles.addressDetail, { color: Colors.textMuted }]} numberOfLines={1}>
                {detail}
              </Text>
            ) : null}
          </View>
        </View>
      </Reanimated.View>
    );
  };

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
              style={[styles.addBtn, { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Add new address"
            >
              <Ionicons name="add" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void fetchAddresses(true)}
            tintColor={Colors.textMuted}
          />
        }
      >
        {loadState === 'loading' ? (
          <View style={styles.skeletonWrap}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.skeletonCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                <View style={[styles.skeletonLine, { width: '30%', backgroundColor: Colors.surfaceAlt }]} />
                <View style={{ height: 8 }} />
                <View style={[styles.skeletonLine, { width: '90%', backgroundColor: Colors.surfaceAlt }]} />
                <View style={{ height: 6 }} />
                <View style={[styles.skeletonLine, { width: '60%', backgroundColor: Colors.surfaceAlt }]} />
              </View>
            ))}
          </View>
        ) : loadState === 'empty' ? (
          <FlagshipState
            variant="empty"
            icon="location-outline"
            title="No saved addresses"
            subtitle="Add a delivery address for faster checkout. You can add multiple addresses and choose a default."
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
        ) : (
          <View style={styles.listWrap}>
            {addresses.map((address, index) => renderAddressCard(address, index))}
            <Text style={[styles.listFootnote, { color: Colors.textMuted }]}>
              Addresses are used at checkout and for delivery. The default address is selected automatically.
            </Text>
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonWrap: {
    paddingTop: Space.sm,
    gap: Space.md,
  },
  skeletonCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  skeletonLine: {
    height: 16,
    borderRadius: Radius.sm,
  },
  listWrap: {
    paddingTop: Space.sm,
    gap: Space.md,
  },
  addressCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  addressCardBody: {
    gap: 2,
  },
  addressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  addressCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  addressCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm - 2,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  defaultBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  editAction: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  addressName: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    lineHeight: Type.bodyEmphasis.lineHeight,
    marginBottom: 2,
  },
  addressLine: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  addressDetail: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: 2,
  },
  listFootnote: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight + 2,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
  },
});
