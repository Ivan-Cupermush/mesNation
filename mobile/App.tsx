import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getToken } from './src/utils';
import AuthScreen from './src/screens/AuthScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import CreateChatScreen from './src/screens/CreateChatScreen';
import { appStyles } from './src/styles/appStyles';

type RootStackParamList = {
  Auth: undefined;
  ChatList: undefined;
  Chat: { chatId: string; chatName: string };
  CreateChat: undefined;
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
        // токен невалиден – удалим файл
        try {
          const RNFS = require('react-native-fs');
          await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`);
        } catch (e) {}
      }
      setIsLoggedIn(false);
      setInitialRoute('Auth');
    })();
  }, []);

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    setInitialRoute('ChatList');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setInitialRoute('Auth');
  };

  if (isLoggedIn === null) return <View style={appStyles.centered}><ActivityIndicator size="large" /></View>;

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
            <Stack.Screen name="ChatList" options={{ title: 'Мои чаты' }}>
              {(props) => <ChatListScreen {...props} onLogout={handleLogout} />}
            </Stack.Screen>
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
