import React, { useState, useEffect } from 'react';
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

interface BidPanelProps {
  currentBid: number;
  nextBid: number;
  bidIncrement: number;
  endTime: Date;
  totalBids: number;
  currency?: string;
  onPlaceBid?: (amount: number) => void;
  onBuyNow?: (amount: number) => void;
  buyNowPrice?: number;
  style?: ViewStyle;
}

export function BidPanel({
  currentBid,
  nextBid,
  bidIncrement,
  endTime,
  totalBids,
  currency = '$',
  onPlaceBid,
  onBuyNow,
  buyNowPrice,
  style,
}: BidPanelProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [customBid, setCustomBid] = useState('');
  const [isEndingSoon, setIsEndingSoon] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(endTime).getTime();
      const difference = end - now;

      if (difference <= 0) {
        setTimeLeft('Ended');
        setIsEndingSoon(false);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
        setIsEndingSoon(false);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        setIsEndingSoon(hours < 1);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
        setIsEndingSoon(true);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [endTime]);

  const quickBids = [
    { amount: bidIncrement, label: `+${currency}${bidIncrement}` },
    { amount: bidIncrement * 2, label: `+${currency}${bidIncrement * 2}` },
    { amount: bidIncrement * 5, label: `+${currency}${bidIncrement * 5}` },
  ];

  const handleQuickBid = (increment: number) => {
    onPlaceBid?.(currentBid + increment);
  };

  const handleCustomBid = () => {
    const amount = parseInt(customBid, 10);
    if (amount >= nextBid) {
      onPlaceBid?.(amount);
      setCustomBid('');
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Timer */}
      <View style={[styles.timerContainer, isEndingSoon && styles.timerEnding]}>
        <Ionicons
          name={isEndingSoon ? 'flame' : 'time-outline'}
          size={20}
          color={isEndingSoon ? Colors.danger : Colors.textPrimary}
        />
        <View>
          <Text style={[styles.timerLabel, isEndingSoon && styles.timerEndingText]}>
            {isEndingSoon ? 'ENDING SOON' : 'Ends in'}
          </Text>
          <Text style={[styles.timerValue, isEndingSoon && styles.timerEndingText]}>
            {timeLeft}
          </Text>
        </View>
      </View>

      {/* Current Bid Info */}
      <View style={styles.bidInfo}>
        <View>
          <Text style={styles.currentBidLabel}>Current Bid</Text>
          <Text style={styles.currentBidAmount}>
            {currency}{currentBid.toLocaleString()}
          </Text>
        </View>
        <View style={styles.nextBidContainer}>
          <Text style={styles.nextBidLabel}>Next Bid</Text>
          <Text style={styles.nextBidAmount}>
            {currency}{nextBid.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Quick Bid Buttons */}
      <View style={styles.quickBidsContainer}>
        {quickBids.map((bid, index) => (
          <TouchableOpacity
            key={index}
            style={styles.quickBidButton}
            onPress={() => handleQuickBid(bid.amount)}
          >
            <Text style={styles.quickBidText}>{bid.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.customButton}>
          <Text style={styles.customButtonText}>Custom</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Bid Input */}
      <View style={styles.customBidContainer}>
        <TextInput
          style={styles.customBidInput}
          placeholder={`${currency}${nextBid}+`}
          keyboardType="number-pad"
          value={customBid}
          onChangeText={setCustomBid}
        />
        <TouchableOpacity
          style={[
            styles.placeBidButton,
            !customBid && styles.placeBidButtonDisabled,
          ]}
          onPress={handleCustomBid}
          disabled={!customBid}
        >
          <Text style={styles.placeBidButtonText}>Place Bid</Text>
        </TouchableOpacity>
      </View>

      {/* Buy Now Option */}
      {buyNowPrice && (
        <View style={styles.buyNowContainer}>
          <View style={styles.divider}>
            <Text style={styles.dividerText}>or</Text>
          </View>
          <TouchableOpacity
            style={styles.buyNowButton}
            onPress={() => onBuyNow?.(buyNowPrice)}
          >
            <View>
              <Text style={styles.buyNowButtonText}>Buy Now</Text>
              <Text style={styles.buyNowPrice}>
                {currency}{buyNowPrice.toLocaleString()}
              </Text>
            </View>
            <Ionicons name="flash" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Total Bids */}
      <View style={styles.totalBidsContainer}>
        <Ionicons name="people-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.totalBidsText}>
          {totalBids} bids placed by {Math.ceil(totalBids / 2)} bidders
        </Text>
      </View>
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
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  timerEnding: {
    backgroundColor: `${Colors.danger}15`,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  timerLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  timerValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  timerEndingText: {
    color: Colors.danger,
  },
  bidInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  currentBidLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  currentBidAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  nextBidContainer: {
    alignItems: 'flex-end',
  },
  nextBidLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  nextBidAmount: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.brand,
  },
  quickBidsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickBidButton: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickBidText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  customButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.brand,
  },
  customButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  customBidContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  customBidInput: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    fontSize: 16,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeBidButton: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  placeBidButtonDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  placeBidButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buyNowContainer: {
    marginTop: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginHorizontal: 8,
  },
  buyNowButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.success,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buyNowButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buyNowPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  totalBidsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalBidsText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
