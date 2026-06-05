import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function ServerSetupScreen({ onConnected }: { onConnected: (url: string) => void }) {
  const [url, setUrl] = useState('http://');
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const handleConnect = () => {
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      Alert.alert('Ошибка', 'Адрес должен начинаться с http:// или https://');
      return;
    }
    setLoading(true);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${cleanUrl}/api/health`);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.status === 'ok') {
            onConnected(cleanUrl);
          } else {
            Alert.alert('Ошибка', 'Сервер недоступен');
          }
        } catch (e) {
          Alert.alert('Ошибка', 'Некорректный ответ сервера');
        }
        setLoading(false);
      };
      xhr.onerror = () => {
        Alert.alert('Ошибка', 'Не удалось подключиться');
        setLoading(false);
      };
      xhr.timeout = 10000;
      xhr.ontimeout = () => {
        Alert.alert('Ошибка', 'Превышено время ожидания');
        setLoading(false);
      };
      xhr.send();
    } catch (e: any) {
      Alert.alert('Ошибка', `Исключение: ${e.message}`);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.authContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={[styles.title, { marginBottom: 30 }]}>Подключение к серверу</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.1:5000"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TouchableOpacity
        style={[styles.createButton, loading && styles.disabledButton]}
        onPress={handleConnect}
        disabled={loading}
      >
        <Text style={styles.createButtonText}>{loading ? 'Проверка...' : 'Подключиться'}</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator style={{ marginTop: 15 }} />}
    </KeyboardAvoidingView>
  );
}
