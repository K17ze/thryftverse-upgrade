import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  FlatList,
  Keyboard,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface SettingsSearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  onResultPress?: (item: SearchResult) => void;
  results?: SearchResult[];
  style?: ViewStyle;
}

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  icon?: string;
  onPress?: () => void;
}

export function SettingsSearchBar({
  placeholder = 'Search settings...',
  onSearch,
  onResultPress,
  results = [],
  style,
}: SettingsSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      onSearch?.(text);
    },
    [onSearch]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    onSearch?.('');
    inputRef.current?.focus();
  }, [onSearch]);

  const handleResultPress = useCallback(
    (item: SearchResult) => {
      Keyboard.dismiss();
      setIsFocused(false);
      item.onPress?.();
      onResultPress?.(item);
    },
    [onResultPress]
  );

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <Text key={index} style={styles.highlightedText}>{part}</Text>
      ) : (
        part
      )
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.searchContainer, isFocused && styles.searchContainerFocused]}>
        <Ionicons
          name="search"
          size={20}
          color={Colors.textMuted}
          style={styles.searchIcon}
        />
        
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <View style={styles.clearIconContainer}>
              <Ionicons name="close" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results */}
      {isFocused && query.length > 0 && results.length > 0 && (
        <View style={styles.resultsContainer}>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultItem}
                onPress={() => handleResultPress(item)}
              >
                {item.icon && (
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={Colors.textMuted}
                    style={styles.resultIcon}
                  />
                )}
                <View style={styles.resultTextContainer}>
                  <Text style={styles.resultTitle}>
                    {highlightMatch(item.title, query)}
                  </Text>
                  <Text style={styles.resultPath}>{item.path}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Empty State */}
      {isFocused && query.length > 0 && results.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No settings found</Text>
          <Text style={styles.emptySubtitle}>
            Try searching for "notifications", "privacy", or "account"
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchContainerFocused: {
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    height: 44,
  },
  clearButton: {
    padding: 4,
  },
  clearIconContainer: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultIcon: {
    marginRight: 12,
  },
  resultTextContainer: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  highlightedText: {
    color: Colors.brand,
    fontWeight: '600',
  },
  resultPath: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    marginHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
});
