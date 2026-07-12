import React, { useState } from 'react';
import {
  View, Text, TextInput, Button, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as RNFS from 'react-native-fs';
import { appStyles } from '../styles/appStyles';

const SERVER_URL = 'http://10.0.2.2:5000';
const TOKEN_PATH = `${RNFS.DocumentDirectoryPath}/token.txt`;

let currentUserId: number | null = null;
let currentUserName: string = '';

export function getCurrentUserId() { return currentUserId; }
export function getCurrentUserName() { return currentUserName; }

async function saveToken(token: string) { await RNFS.writeFile(TOKEN_PATH, token, 'utf8'); }

export default function AuthScreen({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const url = isRegister ? `${SERVER_URL}/api/auth/register` : `${SERVER_URL}/api/auth/login`;
      const body = isRegister
        ? { username, email, password, display_name: displayName || username }
        : { username, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        await saveToken(data.token);
        currentUserId = data.user.id;
        currentUserName = data.user.display_name || data.user.username;
        onLoginSuccess(data.token, data.user);
      } else {
        Alert.alert('Ошибка', data.error || 'Неизвестная ошибка');
        setLoading(false);
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Сервер недоступен');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={appStyles.authContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={appStyles.title}>{isRegister ? 'Регистрация' : 'Вход'}</Text>
      <TextInput style={appStyles.input} placeholder="Имя пользователя" value={username} onChangeText={setUsername} autoCapitalize="none" />
      {isRegister && (
        <>
          <TextInput style={appStyles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={appStyles.input} placeholder="Отображаемое имя" value={displayName} onChangeText={setDisplayName} />
        </>
      )}
      <TextInput style={appStyles.input} placeholder="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title={loading ? 'Подождите...' : (isRegister ? 'Зарегистрироваться' : 'Войти')} onPress={handleSubmit} disabled={loading} />
      <Text style={appStyles.switchText} onPress={() => setIsRegister(!isRegister)}>
        {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </Text>
    </KeyboardAvoidingView>
  );
}
