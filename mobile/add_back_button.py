import re

path = 'src/screens/crm/EmployeeStatsScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Добавляем navigation в пропсы компонента
m = re.search(r'function EmployeeStatsScreen\(\{([^}]*)\}', c)
if m and 'navigation' not in m.group(1):
    old = 'function EmployeeStatsScreen({%s})' % m.group(1)
    new = 'function EmployeeStatsScreen({%s, navigation})' % m.group(1).rstrip()
    c = c.replace(old, new)
    print('✅ navigation добавлен в пропсы')

# 2. Добавляем иконку ArrowLeft
if 'ArrowLeft' not in c:
    c = c.replace("} from 'lucide-react-native';", "  ArrowLeft,\n} from 'lucide-react-native';", 1)
    print('✅ ArrowLeft импортирован')

# 3. Вставляем шапку со стрелкой после SafeAreaView
if 'headerRow' not in c:
    header_jsx = '''
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {userName || 'Сотрудник'}
        </Text>
      </View>
'''
    c2 = re.sub(r'(<SafeAreaView[^>]*>)', lambda m: m.group(1) + header_jsx, c, count=1)
    if c2 != c:
        c = c2
        print('✅ Шапка со стрелкой добавлена')
    else:
        print('⚠ SafeAreaView не найден — проверь файл')

# 4. Добавляем стили
if 'headerRow:' not in c:
    styles_add = '''  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
'''
    c = c.rstrip()
    if c.endswith('});'):
        c = c[:-3] + styles_add + '});\n'
        print('✅ Стили добавлены')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('✅ Готово!')
