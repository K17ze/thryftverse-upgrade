import React from 'react';
import CreatorCamera, { type CreatorCameraProps } from '../../creator/CreatorCamera';

interface CameraCaptureProps {
  onPhotoCapture: (uri: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onPhotoCapture, onClose }: CameraCaptureProps) {
  const cameraProps: CreatorCameraProps = {
    mode: 'poster',
    onCapture: onPhotoCapture,
    onGallery: onClose,
    onClose,
  };
  return <CreatorCamera {...cameraProps} />;
}
