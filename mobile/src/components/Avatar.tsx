import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { TelegramSizes } from '../theme/telegramTheme';

interface AvatarProps {
  size?: number;
  image?: string;
  title?: string;
}

export const Avatar = ({ size = TelegramSizes.avatar.default, image, title }: AvatarProps) => {
  if (image) {
    return <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.letter, { fontSize: size * 0.45 }]}>{(title?.[0] || '').toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#3390EC', alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '700' },
});
