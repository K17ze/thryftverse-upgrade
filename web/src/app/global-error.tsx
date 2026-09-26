'use client';

/**
 * Global error boundary — catches render faults the route-level error.tsx
 * can't (layout/provider failures). Flat surface, one retry path.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#0E0E0E',
          color: '#F5F5F3',
        }}
      >
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: 8,
              maxWidth: 340,
              fontSize: 14,
              color: '#A3A39E',
            }}
          >
            An unexpected error occurred{error?.digest ? ` (${error.digest})` : ''}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              color: '#F5F5F3',
              background: 'transparent',
              border: '1px solid #3A3A38',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
