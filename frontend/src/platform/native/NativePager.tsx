import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

export interface NativePagerPage {
  key: string;
  label: string;
  render: () => React.ReactNode;
}

export interface NativePagerProps {
  pages: NativePagerPage[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  tabBarStyle?: 'compact' | 'full';
  testID?: string;
}

export function NativePager({
  pages,
  activeIndex,
  onIndexChange,
  tabBarStyle = 'full',
  testID,
}: NativePagerProps) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: activeIndex * screenWidth, animated: true });
    }
  }, [activeIndex, screenWidth]);

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (index !== activeIndex && index >= 0 && index < pages.length) {
      onIndexChange(index);
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.tabBar, tabBarStyle === 'compact' && styles.tabBarCompact]}>
        {pages.map((page, i) => {
          const isActive = i === activeIndex;
          return (
            <Pressable
              key={page.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onIndexChange(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={page.label}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{page.label}</Text>
              {isActive && <View style={styles.tabIndicator} />}
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {pages.map((page) => (
          <View key={page.key} style={[styles.page, { width: screenWidth }]}>
            {page.render()}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tabBarCompact: {
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 30,
    height: 2,
    backgroundColor: Colors.brand,
    borderRadius: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
