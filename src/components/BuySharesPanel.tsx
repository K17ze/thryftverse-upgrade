import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface BuySharesPanelProps {
  availableShares: number;
  pricePerShare: number;
  yourCurrentShares: number;
  totalShares: number;
  currency?: string;
  onBuyShares?: (quantity: number) => void;
  onViewTerms?: () => void;
  style?: ViewStyle;
}

export function BuySharesPanel({
  availableShares,
  pricePerShare,
  yourCurrentShares,
  totalShares,
  currency = '$',
  onBuyShares,
  onViewTerms,
  style,
}: BuySharesPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const total = quantity * pricePerShare;
  const newOwnership = ((yourCurrentShares + quantity) / totalShares) * 100;
  const currentOwnership = (yourCurrentShares / totalShares) * 100;

  const handleQuantityChange = (value: number) => {
    setQuantity(Math.max(1, Math.min(value, availableShares)));
  };

  const quickAmounts = [1, 5, 10, 25];

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="cube-outline" size={24} color={Colors.brand} />
        <View>
          <Text style={styles.title}>Buy Shares</Text>
          <Text style={styles.subtitle}>
            {availableShares} shares available at {currency}
            {pricePerShare.toLocaleString()} each
          </Text>
        </View>
      </View>

      {/* Ownership Preview */}
      <View style={styles.ownershipPreview}>
        <Text style={styles.previewLabel}>Your ownership</Text>
        <View style={styles.ownershipBar}>
          <View
            style={[
              styles.currentOwnership,
              { width: `${currentOwnership}%` },
            ]}
          />
          <View
            style={[
              styles.newOwnership,
              { width: `${(quantity / totalShares) * 100}%` },
            ]}
          />
        </View>
        <View style={styles.ownershipLabels}>
          <Text style={styles.currentOwnershipText}>
            Current: {currentOwnership.toFixed(1)}%
          </Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.newOwnershipText}>
            After purchase: {newOwnership.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Quantity Selector */}
      <View style={styles.quantitySection}>
        <Text style={styles.sectionLabel}>Select Quantity</Text>

        {/* Quick Select Buttons */}
        <View style={styles.quickButtons}>
          {quickAmounts.map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[
                styles.quickButton,
                quantity === amount && styles.quickButtonActive,
                amount > availableShares && styles.quickButtonDisabled,
              ]}
              onPress={() => handleQuantityChange(amount)}
              disabled={amount > availableShares}
            >
              <Text
                style={[
                  styles.quickButtonText,
                  quantity === amount && styles.quickButtonTextActive,
                  amount > availableShares && styles.quickButtonTextDisabled,
                ]}
              >
                {amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quantity Stepper */}
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={[styles.stepperBtn, quantity <= 1 && styles.stepperBtnDisabled]}
            onPress={() => handleQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <Ionicons name="remove" size={20} color={quantity <= 1 ? Colors.textMuted : Colors.textPrimary} />
          </TouchableOpacity>
          <TextInput
            style={styles.quantityInput}
            keyboardType="number-pad"
            value={quantity.toString()}
            onChangeText={(text) => handleQuantityChange(parseInt(text) || 0)}
          />
          <TouchableOpacity
            style={[styles.stepperBtn, quantity >= availableShares && styles.stepperBtnDisabled]}
            onPress={() => handleQuantityChange(Math.min(availableShares, quantity + 1))}
            disabled={quantity >= availableShares}
          >
            <Ionicons name="add" size={20} color={quantity >= availableShares ? Colors.textMuted : Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.rangeLabel}>1 - {availableShares} shares available</Text>
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>
            {currency}
            {total.toLocaleString()}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Platform fee (2%)</Text>
          <Text style={styles.totalValue}>
            {currency}
            {(total * 0.02).toFixed(2)}
          </Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>
            {currency}
            {(total * 1.02).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Terms Agreement */}
      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setAgreedToTerms(!agreedToTerms)}
      >
        <View
          style={[
            styles.checkbox,
            agreedToTerms && styles.checkboxChecked,
          ]}
        >
          {agreedToTerms && (
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          )}
        </View>
        <Text style={styles.termsText}>
          I understand and agree to the{' '}
          <Text style={styles.termsLink} onPress={onViewTerms}>
            co-ownership terms
          </Text>
          , including voting participation requirements
        </Text>
      </TouchableOpacity>

      {/* Buy Button */}
      <TouchableOpacity
        style={[
          styles.buyButton,
          (!agreedToTerms || quantity === 0) && styles.buyButtonDisabled,
        ]}
        onPress={() => onBuyShares?.(quantity)}
        disabled={!agreedToTerms || quantity === 0}
      >
        <Ionicons name="card-outline" size={20} color="#FFFFFF" />
        <Text style={styles.buyButtonText}>
          Buy {quantity} Share{quantity !== 1 ? 's' : ''} for {currency}
          {(total * 1.02).toFixed(2)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  ownershipPreview: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  ownershipBar: {
    height: 12,
    backgroundColor: Colors.border,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
  },
  currentOwnership: {
    height: '100%',
    backgroundColor: `${Colors.brand}50`,
  },
  newOwnership: {
    height: '100%',
    backgroundColor: Colors.brand,
  },
  ownershipLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentOwnershipText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  arrow: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  newOwnershipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brand,
  },
  quantitySection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickButton: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickButtonActive: {
    backgroundColor: `${Colors.brand}15`,
    borderColor: Colors.brand,
  },
  quickButtonDisabled: {
    opacity: 0.4,
  },
  quickButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  quickButtonTextActive: {
    color: Colors.brand,
  },
  quickButtonTextDisabled: {
    color: Colors.textMuted,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  quantityInput: {
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    minWidth: 80,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtnDisabled: {
    opacity: 0.5,
  },
  rangeLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginBottom: 16,
  },
  totalSection: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  totalValue: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginBottom: 0,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.brand,
  },
  termsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.brand,
    fontWeight: '500',
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buyButtonDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
