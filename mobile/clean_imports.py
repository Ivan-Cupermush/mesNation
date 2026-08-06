with open('src/screens/crm/EmployeeStatsScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Убираем все дубликаты TouchableOpacity
lines = content.split('\n')
new_lines = []
touchable_added = False

for line in lines:
    # Пропускаем строки с TouchableOpacity в неправильных местах
    if 'TouchableOpacity' in line and ("from '../services/api'" in line or "from 'lucide-react-native'" in line):
        # Убираем TouchableOpacity из этой строки
        line = line.replace('TouchableOpacity, ', '').replace(', TouchableOpacity', '').replace('TouchableOpacity', '')
        # Если строка пустая после замены — пропускаем
        if line.strip() in ['', 'import {', 'import {}']:
            continue
    
    new_lines.append(line)

content = '\n'.join(new_lines)

# Теперь добавляем TouchableOpacity в правильный импорт react-native
# Ищем импорт из 'react-native' и добавляем TouchableOpacity
import re

def add_touchable(match):
    imports = match.group(1)
    if 'TouchableOpacity' in imports:
        return match.group(0)  # Уже есть
    # Добавляем TouchableOpacity
    return f"import {{\n  {imports},\n  TouchableOpacity,\n}} from 'react-native';"

content = re.sub(
    r"import \{\s*([^}]+)\s*\} from 'react-native';",
    add_touchable,
    content
)

with open('src/screens/crm/EmployeeStatsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Импорты очищены')
