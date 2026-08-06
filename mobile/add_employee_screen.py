with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Ищем место перед </KpiStack.Navigator> и добавляем экран
if 'name="EmployeeStats"' not in content:
    screen_code = '''      <KpiStack.Screen
        name="EmployeeStats"
        component={EmployeeStatsScreen}
        options={{ title: 'Статистика сотрудника', headerShown: false }}
      />
    </KpiStack.Navigator>'''
    
    content = content.replace(
        '    </KpiStack.Navigator>',
        screen_code
    )
    
    with open('App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print('✅ Экран EmployeeStats добавлен в KpiStack')
else:
    print('⚠ Экран уже существует')
