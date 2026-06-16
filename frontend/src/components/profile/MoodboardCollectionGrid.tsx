import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ClosetBoardCard } from './ClosetBoardCard';
import { Space } from '../../theme/designTokens';

interface BoardItem {
  id: string;
  title: string;
  itemCount: number;
  covers: string[];
}

interface MoodboardCollectionGridProps {
  boards: BoardItem[];
  onPressBoard: (id: string) => void;
  emptyComponent?: React.ReactNode;
}

export function MoodboardCollectionGrid({
  boards,
  onPressBoard,
  emptyComponent,
}: MoodboardCollectionGridProps) {
  if (boards.length === 0) {
    return <>{emptyComponent}</>;
  }

  return (
    <View style={styles.grid}>
      {boards.map((board, index) => (
        <ClosetBoardCard
          key={board.id}
          title={board.title}
          itemCount={board.itemCount}
          covers={board.covers}
          onPress={() => onPressBoard(board.id)}
          index={index}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
});