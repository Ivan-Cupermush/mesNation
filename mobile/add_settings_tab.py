with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

settings_tab = '''      {currentUser && (currentUser.role_name === 'director' || currentUser.role_name === 'admin') && (
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

# Заменяем закрывающий </Tab.Navigator> в MainTabs
# Находим последний </Tab.Navigator> перед function AuthStackNavigator
import re
pattern = r'(      <Tab\.Screen\s+name="KnowledgeTab"[^>]*>[\s\S]*?</Tab\.Screen>\s*)\s*</Tab\.Navigator>'
replacement = r'\1' + settings_tab

if 'SettingsStackNavigator' in content and 'SettingsTab' not in content.split('function MainTabs')[1].split('function AuthStackNavigator')[0]:
    content = re.sub(pattern, replacement, content, count=1)
    with open('App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('✅ SettingsTab добавлен в MainTabs')
else:
    print(' SettingsTab уже есть или не удалось добавить')
