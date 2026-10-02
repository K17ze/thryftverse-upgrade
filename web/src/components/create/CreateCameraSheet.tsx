'use client';

/**
 * CreateCameraSheet — the create flow's lazy door onto the shared
 * media/CameraSheet. Kept as its own module so the entry picker and
 * MediaField share one dynamic chunk: the getUserMedia graph stays out of
 * the eager /create bundle (same pattern as sell/SellMediaSheets).
 * Hosts gate the capture affordance on `isCameraCaptureSupported()` —
 * the sheet itself owns the starting/denied/no-device states.
 */

import dynamic from 'next/dynamic';

export const CreateCameraSheet = dynamic(
  () => import('@/components/media/CameraSheet').then((m) => m.CameraSheet),
  { ssr: false },
);
