import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Исправляем импорты
if 'Settings' not in content:
    content = content.replace(
        "import { ListTodo, NotebookPen, ChartColumn, MessageCircle, BookOpen } from 'lucide-react-native';",
        "import { ListTodo, NotebookPen, ChartColumn, MessageCircle, BookOpen, Settings } from 'lucide-react-native';"
    )

if 'import SettingsScreen' not in content:
    content = content.replace(
        "import KpiScreen from './src/screens/crm/KpiScreen';",
        "import KpiScreen from './src/screens/crm/KpiScreen';\nimport SettingsScreen from './src/screens/SettingsScreen';"
    )

if "import { api }" not in content:
    content = content.replace(
        "import { useTheme } from './src/theme/ThemeContext';",
        "import { useTheme } from './src/theme/ThemeContext';\nimport { api } from './src/services/api';"
    )

# 2. Добавляем SettingsStack
if 'const SettingsStack = createNativeStackNavigator' not in content:
    content = content.replace(
        'const AuthStack = createNativeStackNavigator<AuthStackParamList>();',
        'const AuthStack = createNativeStackNavigator<AuthStackParamList>();\nconst SettingsStack = createNativeStackNavigator<any>();'
    )

# 3. Добавляем функцию SettingsStackNavigator (перед MainTabs)
settings_stack_func = '''
// ========== Settings Stack ==========
function SettingsStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <SettingsStack.Navigator screenOptions={headerStyle}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ headerShown: false }} />
      <SettingsStack.Screen name="AssignKpi" component={AssignKpiScreen} options={{ headerShown: false }} />
      <SettingsStack.Screen name="ImportExcel" component={ImportExcelScreen} options={{ title: 'Импорт Excel' }} />
      <SettingsStack.Screen name="RoleTreeEditor" component={RoleTreeEditorScreen} options={{ title: 'Дерево прав', headerShown: false }} />
      <SettingsStack.Screen name="CreateUserRole" component={CreateUserRoleScreen} options={{ title: 'Новый пользователь', headerShown: false }} />
    </SettingsStack.Navigator>
  );
}

'''
if 'function SettingsStackNavigator' not in content:
    content = content.replace(
        'function MainTabs({ onLogout }: { onLogout: () => void }) {',
        settings_stack_func + 'function MainTabs({ onLogout }: { onLogout: () => void }) {'
    )

# 4. Добавляем currentUser и useEffect в MainTabs
if 'const [currentUser, setCurrentUser]' not in content:
    content = content.replace(
        'function MainTabs({ onLogout }: { onLogout: () => void }) {\n  const { colors } = useTheme();',
        '''function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { colors } = useTheme();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    api.getCurrentUser()
      .then(setCurrentUser)
      .catch(console.error);
  }, []);'''
    )

# 5. Добавляем Tab.Screen для Settings перед закрывающим </Tab.Navigator>
settings_tab = '''      {currentUser?.role_name === 'director' && (
        <Tab.Screen
          name="SettingsTab"
          component={SettingsStackNavigator}
          options={{
            title: 'Настройки',
            tabBarIcon: ({ focused }) => <TabIcon icon={Settings} focused={focused} />,
          }}
        />
      )}
    </Tab.Navigator>'''

if 'component={SettingsStackNavigator}' not in content:
    # Находим закрывающий Tab.Navigator в MainTabs и вставляем перед ним
    content = re.sub(
        r'(      <Tab\.Screen\s+name="KnowledgeTab"[^>]+>[\s\S]*?</Tab\.Screen>\s*)\s*</Tab\.Navigator>',
        r'\1' + settings_tab,
        content
    )

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ App.tsx полностью восстановлен (Настройки, currentUser, импорты)')
