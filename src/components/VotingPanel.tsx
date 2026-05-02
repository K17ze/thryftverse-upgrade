import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface VoteOption {
  id: 'yes' | 'no' | 'abstain';
  label: string;
  percentage: number;
  count: number;
  color: string;
}

interface VotingPanelProps {
  proposal: string;
  details?: string;
  deadline: Date;
  yourVotes: number;
  yourVotingPower: number;
  totalVotes: number;
  options: VoteOption[];
  hasVoted: boolean;
  yourVote?: 'yes' | 'no' | 'abstain';
  onVote?: (vote: 'yes' | 'no') => void;
  onViewDetails?: () => void;
  isUrgent?: boolean;
  style?: ViewStyle;
}

export function VotingPanel({
  proposal,
  details,
  deadline,
  yourVotes,
  yourVotingPower,
  totalVotes,
  options,
  hasVoted,
  yourVote,
  onVote,
  onViewDetails,
  isUrgent = false,
  style,
}: VotingPanelProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [selectedVote, setSelectedVote] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(deadline).getTime();
      const difference = end - now;

      if (difference <= 0) {
        setTimeLeft('Voting closed');
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days} days ${hours} hrs`);
      } else {
        setTimeLeft(`${hours} hrs ${minutes} mins`);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 60000);

    return () => clearInterval(timer);
  }, [deadline]);

  const totalVoted = options.reduce((sum, opt) => sum + opt.percentage, 0);

  return (
    <View style={[styles.container, isUrgent && styles.urgentContainer, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.voteIcon, isUrgent && styles.urgentIcon]}>
            <Ionicons name="git-pull-request" size={20} color={isUrgent ? Colors.danger : Colors.brand} />
          </View>
          <Text style={styles.title}>Active Vote</Text>
        </View>
        <View style={[styles.timerBadge, isUrgent && styles.urgentTimerBadge]}>
          <Ionicons name="time-outline" size={14} color={isUrgent ? Colors.danger : Colors.textMuted} />
          <Text style={[styles.timerText, isUrgent && styles.urgentTimerText]}>
            {timeLeft}
          </Text>
        </View>
      </View>

      {/* Proposal */}
      <View style={styles.proposalContainer}>
        <Text style={styles.proposalText}>{proposal}</Text>
        {details && <Text style={styles.detailsText}>{details}</Text>}
        {onViewDetails && (
          <TouchableOpacity onPress={onViewDetails}>
            <Text style={styles.viewDetailsLink}>View full proposal details</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Your Voting Power */}
      <View style={styles.votingPowerContainer}>
        <Text style={styles.votingPowerLabel}>Your Voting Power</Text>
        <View style={styles.votingPowerRow}>
          <Text style={styles.votingPowerValue}>
            {yourVotes} votes ({yourVotingPower}% of total)
          </Text>
          {hasVoted && (
            <View style={styles.votedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.votedText}>
                Voted {yourVote?.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Vote Results Bar */}
      <View style={styles.resultsContainer}>
        <Text style={styles.resultsLabel}>Current Results</Text>
        <View style={styles.resultsBar}>
          {options.map((option) => (
            <View
              key={option.id}
              style={[
                styles.resultSegment,
                {
                  width: `${option.percentage}%`,
                  backgroundColor: option.color,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.legend}>
          {options.map((option) => (
            <View key={option.id} style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: option.color }]}
              />
              <Text style={styles.legendText}>
                {option.label} {option.percentage}% ({option.count} votes)
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Vote Buttons */}
      {!hasVoted && (
        <View style={styles.voteButtonsContainer}>
          <TouchableOpacity
            style={[
              styles.voteButton,
              styles.noButton,
              selectedVote === 'no' && styles.noButtonSelected,
            ]}
            onPress={() => setSelectedVote('no')}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={selectedVote === 'no' ? '#FFFFFF' : Colors.danger}
            />
            <Text
              style={[
                styles.voteButtonText,
                styles.noButtonText,
                selectedVote === 'no' && styles.voteButtonTextSelected,
              ]}
            >
              Vote NO
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.voteButton,
              styles.yesButton,
              selectedVote === 'yes' && styles.yesButtonSelected,
            ]}
            onPress={() => setSelectedVote('yes')}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={selectedVote === 'yes' ? '#FFFFFF' : Colors.success}
            />
            <Text
              style={[
                styles.voteButtonText,
                styles.yesButtonText,
                selectedVote === 'yes' && styles.voteButtonTextSelected,
              ]}
            >
              Vote YES
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Submit Vote Button */}
      {!hasVoted && selectedVote && (
        <TouchableOpacity
          style={styles.submitVoteButton}
          onPress={() => onVote?.(selectedVote)}
        >
          <Text style={styles.submitVoteText}>
            Submit {selectedVote.toUpperCase()} Vote ({yourVotes} votes)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  urgentContainer: {
    borderColor: Colors.danger,
    backgroundColor: `${Colors.danger}08`,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.brand}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urgentIcon: {
    backgroundColor: `${Colors.danger}15`,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  urgentTimerBadge: {
    backgroundColor: `${Colors.danger}15`,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  urgentTimerText: {
    color: Colors.danger,
  },
  proposalContainer: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
  },
  proposalText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },
  viewDetailsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
    marginTop: 4,
  },
  votingPowerContainer: {
    marginBottom: 16,
  },
  votingPowerLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  votingPowerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  votingPowerValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  votedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.success}15`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  votedText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
  },
  resultsContainer: {
    marginBottom: 16,
  },
  resultsLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  resultsBar: {
    height: 12,
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  resultSegment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  voteButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  voteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  noButton: {
    backgroundColor: Colors.surface,
    borderColor: `${Colors.danger}30`,
  },
  noButtonSelected: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  yesButton: {
    backgroundColor: Colors.surface,
    borderColor: `${Colors.success}30`,
  },
  yesButtonSelected: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  voteButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  noButtonText: {
    color: Colors.danger,
  },
  yesButtonText: {
    color: Colors.success,
  },
  voteButtonTextSelected: {
    color: '#FFFFFF',
  },
  submitVoteButton: {
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitVoteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
