import React from 'react';
import { View, Text } from 'react-native';

import { useGalleriaStyles } from '../../hooks/galleria';

// ---------------------------------------------------------------------------
// Section header — eyebrow + title
// ---------------------------------------------------------------------------
export function GalleriaSectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const styles = useGalleriaStyles();
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}
