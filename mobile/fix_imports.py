with open('src/screens/crm/EmployeeStatsScreen.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # Убираем мусорные TouchableOpacity из неправильных импортов
    line = line.replace('import { TouchableOpacity,  SafeAreaView }', 'import { SafeAreaView }')
    line = line.replace('import { TouchableOpacity,  useFocusEffect }', 'import { useFocusEffect }')
    
    # Добавляем TouchableOpacity в правильный импорт react-native
    if line.strip() == 'import {':
        # Проверяем, это импорт из react-native?
        # Мы найдём это по следующей строке или контексту
        pass
    new_lines.append(line)

# Более точная замена: находим блок импорта из 'react-native' и добавляем TouchableOpacity
content = ''.join(new_lines)
content = content.replace(
    "import {\n  View,\n  Text,\n  StyleSheet,\n  ScrollView,\n  ActivityIndicator,\n} from 'react-native';",
    "import {\n  View,\n  Text,\n  StyleSheet,\n  ScrollView,\n  ActivityIndicator,\n  TouchableOpacity,\n} from 'react-native';"
)

# Если формат немного другой, добавим просто в первую строку с 'react-native'
if 'TouchableOpacity' not in content or content.count('TouchableOpacity') > 1:
    # Сбрасываем все неправильные TouchableOpacity
    content = content.replace('TouchableOpacity,  SafeAreaView', 'SafeAreaView')
    content = content.replace('TouchableOpacity,  useFocusEffect', 'useFocusEffect')
    content = content.replace('import { TouchableOpacity, \n', 'import {\n')
    
    # Добавляем правильно
    content = content.replace(
        "} from 'react-native';",
        "TouchableOpacity\n} from 'react-native';"
    )

with open('src/screens/crm/EmployeeStatsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Импорты исправлены')
