import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, ViewToken } from 'react-native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { Colors } from '../constants/colors';
import { ChatMessageItem, ChatMessage, DateSeparator } from './ChatMessageItem';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isGroup?: boolean;
  currentUserId?: string;
  onEndReached?: () => void;
  onViewableItemsChanged?: (visibleMessages: ChatMessage[]) => void;
}

// Type for list items - can be message or date separator
type ListItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'date'; date: string };

export function ChatMessageList({
  messages,
  isGroup = false,
  onEndReached,
  onViewableItemsChanged,
}: ChatMessageListProps) {
  const listRef = useRef<any>(null);

  // Transform messages into list items with date separators
  const listItems: ListItem[] = React.useMemo(() => {
    const items: ListItem[] = [];
    let lastDate: string | null = null;

    for (const message of messages) {
      // Add date separator if date changed
      if (message.timestamp) {
        const messageDate = formatMessageDate(message.timestamp);
        if (messageDate !== lastDate) {
          items.push({ type: 'date', date: messageDate });
          lastDate = messageDate;
        }
      }

      items.push({ type: 'message', data: message });
    }

    return items;
  }, [messages]);

  // Render item
  const renderItem: ListRenderItem<ListItem> = useCallback(
    ({ item }) => {
      if (item.type === 'date') {
        return <DateSeparator date={item.date} />;
      }

      return (
        <ChatMessageItem
          message={item.data}
          isGroup={isGroup}
        />
      );
    },
    [isGroup]
  );

  // Key extractor
  const keyExtractor = useCallback((item: ListItem, index: number) => {
    if (item.type === 'date') {
      return `date-${item.date}-${index}`;
    }
    return item.data.id;
  }, []);

  // Viewability callback
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visibleMessages = viewableItems
        .filter((item) => item.item.type === 'message')
        .map((item) => (item.item as { type: 'message'; data: ChatMessage }).data);

      onViewableItemsChanged?.(visibleMessages);
    },
    [onViewableItemsChanged]
  );

  // Scroll to bottom
  const scrollToBottom = useCallback((animated = true) => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToEnd({ animated });
    }
  }, [messages.length]);


  return (
    <View style={styles.container}>
      <FlashList
        ref={listRef}
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          minimumViewTime: 200,
          viewAreaCoveragePercentThreshold: 50,
        }}
        // Invert for chat (newest at bottom)
        inverted={false}
      />
    </View>
  );
}

// Helper to format message date
function formatMessageDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingVertical: 8,
  },
});

// Alternative: FlatList implementation for simpler cases
interface SimpleChatMessageListProps {
  messages: ChatMessage[];
  isGroup?: boolean;
  scrollViewRef?: React.RefObject<FlatList>;
}

export function SimpleChatMessageList({
  messages,
  isGroup = false,
  scrollViewRef,
}: SimpleChatMessageListProps) {
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatMessageItem message={item} isGroup={isGroup} />
    ),
    [isGroup]
  );

  return (
    <FlatList
      ref={scrollViewRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    />
  );
}
