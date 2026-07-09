import React from 'react';
import { Image, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { SERVER_URL } from '../../utils';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const sizeMap: Record<Size, number> = { xs: 28, sm: 36, md: 48, lg: 64, xl: 96 };

interface AvatarProps {
  title?: string;
  imageUrl?: string | null;
  size?: Size;
  style?: ViewStyle;
}

const palette = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6'];
const getColor = (t: string) => {
  const sum = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
};

export const Avatar = ({ title = '?', imageUrl, size = 'md', style }: AvatarProps) => {
  const { colors: theme } = useTheme();
  const px = sizeMap[size];

  if (imageUrl) {
    const uri = imageUrl.startsWith('http') ? imageUrl : `${SERVER_URL}${imageUrl}`;
    return (
      <Image
        source={{ uri }}
        style={[{ width: px, height: px, borderRadius: px / 2, backgroundColor: theme.surfaceHover }, style]}
      />
    );
  }

  const letter = (title[0] || '?').toUpperCase();
  return (
    <View
      style={[
        { width: px, height: px, borderRadius: px / 2, backgroundColor: getColor(title || '?'),
          alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: px * 0.4 }}>{letter}</Text>
    </View>
  );
};
