import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Button, FlatList,
  StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import io from 'socket.io-client';

const SERVER_URL = 'http://10.0.2.2:5000';
const CHAT_ID = 'general';
const TOKEN_PATH = `${RNFS.DocumentDirectoryPath}/token.txt`;

// ---------- Экран авторизации ----------
function AuthScreen({ onLogin }: { onLogin: (token: string, user: any) => void }) {
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
        // Сохраняем токен в файл
        await RNFS.writeFile(TOKEN_PATH, data.token, 'utf8');
        onLogin(data.token, data.user);
      } else {
        Alert.alert('Ошибка', data.error || 'Неизвестная ошибка');
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.authContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={styles.title}>{isRegister ? 'Регистрация' : 'Вход'}</Text>
      <TextInput style={styles.input} placeholder="Имя пользователя" value={username} onChangeText={setUsername} autoCapitalize="none" />
      {isRegister && (
        <>
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Отображаемое имя" value={displayName} onChangeText={setDisplayName} />
        </>
      )}
      <TextInput style={styles.input} placeholder="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title={loading ? 'Подождите...' : (isRegister ? 'Зарегистрироваться' : 'Войти')} onPress={handleSubmit} disabled={loading} />
      <Text style={styles.switchText} onPress={() => setIsRegister(!isRegister)}>
        {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
      </Text>
    </KeyboardAvoidingView>
  );
}

// ---------- Экран чата ----------
function ChatScreen({ token, user }: { token: string; user: any }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = React.useRef<any>(null);
  const flatListRef = React.useRef<FlatList>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_chat', CHAT_ID);

    fetch(`${SERVER_URL}/api/messages/${CHAT_ID}`)
      .then(res => res.json())
      .then(data => { setMessages(data); setLoading(false); })
      .catch(() => setLoading(false));

    socket.on('new_message', (msg: any) => setMessages(prev => [...prev, msg]));

    return () => {
      socket.off('new_message');
      socket.disconnect();
    };
  }, [token]);

  const sendMessage = () => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit('send_message', { chatId: CHAT_ID, senderId: user.id, text });
    setText('');
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        renderItem={({ item }) => (
          <View style={styles.message}>
            <Text style={styles.sender}>{item.sender_id === user.id ? 'Я' : `User ${item.sender_id}`}:</Text>
            <Text>{item.text}</Text>
            {item.file_url && <Text style={styles.file}>📎 {item.file_name}</Text>}
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="Сообщение..." />
        <Button title="Отправить" onPress={sendMessage} />
      </View>
    </View>
  );
}

// ---------- Корневой компонент ----------
export default function App() {
  const [auth, setAuth] = useState<{ token: string; user: any } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const exists = await RNFS.exists(TOKEN_PATH);
        if (exists) {
          const token = await RNFS.readFile(TOKEN_PATH, 'utf8');
          if (token) {
            const res = await fetch(`${SERVER_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const user = await res.json();
              setAuth({ token, user });
              return;
            }
          }
        }
      } catch (e) {}
      setAuth(null);
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    if (auth !== null) setChecking(false);
  }, [auth]);

  const handleLogin = (token: string, user: any) => setAuth({ token, user });
  const handleLogout = async () => {
    try {
      await RNFS.unlink(TOKEN_PATH);
    } catch (e) {}
    setAuth(null);
  };

  if (checking) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  if (!auth) return <AuthScreen onLogin={handleLogin} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Привет, {auth.user.display_name || auth.user.username}</Text>
        <Button title="Выйти" onPress={handleLogout} />
      </View>
      <ChatScreen token={auth.token} user={auth.user} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginVertical: 5, borderRadius: 5 },
  switchText: { color: '#007bff', textAlign: 'center', marginTop: 10 },
  message: { padding: 8, borderBottomWidth: 1, borderColor: '#eee' },
  sender: { fontWeight: 'bold' },
  file: { color: 'blue' },
  inputRow: { flexDirection: 'row', padding: 8, alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#ccc', paddingTop: 30 },
  headerText: { fontSize: 16, fontWeight: 'bold' },
});
