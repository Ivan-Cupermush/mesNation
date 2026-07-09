import React, { ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const paddingMap = { none: 0, sm: 10, md: 14, lg: 20 };

export const Card = ({ children, onPress, padding = 'md', style }: CardProps) => {
  const { colors } = useTheme();
  const cardStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: paddingMap[padding],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  };
  const content = <View style={[cardStyle, style]}>{children}</View>;
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{content}</TouchableOpacity>
  ) : content;
};
