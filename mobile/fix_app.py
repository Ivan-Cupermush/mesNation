import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Добавляю импорт SettingsScreen (после KpiScreen)
if 'import SettingsScreen' not in content:
    content = content.replace(
        "import KpiScreen from './src/screens/crm/KpiScreen';",
        "import KpiScreen from './src/screens/crm/KpiScreen';\nimport SettingsScreen from './src/screens/SettingsScreen';"
    )

# 2. Добавляю иконку Settings в импорт lucide
content = content.replace(
    "import { ListTodo, NotebookPen, ChartColumn, MessageCircle, BookOpen } from 'lucide-react-native';",
    "import { ListTodo, NotebookPen, ChartColumn, MessageCircle, BookOpen, Settings } from 'lucide-react-native';"
)

# 3. Добавляю useState и useEffect в импорты react если их нет
if 'useState, useEffect, useContext' not in content and 'useState, useEffect' not in content:
    content = content.replace(
        "import React, { useState, useEffect }",
        "import React, { useState, useEffect, useContext }"
    )

# 4. Импортирую useAuth или AuthContext если есть
if 'AuthContext' not in content and 'useAuth' not in content:
    # Добавляю import api
    if "import { api }" not in content:
        content = content.replace(
            "import { useTheme } from './src/theme/ThemeContext';",
            "import { useTheme } from './src/theme/ThemeContext';\nimport { api } from './src/services/api';"
        )

# 5. Нахожу MainTabs и добавляю useState для currentUser
if 'const [currentUser, setCurrentUser]' not in content:
    # Ищу function MainTabs
    main_tabs_pattern = r'(function MainTabs\(\{ onLogout \}: \{ onLogout: \(\) => void \}\) \{[\s\S]*?const \{ colors \} = useTheme\(\);)'
    replacement = r'\1\n  const [currentUser, setCurrentUser] = useState<any>(null);\n\n  useEffect(() => {\n    api.getCurrentUser()\n      .then(setCurrentUser)\n      .catch(console.error);\n  }, []);'
    content = re.sub(main_tabs_pattern, replacement, content, count=1)

# 6. Нахожу SettingsStackNavigator или создаю его после KpiStackNavigator
if 'function SettingsStackNavigator' not in content:
    settings_stack = '''

// ========== Settings Stack (только для директора) ==========
function SettingsStackNavigator() {
  const headerStyle = useHeaderStyle();
  return (
    <SettingsStack.Navigator screenOptions={headerStyle}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ headerShown: false }} />
      <SettingsStack.Screen name="AssignKpi" component={AssignKpiScreen} options={{ headerShown: false }} />
      <SettingsStack.Screen name="ImportExcel" component={ImportExcelScreen} options={{ title: 'Импорт Excel' }} />
      <SettingsStack.Screen
        name="RoleTreeEditor"
        component={RoleTreeEditorScreen}
        options={{ title: 'Дерево прав', headerShown: false }}
      />
      <SettingsStack.Screen
        name="CreateUserRole"
        component={CreateUserRoleScreen}
        options={{ title: 'Новый пользователь', headerShown: false }}
      />
    </SettingsStack.Navigator>
  );
}
'''
    # Вставляю после KpiStackNavigator
    kpi_stack_end = content.find('function KpiStackNavigator')
    if kpi_stack_end > 0:
        # Нахожу закрывающую скобку функции
        brace_count = 0
        start = kpi_stack_end
        for i in range(start, len(content)):
            if content[i] == '{':
                brace_count += 1
            elif content[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    insert_pos = i + 1
                    content = content[:insert_pos] + settings_stack + content[insert_pos:]
                    break

# 7. Добавляю SettingsStack в константы навигации
if 'const SettingsStack = createNativeStackNavigator' not in content:
    content = content.replace(
        'const ChatStack = createNativeStackNavigator();',
        'const ChatStack = createNativeStackNavigator();\nconst SettingsStack = createNativeStackNavigator();'
    )

# 8. Добавляю условный Tab.Screen для Settings перед закрывающим </Tab.Navigator>
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

if 'SettingsTab' not in content:
    content = content.replace(
        '    </Tab.Navigator>',
        settings_tab
    )

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ App.tsx обновлён')
