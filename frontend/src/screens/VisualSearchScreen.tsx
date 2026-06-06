import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { MasonryGrid } from '../components/ProductCardV2';
import { EmptyState } from '../components/EmptyState';

type Props = StackScreenProps<RootStackParamList, 'VisualSearch'>;

const { width: SCREEN_W } = Dimensions.get('window');

export default function VisualSearchScreen({ navigation }: Props) {
  const { show } = useToast();
  const { listings } = useBackendData();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const handleCapture = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show('Camera permission required', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
        setHasScanned(false);
      }
    } catch {
      show('Could not open camera', 'error');
    }
  }, [show]);

  const handleGallery = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Photo library access required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
        setHasScanned(false);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  }, [show]);

  const handleRemoveImage = useCallback(() => {
    setImageUri(null);
    setHasScanned(false);
    setIsScanning(false);
  }, []);

  const handleScan = useCallback(() => {
    if (!imageUri) return;
    setIsScanning(true);
    setHasScanned(false);
    // Simulate scan duration for UX, then reveal honest state
    setTimeout(() => {
      setIsScanning(false);
      setHasScanned(true);
    }, 1800);
  }, [imageUri]);

  const handleBrowseSimilar = useCallback(() => {
    navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' });
  }, [navigation]);

  const handleSearchByText = useCallback(() => {
    navigation.navigate('GlobalSearch');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      <ScreenHeader title="Visual Search" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Source selection */}
        {!imageUri && (
          <Reanimated.View entering={FadeInDown.duration(300)} style={styles.sourceWrap}>
            <Text style={styles.sourceTitle}>Find similar items with a photo</Text>
            <Text style={styles.sourceSub}>Take a photo or choose one from your gallery</Text>
            <View style={styles.sourceRow}>
              <AnimatedPressable style={styles.sourceBtn} onPress={handleCapture} activeOpacity={0.85}>
                <Ionicons name="camera-outline" size={32} color={Colors.brand} />
                <Text style={styles.sourceBtnText}>Camera</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.sourceBtn} onPress={handleGallery} activeOpacity={0.85}>
                <Ionicons name="images-outline" size={32} color={Colors.brand} />
                <Text style={styles.sourceBtnText}>Gallery</Text>
              </AnimatedPressable>
            </View>
          </Reanimated.View>
        )}

        {/* Image preview */}
        {imageUri && (
          <Reanimated.View entering={FadeInDown.duration(300)} style={styles.previewWrap}>
            <View style={styles.previewCard}>
              <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="cover" />

              {/* Scan overlay during scanning */}
              {isScanning && <ScanOverlay />}

              {/* Corner brackets for visual search framing */}
              <View style={[styles.cornerBracket, styles.cornerTL]} />
              <View style={[styles.cornerBracket, styles.cornerTR]} />
              <View style={[styles.cornerBracket, styles.cornerBL]} />
              <View style={[styles.cornerBracket, styles.cornerBR]} />

              <AnimatedPressable style={styles.removeBtn} onPress={handleRemoveImage} activeOpacity={0.85}>
                <Ionicons name="close-circle" size={24} color="#fff" />
              </AnimatedPressable>
            </View>

            {!isScanning && !hasScanned && (
              <AppButton
                title="Find Similar Items"
                variant="primary"
                size="lg"
                onPress={handleScan}
                style={{ marginTop: Space.md }}
              />
            )}

            {isScanning && (
              <View style={styles.scanningWrap}>
                <ActivityIndicator size="small" color={Colors.brand} />
                <Text style={styles.scanningText}>Analysing image</Text>
                <Text style={styles.scanningSub}>Extracting colours, shapes and patterns</Text>
              </View>
            )}
          </Reanimated.View>
        )}

        {/* Results / honest empty state */}
        {hasScanned && (
          <Reanimated.View entering={FadeInDown.duration(400)}>
            {/* Honest unavailable state */}
            <EmptyState
              icon="scan-outline"
              title="Visual search is not connected yet"
              subtitle="We are working on image recognition. In the meantime, try these options to find similar items."
              ctaLabel="Browse All Items"
              onCtaPress={handleBrowseSimilar}
              suggestedActions={[
                { label: 'Search by Text', onPress: handleSearchByText },
                { label: 'Camera', onPress: handleCapture },
                { label: 'Gallery', onPress: handleGallery },
              ]}
            />

            {/* Nearby listings fallback grid */}
            {listings.length > 0 && (
              <View style={styles.fallbackSection}>
                <Text style={styles.fallbackTitle}>Recently listed items</Text>
                <MasonryGrid
                  items={listings.slice(0, 8)}
                  onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
                  numColumns={2}
                  showSaveButton
                />
              </View>
            )}
          </Reanimated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

  sourceWrap: { marginTop: Space.lg, alignItems: 'center', gap: Space.sm },
  sourceTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, textAlign: 'center' },
  sourceSub: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, textAlign: 'center' },
  sourceRow: { flexDirection: 'row', gap: Space.md, marginTop: Space.lg },
  sourceBtn: {
    width: (SCREEN_W - Space.md * 2 - Space.md) / 2,
    aspectRatio: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  sourceBtnText: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary },

  previewWrap: { marginTop: Space.lg, alignItems: 'center' },
  previewCard: {
    width: SCREEN_W - Space.md * 2,
    aspectRatio: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  previewImg: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scanningWrap: { marginTop: Space.lg, alignItems: 'center', gap: Space.sm },
  scanningText: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.sm },
  scanningSub: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted },

  fallbackSection: { marginTop: Space.lg },
  fallbackTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: Space.sm },

  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#fff',
  },
  cornerTL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.brand,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  scanDotGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 20,
  },
  scanDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
    margin: 16,
  },
});

// Scan overlay component with animated moving scan line
function ScanOverlay() {
  const [offset, setOffset] = useState(0);
  const direction = React.useRef(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => {
        const next = prev + direction.current * 3;
        if (next >= 100) { direction.current = -1; return 100; }
        if (next <= 0) { direction.current = 1; return 0; }
        return next;
      });
    }, 16);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.scanLine, { top: `${offset}%` }]} />
      <View style={styles.scanDotGrid}>
        {[...Array(12)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.scanDot,
              { opacity: 0.3 + 0.7 * Math.abs(Math.sin((offset + i * 30) * Math.PI / 180)) },
            ]}
          />
        ))}
      </View>
    </View>
  );
}
