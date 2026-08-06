with open('App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Находим function MainTabs
start = None
for i, line in enumerate(lines):
    if line.startswith('function MainTabs'):
        start = i
        break

if start is None:
    print('⚠ MainTabs не найден')
    exit(1)

# Находим первый </Tab.Navigator> после MainTabs
end = None
for j in range(start, len(lines)):
    if '</Tab.Navigator>' in lines[j]:
        end = j
        break

block = ''.join(lines[start:end])

if end is None or 'name="SettingsTab"' in block:
    print('⚠ SettingsTab уже есть или место не найдено')
    exit(0)

tab_jsx = '''      {currentUser && (currentUser.role_name === 'director' || currentUser.role_name === 'admin' || (currentUser.role_name || '').toLowerCase().includes('руководитель')) && (
        <Tab.Screen
          name="SettingsTab"
          component={SettingsStackNavigator}
          options={{
            title: 'Настройки',
            tabBarIcon: ({ focused }) => <TabIcon icon={Settings} focused={focused} />,
          }}
        />
      )}
'''

lines.insert(end, tab_jsx)

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('✅ SettingsTab добавлен в JSX MainTabs')
