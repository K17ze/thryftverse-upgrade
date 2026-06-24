import React from 'react';
import { Host, RNHostView } from '@expo/ui';

export interface ExpoUIHostProps {
  children: React.ReactNode;
  style?: any;
}

export function ExpoUIHost({ children, style }: ExpoUIHostProps) {
  return (
    <Host>
      <RNHostView style={style}>
        {children as React.ReactElement}
      </RNHostView>
    </Host>
  );
}

export { Host, RNHostView };
