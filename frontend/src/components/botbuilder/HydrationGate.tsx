import React from 'react';
import { View } from 'react-native';
import { FlagshipScreen, FlagshipHeader, FlagshipState, SkeletonBlock } from '../flagship';
import { Radius, Space, Control } from '../../theme/designTokens';
import type { BotBuilderStyles } from './botBuilderStyles';

// Edit-mode hydration gate — shown while the bot's stored config is loading
// (skeleton) or when GET /bots/:id failed (error/offline state with retry).

export function HydrationGate({
  hydrateError,
  isOffline,
  onRetry,
  onBack,
  styles }: {
  hydrateError: boolean;
  isOffline: boolean;
  onRetry: () => void;
  onBack: () => void;
  styles: BotBuilderStyles;
}) {
  return (
    <FlagshipScreen
      header={
        <FlagshipHeader title="Edit agent" onBack={onBack} />
      }
      scrollEnabled={false}
    >
      {hydrateError ? (
        <FlagshipState
          variant={isOffline ? 'offline' : 'error'}
          title={isOffline ? "You're offline" : "Couldn't load this agent"}
          subtitle={
            isOffline
              ? 'Reconnect to load this agent.'
              : 'Check your connection and try again.'
          }
          actionLabel="Try again"
          onAction={onRetry}
        />
      ) : (
        <View style={styles.hydrateWrap}>
          <SkeletonBlock width="100%" height={156} radius={Radius.md} />
          <SkeletonBlock width="60%" height={16} style={{ marginTop: Space.lg }} />
          <SkeletonBlock width="100%" height={Control.hit} radius={Radius.md} style={{ marginTop: Space.sm }} />
          <SkeletonBlock width="100%" height={Control.hit} radius={Radius.md} style={{ marginTop: Space.sm }} />
        </View>
      )}
    </FlagshipScreen>
  );
}
