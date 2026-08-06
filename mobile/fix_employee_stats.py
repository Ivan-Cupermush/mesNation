import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Добавляем импорт EmployeeStatsScreen после KpiScreen
if 'import EmployeeStatsScreen' not in content:
    content = content.replace(
        "import KpiScreen from './src/screens/crm/KpiScreen';",
        "import KpiScreen from './src/screens/crm/KpiScreen';\nimport EmployeeStatsScreen from './src/screens/crm/EmployeeStatsScreen';"
    )

# 2. Добавляем экран в KpiStack
# Ищем последний KpiStack.Screen и добавляем новый после него
if 'name="EmployeeStats"' not in content:
    # Находим место перед закрывающим </KpiStack.Navigator>
    pattern = r'(      <KpiStack\.Screen\s+name="CreateUserRole"[^>]*>\s*<\/KpiStack\.Screen>)'
    replacement = r'''\1
      <KpiStack.Screen
        name="EmployeeStats"
        component={EmployeeStatsScreen}
        options={{ title: 'Статистика сотрудника', headerShown: false }}
      />'''
    
    content = re.sub(pattern, replacement, content)

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ App.tsx обновлен корректно')
