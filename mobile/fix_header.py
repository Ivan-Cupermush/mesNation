import re

p = 'src/screens/crm/EmployeeStatsScreen.tsx'
with open(p, encoding='utf-8') as f:
    c = f.read()

# 1. Удаляем шапку оттуда, куда она вставилась
block_re = re.compile(r'[ \t]*<View style=\{styles\.headerRow\}>[\s\S]*?</View>\n')
m = block_re.search(c)
block = m.group(0) if m else None
if block:
    c = c.replace(block, '', 1)
    print('✅ Шапка удалена из старого места')

if block is None:
    block = '''      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#111827' }]} numberOfLines={1}>
          {userName || 'Сотрудник'}
        </Text>
      </View>
'''

# 2. Вставляем перед первым ScrollView (основной экран)
idx = c.find('<ScrollView')
if idx != -1:
    c = c[:idx] + block + c[idx:]
    print('✅ Шапка вставлена перед ScrollView')

with open(p, 'w', encoding='utf-8') as f:
    f.write(c)
