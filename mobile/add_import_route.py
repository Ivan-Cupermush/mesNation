with open('src/screens/SettingsScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Добавляем импорт KpiImportScreen
if 'import KpiImportScreen' not in content:
    content = content.replace(
        "import React from 'react';",
        "import React from 'react';\nimport KpiImportScreen from './admin/KpiImportScreen';"
    )

# Добавляем экран в навигацию
if 'name="KpiImport"' not in content:
    content = content.replace(
        '</SettingsStack.Navigator>',
        '''      <SettingsStack.Screen 
        name="KpiImport" 
        component={KpiImportScreen} 
        options={{ title: 'Импорт KPI' }}
      />
    </SettingsStack.Navigator>'''
    )

# Добавляем кнопку в UI
if 'Импорт KPI' not in content:
    button_code = '''      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate('KpiImport')}
      >
        <FileSpreadsheet size={20} color="#1F7A52" />
        <Text style={styles.menuItemText}>Импорт KPI из Excel</Text>
        <ChevronRight size={20} color="#9ca3af" />
      </TouchableOpacity>'''
    
    import re
    content = re.sub(
        r'(</ScrollView>\s*</SafeAreaView>)',
        button_code + r'\n\1',
        content
    )

# Добавляем импорт иконок
if 'FileSpreadsheet' not in content:
    content = content.replace(
        "import { Settings, User, Shield, LogOut } from 'lucide-react-native';",
        "import { Settings, User, Shield, LogOut, FileSpreadsheet, ChevronRight } from 'lucide-react-native';"
    )

with open('src/screens/SettingsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Экран импорта добавлен в настройки')
