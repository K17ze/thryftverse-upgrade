import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

/**
 * CreateLookScreen — redirect shim.
 *
 * The canonical Look creation surface is the collage-native LookComposerScreen
 * (src/creator/look/LookComposerScreen.tsx), reached via the CreatorStudio
 * route with { type: 'look' }. The CreateLook route in AppNavigator already
 * uses CreateLookRedirect; this shim exists so any direct import of
 * CreateLookScreen also redirects to the modern composer instead of
 * presenting a competing 399-line legacy implementation.
 */
export default function CreateLookScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      navigation.replace('CreatorStudio', { type: 'look' });
    }, 0);
    return () => clearTimeout(timeout);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
  });
}
