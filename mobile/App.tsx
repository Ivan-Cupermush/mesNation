import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Button, FlatList, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  TouchableOpacity, Image,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RNFS from 'react-native-fs';
import io from 'socket.io-client';

const SERVER_URL = 'http://192.168.3.18:5000';
const TOKEN_PATH = `${RNFS.DocumentDirectoryPath}/token.txt`;

// Глобальные переменные для текущего пользователя
let currentUserId: number | null = null;
let currentUserName: string = '';

// ---------- Типы навигации ----------
type RootStackParamList = {
  Auth: undefined;
  ChatList: undefined;
  Chat: { chatId: string; chatName: string };
  CreateChat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ---------- Утилиты для токена ----------
async function getToken(): Promise<string | null> {
  try {
    const exists = await RNFS.exists(TOKEN_PATH);
    if (exists) return await RNFS.readFile(TOKEN_PATH, 'utf8');
  } catch (e) {}
  return null;
}
async function saveToken(token: string) { await RNFS.writeFile(TOKEN_PATH, token, 'utf8'); }
async function removeToken() { try { await RNFS.unlink(TOKEN_PATH); } catch (e) {} }

// ========== Экран авторизации (стабильный, без изменений) ==========
function AuthScreen({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) {
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
        // Сохраняем ID и имя пользователя глобально
        currentUserId = data.user.id;
        currentUserName = data.user.display_name || data.user.username;
        onLoginSuccess(data.token, data.user);
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

// ========== Список чатов (улучшенный дизайн) ==========
function ChatListScreen({ navigation }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChats = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setChats(data);
    } catch (e) {
      // Пока API нет, просто пустой список
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const handleLogout = async () => {
    await removeToken();
    currentUserId = null;
    currentUserName = '';
    navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Чаты</Text>
      {/* Статичная кнопка для общего чата */}
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('Chat', { chatId: 'general', chatName: 'Общий чат' })}
      >
        <View style={styles.chatItemContent}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>G</Text>
          </View>
          <View style={styles.chatInfo}>
            <Text style={styles.chatName}>Общий чат</Text>
            <Text style={styles.lastMsg}>Доступен всем сотрудникам</Text>
          </View>
        </View>
      </TouchableOpacity>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => navigation.navigate('Chat', { chatId: item.id.toString(), chatName: item.name || `Чат ${item.id}` })}
          >
            <View style={styles.chatItemContent}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{item.name || `Чат с пользователем ${item.other_user_id}`}</Text>
                {item.last_message && <Text style={styles.lastMsg}>{item.last_message.text?.substring(0, 40)}</Text>}
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('CreateChat')}>
          <Text style={styles.createButtonText}>+ Создать чат</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Выйти</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ========== Экран чата (с кнопкой назад и senderId) ==========
function ChatScreen({ route, navigation }: any) {
  const { chatId, chatName } = route.params;
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = React.useRef<any>(null);
  const flatListRef = React.useRef<FlatList>(null);

  // Настроим заголовок с кнопкой "Назад"
  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: chatName,
      headerStyle: { backgroundColor: '#f8f9fa' },
      headerTintColor: '#007bff',
      headerTitleStyle: { fontWeight: '600', fontSize: 18 },
    });
  }, [navigation, chatName]);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const socket = io(SERVER_URL, { auth: { token } });
      socketRef.current = socket;
      socket.emit('join_chat', chatId);

      try {
        const res = await fetch(`${SERVER_URL}/api/messages/${chatId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setMessages(data);
      } catch (e) {}

      socket.on('new_message', (msg: any) => {
        // Принимаем только сообщения для этого чата
        if (msg.chat_id === chatId) {
          setMessages(prev => [...prev, msg]);
        }
      });
      setLoading(false);

      return () => {
        socket.off('new_message');
        socket.disconnect();
      };
    })();
  }, [chatId]);

  const sendMessage = () => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit('send_message', {
      chatId,
      senderId: currentUserId || 1, // Берем из глобальной переменной
      text,
    });
    setText('');
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.sender_id === currentUserId ? styles.myMessage : styles.otherMessage]}>
            <Text style={styles.sender}>{item.sender_id}:</Text>
            <Text style={styles.messageText}>{item.text}</Text>
            {item.file_url && <Text style={styles.file}>📎 {item.file_name}</Text>}
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.messageInput}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение..."
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ========== Создание чата (улучшенный UI) ==========
function CreateChatScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'private' | 'group'>('group');
  const [userIds, setUserIds] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) return;
    try {
      const ids = userIds.split(',').map(id => parseInt(id.trim()));
      const body: any = { type, user_ids: ids };
      if (type === 'group') body.name = name;
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Успех', 'Чат создан');
        navigation.goBack();
      } else {
        Alert.alert('Ошибка', data.error);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.authContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={styles.title}>Новый чат</Text>
      <Text style={styles.label}>Тип</Text>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeButton, type === 'group' && styles.typeButtonActive]}
          onPress={() => setType('group')}
        >
          <Text style={[styles.typeButtonText, type === 'group' && styles.typeButtonTextActive]}>Группа</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, type === 'private' && styles.typeButtonActive]}
          onPress={() => setType('private')}
        >
          <Text style={[styles.typeButtonText, type === 'private' && styles.typeButtonTextActive]}>Личный</Text>
        </TouchableOpacity>
      </View>
      {type === 'group' && (
        <TextInput style={styles.input} placeholder="Название группы" value={name} onChangeText={setName} />
      )}
      <TextInput
        style={styles.input}
        placeholder="ID участников через запятую (например: 2,3)"
        value={userIds}
        onChangeText={setUserIds}
        keyboardType="numeric"
      />
      <TouchableOpacity style={[styles.createButton, loading && styles.disabledButton]} onPress={handleCreate} disabled={loading}>
        <Text style={styles.createButtonText}>{loading ? 'Создаём...' : 'Создать чат'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ========== Главный компонент с навигацией ==========
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [initialRoute, setInitialRoute] = useState<string>('Auth');

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const res = await fetch(`${SERVER_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const user = await res.json();
            currentUserId = user.id;
            currentUserName = user.display_name || user.username;
            setIsLoggedIn(true);
            setInitialRoute('ChatList');
            return;
          }
        } catch (e) {}
        await removeToken();
      }
      setIsLoggedIn(false);
      setInitialRoute('Auth');
    })();
  }, []);

  const handleLoginSuccess = (token: string, user: any) => {
    setIsLoggedIn(true);
    setInitialRoute('ChatList');
  };

  if (isLoggedIn === null) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#f8f9fa' },
          headerTintColor: '#007bff',
          headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        }}
      >
        {isLoggedIn ? (
          <>
            <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: 'Мои чаты' }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Чат' }} />
            <Stack.Screen name="CreateChat" component={CreateChatScreen} options={{ title: 'Новый чат' }} />
          </>
        ) : (
          <Stack.Screen name="Auth" options={{ headerShown: false }}>
            {(props) => <AuthScreen {...props} onLoginSuccess={handleLoginSuccess} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ========== Стили (улучшенные) ==========
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  screenTitle: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', padding: 16, paddingTop: 10 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 25, color: '#1a1a1a' },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', padding: 12, marginVertical: 6, borderRadius: 10,
    backgroundColor: '#f8f8f8', fontSize: 16,
  },
  switchText: { color: '#007bff', textAlign: 'center', marginTop: 15, fontSize: 14 },
  chatItem: {
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 12,
    padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  chatItemContent: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#007bff', justifyContent: 'center',
    alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  chatInfo: { flex: 1 },
  chatName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  lastMsg: { color: '#8e8e93', marginTop: 3, fontSize: 13 },
  buttons: { padding: 16, gap: 10 },
  createButton: {
    backgroundColor: '#007bff', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    marginVertical: 6,
  },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabledButton: { opacity: 0.6 },
  logoutButton: {
    backgroundColor: '#e9ecef', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  logoutText: { color: '#343a40', fontSize: 16, fontWeight: '500' },
  messageBubble: {
    maxWidth: '80%', marginVertical: 3, padding: 10, borderRadius: 16,
    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
  },
  myMessage: {
    alignSelf: 'flex-end', backgroundColor: '#007bff', borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  otherMessage: {
    alignSelf: 'flex-start', backgroundColor: '#e9ecef', borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  sender: { fontWeight: '700', fontSize: 12, marginBottom: 2, color: '#fff' },
  messageText: { fontSize: 15, color: '#fff' },
  file: { color: '#d4af37', marginTop: 3, fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e0e0e0',
  },
  messageInput: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15, backgroundColor: '#f8f8f8',
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#007bff', justifyContent: 'center',
    alignItems: 'center', marginLeft: 8,
  },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '500', marginTop: 10, marginBottom: 4, color: '#1a1a1a' },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  typeButton: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center', marginHorizontal: 4, backgroundColor: '#fff',
  },
  typeButtonActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  typeButtonText: { fontSize: 15, color: '#1a1a1a' },
  typeButtonTextActive: { color: '#fff' },
});
