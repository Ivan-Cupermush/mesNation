import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getToken } from './src/utils';
import AuthScreen from './src/screens/AuthScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import CreateChatScreen from './src/screens/CreateChatScreen';
import TopicListScreen from './src/screens/TopicListScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChatInfoScreen from './src/screens/ChatInfoScreen';
import AddMembersScreen from './src/screens/AddMembersScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import TopicInfoScreen from './src/screens/TopicInfoScreen';
import MediaListScreen from './src/screens/MediaListScreen';
import { ThemeProvider } from './src/theme/ThemeContext';
import { appStyles } from './src/styles/appStyles';

type RootStackParamList = {
  Auth: undefined;
  ChatList: undefined;
  Chat: { chatId: string; chatName: string; topicId?: number | null };
  CreateChat: undefined;
  TopicList: { chatId: string; chatName: string };
  Profile: undefined;
  ChatInfo: { chatId: string };
  AddMembers: { chatId: string };
  UserProfile: { userId: number; username: string; displayName: string; avatarUrl: string; role: string };
  TopicInfo: { chatId: string; topicId: number };
  MediaList: { chatId: string; type: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [initialRoute, setInitialRoute] = useState<string>('Auth');

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const res = await fetch('http://10.0.2.2:5000/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            setIsLoggedIn(true);
            setInitialRoute('ChatList');
            return;
          }
        } catch (e) {}
        try { const RNFS = require('react-native-fs'); await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`); } catch (e) {}
      }
      setIsLoggedIn(false);
      setInitialRoute('Auth');
    })();
  }, []);

  const handleLoginSuccess = () => { setIsLoggedIn(true); setInitialRoute('ChatList'); };
  const handleLogout = () => { setIsLoggedIn(false); setInitialRoute('Auth'); };

  if (isLoggedIn === null) return <View style={appStyles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}><ThemeProvider>
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
              <Stack.Screen name="ChatList" options={{ title: 'Мои чаты' }}>
                {(props) => <ChatListScreen {...props} onLogout={handleLogout} />}
              </Stack.Screen>
              <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Чат' }} />
              <Stack.Screen name="CreateChat" component={CreateChatScreen} options={{ title: 'Новый чат' }} />
              <Stack.Screen name="TopicList" component={TopicListScreen} options={{ title: 'Топики' }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профиль' }} />
              <Stack.Screen name="ChatInfo" component={ChatInfoScreen} options={{ title: 'Информация о чате' }} />
              <Stack.Screen name="AddMembers" component={AddMembersScreen} options={{ title: 'Добавить участников' }} />
              <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Профиль пользователя' }} />
              <Stack.Screen name="TopicInfo" component={TopicInfoScreen} options={{ title: 'Информация о топике' }} />
              <Stack.Screen name="MediaList" component={MediaListScreen} options={{ title: 'Файлы' }} />
            </>
          ) : (
            <Stack.Screen name="Auth" options={{ headerShown: false }}>
              {(props) => <AuthScreen {...props} onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider></GestureHandlerRootView>
  );
}
