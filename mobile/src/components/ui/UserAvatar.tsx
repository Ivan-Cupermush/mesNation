import React from 'react';
import { Image, Text, View, StyleProp, ViewStyle } from 'react-native';
import { SERVER_URL } from '../../config';
import { hashColor, initials } from '../chat/chatUtils';

/** Круглый аватар: фото или инициалы на цвете, который зависит от имени. */
export default function UserAvatar({
  name,
  url,
  size = 40,
  style,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={{ uri: url.startsWith('http') ? url : `${SERVER_URL}${url}` }} style={[box, style as any]} />;
  }
  const n = name || '?';
  return (
    <View style={[box, { backgroundColor: hashColor(n), alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: Math.max(9, Math.round(size * 0.38)) }}>{initials(n)}</Text>
    </View>
  );
}
