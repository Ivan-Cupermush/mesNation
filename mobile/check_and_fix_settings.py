import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

errors = []

# 1. Проверка импорта иконки Settings
if "import { " not in content or "Settings" not in content.split("import { ")[1].split("} from 'lucide-react-native'")[0]:
    errors.append("Нет импорта иконки Settings")
    # Добавляем Settings в импорт lucide-react-native
    content = re.sub(
        r"(import \{ [^}]+) from 'lucide-react-native';",
        r"\1, Settings } from 'lucide-react-native';",
        content
    )

# 2. Проверка импорта SettingsScreen
if "import SettingsScreen" not in content:
    errors.append("Нет импорта SettingsScreen")
    content = content.replace(
        "import KpiScreen from './src/screens/crm/KpiScreen';",
        "import KpiScreen from './src/screens/crm/KpiScreen';\nimport SettingsScreen from './src/screens/SettingsScreen';"
    )

# 3. Проверка объявления SettingsStack
if "const SettingsStack = createNativeStackNavigator" not in content:
    errors.append("Нет объявления SettingsStack")
    content = content.replace(
        "const AuthStack = createNativeStackNavigator<AuthStackParamList>();",
        "const AuthStack = createNativeStackNavigator<AuthStackParamList>();\nconst SettingsStack = createNativeStackNavigator<any>();"
    )

# 4. Проверка функции SettingsStackNavigator
if "function SettingsStackNavigator" not in content:
    errors.append("Нет функции SettingsStackNavigator")
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
    content = content.replace(
        'function MainTabs({ onLogout }: { onLogout: () => void }) {',
        settings_stack_func + 'function MainTabs({ onLogout }: { onLogout: () => void }) {'
    )

# 5. Проверка вкладки SettingsTab в MainTabs
# Ищем блок MainTabs и проверяем, есть ли там SettingsTab
main_tabs_match = re.search(r'function MainTabs.*?return \([\s\S]*?</Tab\.Navigator>', content)
if main_tabs_match:
    main_tabs_content = main_tabs_match.group(0)
    if "SettingsTab" not in main_tabs_content:
        errors.append("Нет вкладки SettingsTab в MainTabs")
        # Добавляем вкладку перед </Tab.Navigator>
        settings_tab_code = '''      {currentUser && (currentUser.role_name === 'director' || currentUser.role_name === 'admin' || (currentUser.role_name || '').toLowerCase().includes('руководитель')) && (
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
        
        content = content.replace(
            main_tabs_content,
            main_tabs_content.replace('</Tab.Navigator>', settings_tab_code)
        )

if errors:
    print("Найдены и исправлены следующие проблемы:")
    for err in errors:
        print(f"  - {err}")
    
    with open('App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Файл App.tsx обновлён!")
else:
    print("✅ Все компоненты на месте. Проблема может быть в условии роли или кэше.")

# Выводим финальную проверку
print("\n=== Финальная проверка ===")
print("1. Импорт Settings:", "Settings" in content and "lucide-react-native" in content)
print("2. Импорт SettingsScreen:", "import SettingsScreen" in content)
print("3. SettingsStack:", "const SettingsStack" in content)
print("4. SettingsStackNavigator:", "function SettingsStackNavigator" in content)
print("5. SettingsTab в MainTabs:", "SettingsTab" in content and "currentUser" in content)
