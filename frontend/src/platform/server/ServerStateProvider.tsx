import React from 'react';
import { QueryClientProvider as RNUQueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

export function ServerStateProvider({ children }: { children: React.ReactNode }) {
  return <RNUQueryClientProvider client={queryClient}>{children}</RNUQueryClientProvider>;
}
