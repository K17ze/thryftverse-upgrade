import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  Image,
} from 'react-native';

export type ImageFilter =
  | 'normal'
  | 'clarendon'
  | 'gingham'
  | 'moon'
  | 'lark'
  | 'reyes'
  | 'juno'
  | 'slumber'
  | 'crema'
  | 'ludwig'
  | 'aden'
  | 'perpetua';

export interface FilterConfig {
  name: ImageFilter;
  label: string;
  overlayColor?: string;
  overlayOpacity?: number;
  saturation?: number;
  brightness?: number;
  contrast?: number;
}

const FILTERS: FilterConfig[] = [
  { name: 'normal', label: 'Normal' },
  { name: 'clarendon', label: 'Clarendon', overlayColor: '#4a90d9', overlayOpacity: 0.12, contrast: 1.1 },
  { name: 'gingham', label: 'Gingham', overlayColor: '#e8d5b5', overlayOpacity: 0.2, saturation: 0.85 },
  { name: 'moon', label: 'Moon', overlayColor: '#1a1a2e', overlayOpacity: 0.25, saturation: 0 },
  { name: 'lark', label: 'Lark', overlayColor: '#7ec8e3', overlayOpacity: 0.08, contrast: 0.95, saturation: 1.15 },
  { name: 'reyes', label: 'Reyes', overlayColor: '#d4a76a', overlayOpacity: 0.22, saturation: 0.9 },
  { name: 'juno', label: 'Juno', overlayColor: '#ffcc00', overlayOpacity: 0.1, contrast: 1.08, saturation: 1.2 },
  { name: 'slumber', label: 'Slumber', overlayColor: '#5f27cd', overlayOpacity: 0.15, saturation: 0.9 },
  { name: 'crema', label: 'Crema', overlayColor: '#e2d5c2', overlayOpacity: 0.18, contrast: 0.92 },
  { name: 'ludwig', label: 'Ludwig', overlayColor: '#ff6b6b', overlayOpacity: 0.08, contrast: 1.05, saturation: 1.1 },
  { name: 'aden', label: 'Aden', overlayColor: '#48dbfb', overlayOpacity: 0.12, saturation: 0.85 },
  { name: 'perpetua', label: 'Perpetua', overlayColor: '#1dd1a1', overlayOpacity: 0.08, contrast: 1.02 },
];

interface FilterStripProps {
  activeFilter: ImageFilter;
  onFilterChange: (filter: ImageFilter) => void;
  visible: boolean;
  previewUri?: string;
}

export default function FilterStrip({ activeFilter, onFilterChange, visible, previewUri }: FilterStripProps) {
  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.name;
          return (
            <Pressable
              key={filter.name}
              style={styles.filterCard}
              onPress={() => onFilterChange(filter.name)}
            >
              <View style={[styles.thumbWrap, isActive && styles.thumbWrapActive]}>
                {previewUri ? (
                  <View style={StyleSheet.absoluteFillObject}>
                    <Image
                      source={{ uri: previewUri }}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode="cover"
                    />
                    {filter.overlayColor && (
                      <View
                        style={[
                          StyleSheet.absoluteFillObject,
                          {
                            backgroundColor: filter.overlayColor,
                            opacity: filter.overlayOpacity ?? 0.15,
                          },
                        ]}
                      />
                    )}
                  </View>
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: filter.overlayColor || '#333' }]}>
                    {filter.name === 'normal' && (
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#444' }]} />
                    )}
                  </View>
                )}
              </View>
              <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function getFilterOverlay(filter: ImageFilter): { color?: string; opacity: number } {
  const config = FILTERS.find((f) => f.name === filter);
  if (!config || !config.overlayColor) return { opacity: 0 };
  return { color: config.overlayColor, opacity: config.overlayOpacity ?? 0.15 };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  strip: {
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterCard: {
    alignItems: 'center',
    gap: 6,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#333',
  },
  thumbWrapActive: {
    borderColor: '#fff',
    borderWidth: 2.5,
  },
  filterLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.65)',
  },
  filterLabelActive: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
});
