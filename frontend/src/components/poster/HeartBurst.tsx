import React from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing as ReEasing,
} from 'react-native-reanimated';
import { Motion } from '../../theme/motionTokens';
import { GRAVITY, LIFETIME_MS, FADE_DELAY_MS } from '../../utils/posterPhysics';

// ── Heart burst particle component ─────────────────────────────────────
// Reanimated-based particle burst: 12–22 heart emoji particles explode
// outward with random velocity, gravity, rotation, scale, and fade.
// Respects reducedMotion (single heart fade only).
interface ParticleConfig {
  id: number;
  velX: number;
  velY: number;
  scale: number;
  rotSpeed: number;
}

export function HeartBurst({ x, y, reducedMotion }: { x: number; y: number; reducedMotion: boolean }) {
  // Generate 12–22 particles with random initial properties.
  // Configs are generated once per burst (not per render).
  const configs = React.useMemo<ParticleConfig[]>(() => {
    const count = 12 + Math.floor(Math.random() * 11); // 12–22
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      velX: -200 + Math.random() * 400, // -200 to 200
      velY: -(400 + Math.random() * 400), // 400–800 upward
      scale: 0.6 + Math.random() * 0.6, // 0.6–1.2
      rotSpeed: -3 + Math.random() * 6, // -3 to 3 rad/sec
    }));
  }, []);

  // Reduced motion: single heart that fades out — no particle physics.
  if (reducedMotion) {
    return <ReducedMotionHeart x={x} y={y} />;
  }

  return (
    <View style={[heartBurstStyles.container, { left: x, top: y }]} pointerEvents="none">
      {configs.map((cfg) => (
        <ParticleHeart key={cfg.id} config={cfg} />
      ))}
    </View>
  );
}

// Single particle heart — owns its shared values and physics animation.
function ParticleHeart({ config }: { config: ParticleConfig }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(config.scale);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    // Horizontal: constant velocity decay
    translateX.value = withTiming(config.velX * 0.8, {
      duration: LIFETIME_MS,
      easing: ReEasing.out(ReEasing.cubic),
    });

    // Vertical: initial upward, then gravity pulls down (two-phase)
    translateY.value = withTiming(config.velY * 0.5, {
      duration: Motion.duration.crawl,
      easing: ReEasing.out(ReEasing.cubic),
    });
    const gravityTimer = setTimeout(() => {
      translateY.value = withTiming(GRAVITY * 0.3, {
        duration: Motion.duration.crawl,
        easing: ReEasing.in(ReEasing.cubic),
      });
    }, Motion.duration.crawl);

    // Rotation: constant angular velocity
    rotation.value = withTiming(config.rotSpeed, { duration: LIFETIME_MS });

    // Fade out after 1.5s
    const fadeTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: Motion.duration.crawl });
    }, FADE_DELAY_MS);

    return () => {
      clearTimeout(gravityTimer);
      clearTimeout(fadeTimer);
    };
  }, [config, translateX, translateY, rotation, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.Text style={[heartBurstStyles.particle, animatedStyle]} allowFontScaling={false} /* decorative animation particle — not content text; must not scale with Dynamic Type */>
      ❤️
    </Reanimated.Text>
  );
}

// Reduced-motion heart: single heart that scales up briefly and fades.
function ReducedMotionHeart({ x, y }: { x: number; y: number }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.8);

  React.useEffect(() => {
    scale.value = withTiming(1, { duration: 0 });
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 0 });
    }, 200);
    return () => clearTimeout(timer);
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={[heartBurstStyles.container, { left: x, top: y }]} pointerEvents="none">
      <Reanimated.Text style={[heartBurstStyles.text, animatedStyle]} allowFontScaling={false} /* decorative animation particle — not content text; must not scale with Dynamic Type */>
        ❤️
      </Reanimated.Text>
    </View>
  );
}

const heartBurstStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    zIndex: 30,
  },
  text: {
    fontSize: 60,
  },
  particle: {
    position: 'absolute',
    fontSize: 28,
  },
});
