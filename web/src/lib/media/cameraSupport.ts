/**
 * Camera capability check — lives in its own module so surfaces that only
 * need the gate (SellFlow's capture entry) don't pull the CameraSheet
 * component graph into their eager bundle.
 */

/** getUserMedia needs a secure context AND the MediaDevices API. */
export function isCameraCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
