import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface AttachmentOption {
  id: string;
  icon: string;
  label: string;
  color: string;
  onPress?: () => void;
}

interface AttachmentMenuProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectOption?: (optionId: string) => void;
  style?: ViewStyle;
}

const ATTACHMENT_OPTIONS: AttachmentOption[] = [
  { id: 'gallery', icon: 'images', label: 'Gallery', color: '#4CAF50' },
  { id: 'camera', icon: 'camera', label: 'Camera', color: '#2196F3' },
  { id: 'file', icon: 'document', label: 'File', color: '#FF9800' },
  { id: 'location', icon: 'location', label: 'Location', color: '#9C27B0' },
  { id: 'contact', icon: 'person', label: 'Contact', color: '#00BCD4' },
  { id: 'product', icon: 'pricetag', label: 'Product', color: '#E91E63' },
];

export function AttachmentMenu({
  isVisible,
  onClose,
  onSelectOption,
  style,
}: AttachmentMenuProps) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isVisible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  const handleOptionPress = (option: AttachmentOption) => {
    onSelectOption?.(option.id);
    option.onPress?.();
    onClose();
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />
        
        <Animated.View
          style={[
            styles.container,
            { transform: [{ translateY }] },
            style,
          ]}
        >
          {/* Handle */}
          <View style={styles.handle} />
          
          {/* Title */}
          <Text style={styles.title}>Add Attachment</Text>
          
          {/* Options Grid */}
          <View style={styles.optionsGrid}>
            {ATTACHMENT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.optionButton}
                onPress={() => handleOptionPress(option)}
              >
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${option.color}15` },
                  ]}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={28}
                    color={option.color}
                  />
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  optionButton: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  cancelButton: {
    backgroundColor: Colors.background,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.danger,
  },
});
