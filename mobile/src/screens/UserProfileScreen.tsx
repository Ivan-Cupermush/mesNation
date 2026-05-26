import React from 'react';
import { View, Text, Image } from 'react-native';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';
import { SERVER_URL } from '../utils';

export default function UserProfileScreen({ route }: any) {
  const { userId, username, displayName, avatarUrl, role } = route.params;
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={[styles.container, { padding: 20 }]}>
      {avatarUrl ? (
        <Image source={{ uri: SERVER_URL + avatarUrl }} style={{ width: 100, height: 100, borderRadius: 50 }} />
      ) : (
        <View style={[styles.avatarPlaceholder, { width: 100, height: 100, borderRadius: 50 }]}>
          <Text style={{ color: '#fff', fontSize: 36, fontWeight: '700' }}>
            {(displayName || username || '?')[0].toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={[styles.userName, { fontSize: 22, marginTop: 15 }]}>{displayName || username}</Text>
      <Text style={{ color: '#999', marginTop: 5 }}>@{username}</Text>
      <Text style={{ color: '#666', marginTop: 5 }}>Роль: {role || 'employee'}</Text>
    </View>
  );
}
