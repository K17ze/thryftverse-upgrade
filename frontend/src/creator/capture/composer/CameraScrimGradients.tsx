import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../CreatorCameraStyles';

// ── Legibility scrim gradients ───────────────────────────────────────
// 0.18 top, 0.28 bottom — legibility only, not a wash.

export function CameraScrimGradients() {
  return (
    <>
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />
    </>
  );
}
