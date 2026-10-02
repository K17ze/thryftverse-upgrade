'use client';

import { useEffect, useState } from 'react';
import { formatClock } from '../hostStreams';

export function ElapsedClock({ startedAtMs }: { startedAtMs: number }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
  );

  useEffect(() => {
    const iv = window.setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))),
      1_000,
    );
    return () => window.clearInterval(iv);
  }, [startedAtMs]);

  return <>{formatClock(elapsed)}</>;
}
