'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { SessionProvider } from '@/lib/session/SessionProvider';
import { SignupWallProvider } from '@/components/auth/SignupWall';

// Theme resolution moved to a pre-paint inline script in layout.tsx —
// a useEffect-based resolve flashes the SSR dark theme on light-OS visits.

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          {/* The soft signup wall — one sheet, one gate, app-wide. */}
          <SignupWallProvider>{children}</SignupWallProvider>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
