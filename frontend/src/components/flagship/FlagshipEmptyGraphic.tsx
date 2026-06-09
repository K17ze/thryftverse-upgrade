import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Path, Skia, rect, rrect } from '@shopify/react-native-skia';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

interface FlagshipEmptyGraphicProps {
  variant?: 'bag' | 'box' | 'search' | 'chat' | 'image';
  size?: number;
  color?: string;
}

export function FlagshipEmptyGraphic({
  variant = 'bag',
  size = 160,
  color = Colors.brand,
}: FlagshipEmptyGraphicProps) {
  const { width } = useWindowDimensions();
  const s = Math.min(size, width * 0.45);
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.38;

  // Build simple geometric illustrations per variant
  const bgCircle = Skia.Path.Make();
  bgCircle.addCircle(cx, cy, r);

  const bagPath = Skia.Path.Make();
  // Bag body
  const bodyW = r * 1.4;
  const bodyH = r * 1.1;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH * 0.1;
  const bodyRect = rect(bodyX, bodyY, bodyW, bodyH);
  const bodyRRect = rrect(bodyRect, 12, 12);
  bagPath.addRRect(bodyRRect);
  // Bag handle
  bagPath.moveTo(cx - r * 0.35, bodyY);
  bagPath.cubicTo(cx - r * 0.35, cy - r * 0.9, cx + r * 0.35, cy - r * 0.9, cx + r * 0.35, bodyY);

  const boxPath = Skia.Path.Make();
  const boxW = r * 1.3;
  const boxH = r * 1.0;
  const boxX = cx - boxW / 2;
  const boxY = cy - boxH * 0.15;
  const boxRect = rect(boxX, boxY, boxW, boxH);
  const boxRRect = rrect(boxRect, 10, 10);
  boxPath.addRRect(boxRRect);
  // Box lid line
  boxPath.moveTo(boxX, boxY + boxH * 0.28);
  boxPath.lineTo(boxX + boxW, boxY + boxH * 0.28);

  const searchPath = Skia.Path.Make();
  // Search circle
  const searchR = r * 0.55;
  searchPath.addCircle(cx - r * 0.15, cy - r * 0.15, searchR);
  // Handle line
  searchPath.moveTo(cx + r * 0.25, cy + r * 0.25);
  searchPath.lineTo(cx + r * 0.5, cy + r * 0.5);

  const chatPath = Skia.Path.Make();
  const chatW = r * 1.4;
  const chatH = r * 1.0;
  const chatX = cx - chatW / 2;
  const chatY = cy - chatH * 0.15;
  const chatRect = rect(chatX, chatY, chatW, chatH);
  const chatRRect = rrect(chatRect, 14, 14);
  chatPath.addRRect(chatRRect);
  // Chat tail
  chatPath.moveTo(cx - 8, chatY + chatH);
  chatPath.lineTo(cx, chatY + chatH + 10);
  chatPath.lineTo(cx + 8, chatY + chatH);

  const imagePath = Skia.Path.Make();
  const imgW = r * 1.4;
  const imgH = r * 1.1;
  const imgX = cx - imgW / 2;
  const imgY = cy - imgH * 0.1;
  const imgRect = rect(imgX, imgY, imgW, imgH);
  const imgRRect = rrect(imgRect, 12, 12);
  imagePath.addRRect(imgRRect);
  // Mountain line
  imagePath.moveTo(imgX + imgW * 0.2, imgY + imgH * 0.75);
  imagePath.lineTo(imgX + imgW * 0.45, imgY + imgH * 0.4);
  imagePath.lineTo(imgX + imgW * 0.7, imgY + imgH * 0.65);
  imagePath.lineTo(imgX + imgW * 0.85, imgY + imgH * 0.5);
  // Sun circle
  imagePath.addCircle(imgX + imgW * 0.72, imgY + imgH * 0.28, r * 0.12);

  const paths: Record<string, ReturnType<typeof Skia.Path.Make>> = {
    bag: bagPath,
    box: boxPath,
    search: searchPath,
    chat: chatPath,
    image: imagePath,
  };

  const selected = paths[variant] ?? bagPath;

  return (
    <View style={[styles.container, { width: s, height: s }]}>
      <Canvas style={{ width: s, height: s }}>
        {/* Background circle */}
        <Path path={bgCircle} color={color} opacity={0.08} />
        {/* Graphic stroke */}
        <Path
          path={selected}
          color={color}
          style="stroke"
          strokeWidth={3.5}
          strokeCap="round"
          strokeJoin="round"
          opacity={0.9}
        />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    marginBottom: Space.md,
  },
});
