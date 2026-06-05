import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, Image, Switch,
} from 'react-native';
import { pick } from '@react-native-documents/picker';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function ProfileScreen({ navigation, onLogout }: any) {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        setDisplayName(data.display_name || '');
        if (data.avatar_url) {
          const filename = data.avatar_url.split('/').pop();
          const tokenRes = await fetch(`${SERVER_URL}/api/file-token/${filename}`, {
            headers: { Authorization: `Bearer ${tok}` },
          });
          const tokenData = await tokenRes.json();
          if (tokenRes.ok && tokenData.url) {
            setAvatarUrl(SERVER_URL + tokenData.url);
          }
        }
      }
    } catch (e) {}
    setLoading(false);
  };

  const handleSaveName = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ display_name: displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Успешно', 'Имя обновлено');
        loadProfile();
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось обновить имя');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const [res] = await pick({ allowMultiSelection: false });
      if (!res) return;

      setUploading(true);
      const tok = await getToken();
      const formData = new FormData();
      formData.append('avatar', {
        uri: res.uri,
        type: res.type || 'image/jpeg',
        name: res.name || 'avatar.jpg',
      } as any);

      const response = await fetch(`${SERVER_URL}/api/auth/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Успешно', 'Аватар обновлён');
        loadProfile();
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось загрузить аватар');
      }
    } catch (err: any) {
      if (err?.code === 'DOCUMENT_PICKER_CANCELED') return;
      Alert.alert('Ошибка', 'Не удалось выбрать файл');
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    const RNFS = require('react-native-fs');
    try {
      await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`);
    } catch (e) {}
    // Вызываем переданный onLogout для сброса состояния авторизации
    if (onLogout) onLogout();
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={[styles.container, { padding: 20 }]}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 100, height: 100, borderRadius: 50 }} />
        ) : (
          <View style={[styles.avatarPlaceholder, { width: 100, height: 100, borderRadius: 50 }]}>
            <Text style={{ color: '#fff', fontSize: 36, fontWeight: '700' }}>
              {(user?.display_name || user?.username || 'U')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <TouchableOpacity onPress={handleChangeAvatar} disabled={uploading} style={{ marginTop: 10 }}>
          <Text style={{ color: '#007bff' }}>{uploading ? 'Загрузка...' : 'Сменить аватар'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Отображаемое имя</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Введите имя" placeholderTextColor="#999" />
      <TouchableOpacity style={[styles.createButton, { marginTop: 10 }]} onPress={handleSaveName}>
        <Text style={styles.createButtonText}>Сохранить</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
        <Text style={styles.label}>Тёмная тема</Text>
        <Switch value={theme === 'dark'} onValueChange={toggleTheme} />
      </View>

      <TouchableOpacity style={[styles.createButton, { marginTop: 20 }]} onPress={() => navigation.navigate('ManageEmployees')}>
        <Text style={styles.createButtonText}>Управление сотрудниками</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.logoutButton, { marginTop: 20 }]} onPress={handleLogout}>
        <Text style={styles.logoutText}>Выйти</Text>
      </TouchableOpacity>
    </View>
  );
}
