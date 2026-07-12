import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as RNFS from 'react-native-fs';
import CreateTaskScreen from './src/screens/crm/CreateTaskScreen';
import TaskDetailScreen from './src/screens/crm/TaskDetailScreen';

// ===== Экраны мессенджера (от Ромы) =====
import AuthScreen from './src/screens/AuthScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import CreateChatScreen from './src/screens/CreateChatScreen';
import ChatInfoScreen from './src/screens/ChatInfoScreen';
import TopicListScreen from './src/screens/TopicListScreen';
import TopicInfoScreen from './src/screens/TopicInfoScreen';
import AddMembersScreen from './src/screens/AddMembersScreen';
import MediaListScreen from './src/screens/MediaListScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';

// ===== Экраны CRM =====
import TasksScreen from './src/screens/crm/TasksScreen';
import NotesScreen from './src/screens/crm/NotesScreen';
import NoteEditorScreen from './src/screens/crm/NoteEditorScreen';
import KpiScreen from './src/screens/crm/KpiScreen';
import KnowledgeScreen from './src/screens/crm/KnowledgeScreen';

// ===== Тема =====
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { SERVER_URL, getToken } from './src/utils';

// ========== Навигационные типы ==========
type ChatStackParamList = {
  ChatList: undefined;
  Chat: { chatId: string; chatName: string; topicId?: number | null; messageId?: number };
  CreateChat: undefined;
  ChatInfo: { chatId: string };
  TopicList: { chatId: string; chatName: string };
  TopicInfo: { chatId: string; topicId: number };
  AddMembers: { chatId: string };
  MediaList: { chatId: string; type: 'files' | 'images' };
  Profile: undefined;
  UserProfile: { userId: number; username: string; displayName: string; avatarUrl: string; role: string };
};

type TasksStackParamList = { 
  TasksHome: undefined; 
  CreateTask: undefined;
  TaskDetail: { taskId: number };
};

type NotesStackParamList = { 
  NotesHome: undefined;
  NoteEditor: { noteId?: number; noteDate?: string };
};

type KpiStackParamList = { KpiHome: undefined };
type KnowledgeStackParamList = { KnowledgeHome: undefined };
type AuthStackParamList = { Auth: undefined };

type MainTabsParamList = {
  TasksTab: undefined;
  NotesTab: undefined;
  KpiTab: undefined;
  ChatTab: undefined;
  KnowledgeTab: undefined;
};

const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const NotesStack = createNativeStackNavigator<NotesStackParamList>();
const KpiStack = createNativeStackNavigator<KpiStackParamList>();
const KnowledgeStack = createNativeStackNavigator<KnowledgeStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();

// ========== Обёртка для Stack-ов с общим стилем ==========
const useHeaderStyle = () => {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.header, shadowOpacity: 0, elevation: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    headerTintColor: colors.accent,
    headerTitleStyle: { fontWeight: '600' as const, fontSize: 17, color: colors.textPrimary },
  };
};

// ========== Chat Stack (мессенджер) ==========
function ChatStackNavigator({ onLogout }: { onLogout: () => void }) {
  const headerStyle = useHeaderStyle();
  return (
    <ChatStack.Navigator screenOptions={headerStyle}>
      <ChatStack.Screen
        name="ChatList"
        options={{ title: 'mesNation', headerShown: false }}
        children={(props) => <ChatListScreen {...props} onLogout={onLogout} />}
      />
      <ChatStack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <ChatStack.Screen name="CreateChat" component={CreateChatScreen} options={{ title: 'Новый чат' }} />
      <ChatStack.Screen name="ChatInfo" component={ChatInfoScreen} options={{ title: 'Информация о чате' }} />
      <ChatStack.Screen name="TopicList" component={TopicListScreen} options={{ title: 'Топики' }} />
      <ChatStack.Screen name="TopicInfo" component={TopicInfoScreen} options={{ title: 'Топик' }} />
      <ChatStack.Screen name="AddMembers" component={AddMembersScreen} options={{ title: 'Добавить участников' }} />
      <ChatStack.Screen name="MediaList" component={MediaListScreen} options={{ title: 'Медиа' }} />
      <ChatStack.Screen
        name="Profile"
        options={{ title: 'Профиль' }}
        children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      />
      <ChatStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Профиль' }} />
    </ChatStack.Navigator>
  );
}

// ========== Tasks Stack ==========
function TasksStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <TasksStack.Navigator screenOptions={headerStyle}>
      <TasksStack.Screen name="TasksHome" component={TasksScreen} options={{ headerShown: false }} />
      <TasksStack.Screen name="CreateTask" component={CreateTaskScreen} options={{ title: 'Новая задача' }} />
      <TasksStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Задача' }} />
    </TasksStack.Navigator>
  );
}

// ========== Notes Stack ==========
function NotesStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <NotesStack.Navigator screenOptions={headerStyle}>
      <NotesStack.Screen name="NotesHome" component={NotesScreen} options={{ title: 'Заметки' }} />
      <NotesStack.Screen 
        name="NoteEditor" 
        component={NoteEditorScreen} 
        options={{ title: 'Редактор', headerShown: false }} 
      />
    </NotesStack.Navigator>
  );
}

// ========== KPI Stack ==========
function KpiStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <KpiStack.Navigator screenOptions={headerStyle}>
      <KpiStack.Screen name="KpiHome" component={KpiScreen} options={{ title: 'Статистика' }} />
    </KpiStack.Navigator>
  );
}

// ========== Knowledge Stack ==========
function KnowledgeStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <KnowledgeStack.Navigator screenOptions={headerStyle}>
      <KnowledgeStack.Screen name="KnowledgeHome" component={KnowledgeScreen} options={{ title: 'База знаний' }} />
    </KnowledgeStack.Navigator>
  );
}

// ========== Иконка вкладки ==========
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tabIcon, { opacity: focused ? 1 : 0.5 }]}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}

// ========== Главный Tab-навигатор ==========
function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabBarIconActive,
        tabBarInactiveTintColor: colors.tabBarIcon,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="TasksTab"
        component={TasksStackNavigator}
        options={{
          title: 'Задачи',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="NotesTab"
        component={NotesStackNavigator}
        options={{
          title: 'Заметки',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📝" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="KpiTab"
        component={KpiStackNavigator}
        options={{
          title: 'Статистика',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        options={{
          title: 'Чаты',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
        children={() => <ChatStackNavigator onLogout={onLogout} />}
      />
      <Tab.Screen
        name="KnowledgeTab"
        component={KnowledgeStackNavigator}
        options={{
          title: 'База',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📚" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ========== Auth Stack ==========
function AuthStackNavigator({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Auth" children={(props) => <AuthScreen {...props} onLoginSuccess={onLoginSuccess} />} />
    </AuthStack.Navigator>
  );
}

// ========== Корневой компонент ==========
function RootNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const res = await fetch(`${SERVER_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            setIsLoggedIn(true);
            return;
          }
        } catch (e) {}
        try { await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`); } catch (e) {}
      }
      setIsLoggedIn(false);
    })();
  }, []);

  const handleLoginSuccess = (_token: string, _user: any) => setIsLoggedIn(true);
  const handleLogout = async () => {
    try { await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`); } catch (e) {}
    setIsLoggedIn(false);
  };

  if (isLoggedIn === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.splashText}>mesNation</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isLoggedIn ? <MainTabs onLogout={handleLogout} /> : <AuthStackNavigator onLoginSuccess={handleLoginSuccess} />}
    </NavigationContainer>
  );
}

// ========== Точка входа ==========
export default function App() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  tabIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  splashText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#6366F1' },
});
