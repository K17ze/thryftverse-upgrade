import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface Item {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: string;
}

interface OfferSettings {
  acceptsOffers: boolean;
  autoDecline: {
    enabled: boolean;
    belowPercentage: number;
  };
  priceDropHistory: {
    date: string;
    oldPrice: number;
    newPrice: number;
  }[];
}

interface TPPOfferSystemProps {
  item: Item;
  offerSettings: OfferSettings;
  onMakeOffer?: (offerAmount: number) => void;
  onCounterOffer?: (counterAmount: number) => void;
  onAcceptOffer?: () => void;
  onDeclineOffer?: () => void;
  currentOffer?: number;
  isBuyer?: boolean;
  style?: ViewStyle;
}

export function TPPOfferSystem({
  item,
  offerSettings,
  onMakeOffer,
  onCounterOffer,
  onAcceptOffer,
  onDeclineOffer,
  currentOffer,
  isBuyer = true,
  style,
}: TPPOfferSystemProps) {
  const [isOfferModalVisible, setIsOfferModalVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerStatus, setOfferStatus] = useState<'pending' | 'accepted' | 'declined' | null>(null);

  const minOfferAmount = Math.ceil(item.price * 0.5); // Minimum 50% of listing price
  const suggestedOffers = [
    Math.round(item.price * 0.75),
    Math.round(item.price * 0.85),
    Math.round(item.price * 0.9),
  ];

  const handleSubmitOffer = () => {
    const amount = parseFloat(offerAmount);
    if (amount >= minOfferAmount) {
      onMakeOffer?.(amount);
      setOfferStatus('pending');
      setIsOfferModalVisible(false);
    }
  };

  const getOfferStatus = () => {
    if (!currentOffer) return null;
    const percentage = (currentOffer / item.price) * 100;
    if (
      offerSettings.autoDecline.enabled &&
      percentage < offerSettings.autoDecline.belowPercentage
    ) {
      return 'declined';
    }
    return offerStatus;
  };

  const status = getOfferStatus();

  if (!isBuyer && currentOffer) {
    // Seller view - show incoming offer
    return (
      <View style={[styles.container, style]}>
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <Ionicons name="cash-outline" size={24} color={Colors.brand} />
            <Text style={styles.offerTitle}>Incoming Offer</Text>
          </View>

          <View style={styles.itemPreview}>
            <Image source={{ uri: item.image }} style={styles.itemImage} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.originalPrice}>
                Listed: {item.currency} {item.price.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.offerDetails}>
            <Text style={styles.offerLabel}>Buyer offered</Text>
            <Text style={styles.offerAmount}>
              {item.currency} {currentOffer.toFixed(2)}
            </Text>
            <Text style={styles.offerPercentage}>
              {Math.round((currentOffer / item.price) * 100)}% of listing price
            </Text>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={onDeclineOffer}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.counterButton]}
              onPress={() => setIsOfferModalVisible(true)}
            >
              <Text style={styles.counterButtonText}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={onAcceptOffer}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Counter Offer Modal */}
        <Modal
          visible={isOfferModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsOfferModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Counter Offer</Text>
              <Text style={styles.modalSubtitle}>
                Suggest a different price to the buyer
              </Text>
              <TextInput
                style={styles.offerInput}
                placeholder={`Enter amount (${item.currency})`}
                keyboardType="decimal-pad"
                value={offerAmount}
                onChangeText={setOfferAmount}
              />
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => {
                  onCounterOffer?.(parseFloat(offerAmount));
                  setIsOfferModalVisible(false);
                }}
              >
                <Text style={styles.submitButtonText}>Send Counter Offer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Buyer view
  return (
    <View style={[styles.container, style]}>
      {/* Accepts Offers Badge */}
      {offerSettings.acceptsOffers && (
        <View style={styles.badge}>
          <Ionicons name="pricetag-outline" size={14} color={Colors.brand} />
          <Text style={styles.badgeText}>Accepts Offers</Text>
        </View>
      )}

      {/* Price Drop History */}
      {offerSettings.priceDropHistory.length > 0 && (
        <View style={styles.priceDropSection}>
          <Text style={styles.priceDropTitle}>Price History</Text>
          {offerSettings.priceDropHistory.slice(0, 2).map((drop, index) => (
            <View key={index} style={styles.priceDropItem}>
              <Ionicons name="trending-down" size={14} color={Colors.success} />
              <Text style={styles.priceDropText}>
                Dropped from {item.currency} {drop.oldPrice.toFixed(2)} to{' '}
                {item.currency} {drop.newPrice.toFixed(2)} on {drop.date}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Make Offer Button */}
      {offerSettings.acceptsOffers && !currentOffer && (
        <TouchableOpacity
          style={styles.makeOfferButton}
          onPress={() => setIsOfferModalVisible(true)}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={Colors.brand} />
          <Text style={styles.makeOfferButtonText}>Make Offer</Text>
        </TouchableOpacity>
      )}

      {/* Offer Status */}
      {currentOffer && status && (
        <View
          style={[
            styles.statusCard,
            status === 'accepted' && styles.statusAccepted,
            status === 'declined' && styles.statusDeclined,
            status === 'pending' && styles.statusPending,
          ]}
        >
          <Ionicons
            name={
              status === 'accepted'
                ? 'checkmark-circle'
                : status === 'declined'
                ? 'close-circle'
                : 'time'
            }
            size={20}
            color={
              status === 'accepted'
                ? Colors.success
                : status === 'declined'
                ? Colors.danger
                : '#FFB800'
            }
          />
          <View style={styles.statusTextContainer}>
            <Text style={styles.statusTitle}>
              {status === 'accepted'
                ? 'Offer Accepted!'
                : status === 'declined'
                ? 'Offer Declined'
                : 'Offer Pending'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {item.currency} {currentOffer.toFixed(2)} offer
            </Text>
          </View>
        </View>
      )}

      {/* Offer Modal */}
      <Modal
        visible={isOfferModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOfferModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsOfferModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Make an Offer</Text>
            <Text style={styles.modalSubtitle}>
              Minimum offer: {item.currency} {minOfferAmount.toFixed(2)} (50% of
              listing price)
            </Text>

            {/* Item Preview */}
            <View style={styles.modalItemPreview}>
              <Image source={{ uri: item.image }} style={styles.modalItemImage} />
              <View>
                <Text style={styles.modalItemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.modalItemPrice}>
                  Listed: {item.currency} {item.price.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Suggested Offers */}
            <Text style={styles.suggestedLabel}>Suggested Offers</Text>
            <View style={styles.suggestedOffers}>
              {suggestedOffers.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.suggestedButton}
                  onPress={() => setOfferAmount(amount.toString())}
                >
                  <Text style={styles.suggestedButtonText}>
                    {item.currency} {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Offer Input */}
            <TextInput
              style={styles.offerInput}
              placeholder={`Enter your offer (${item.currency})`}
              keyboardType="decimal-pad"
              value={offerAmount}
              onChangeText={setOfferAmount}
            />

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!offerAmount || parseFloat(offerAmount) < minOfferAmount) &&
                  styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitOffer}
              disabled={!offerAmount || parseFloat(offerAmount) < minOfferAmount}
            >
              <Text style={styles.submitButtonText}>Send Offer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.brand}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brand,
  },
  priceDropSection: {
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  priceDropTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  priceDropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  priceDropText: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  makeOfferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${Colors.brand}15`,
    borderWidth: 1,
    borderColor: Colors.brand,
    paddingVertical: 12,
    borderRadius: 8,
  },
  makeOfferButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.brand,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  statusAccepted: {
    backgroundColor: `${Colors.success}15`,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  statusDeclined: {
    backgroundColor: `${Colors.danger}15`,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  statusPending: {
    backgroundColor: `#FFB80015`,
    borderWidth: 1,
    borderColor: '#FFB800',
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statusSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  offerCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  itemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  originalPrice: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  offerDetails: {
    alignItems: 'center',
    marginBottom: 20,
  },
  offerLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  offerAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.brand,
  },
  offerPercentage: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  counterButton: {
    backgroundColor: `${Colors.brand}15`,
    borderWidth: 1,
    borderColor: Colors.brand,
  },
  counterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  acceptButton: {
    backgroundColor: Colors.success,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalItemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: Colors.background,
    borderRadius: 12,
    marginBottom: 20,
  },
  modalItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  modalItemName: {
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalItemPrice: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  suggestedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 12,
  },
  suggestedOffers: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  suggestedButton: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestedButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  offerInput: {
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 18,
    color: Colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
