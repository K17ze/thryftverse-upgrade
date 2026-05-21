import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Type } from '../../theme/designTokens';

interface MentionHighlightProps {
  text: string;
  onMentionPress?: (username: string) => void;
  color?: string;
}

export function MentionHighlight({
  text,
  onMentionPress,
  color = Colors.brand,
}: MentionHighlightProps) {
  const parts = text.split(/(@\w+)/g);

  return (
    <Text style={styles.text}>
      {parts.map((part, index) => {
        if (part.startsWith('@')) {
          const username = part.slice(1);
          return (
            <Text
              key={index}
              style={[styles.mention, { color }]}
              onPress={() => onMentionPress?.(username)}
            >
              {part}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: 'Inter_400Regular',
    color: Colors.textPrimary,
  },
  mention: {
    fontFamily: 'Inter_600SemiBold',
  },
});
