import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';

export function CreatePosterRedirect() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    const timeout = setTimeout(() => {
      navigation.replace('CreatorStudio', { type: 'poster' });
    }, 0);
    return () => clearTimeout(timeout);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
