import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Обновляем KpiStackParamList (добавляем наши экраны)
kpi_pattern = r'type KpiStackParamList = \{[^}]+\}'
kpi_replacement = '''type KpiStackParamList = {
  KpiHome: undefined;
  AssignKpi: undefined;
  AddProductKpi: undefined;
  ImportExcel: undefined;
  RoleTreeEditor: undefined;
  CreateUserRole: undefined;
  EmployeeStats: { userId: number; userName: string };
}'''
content = re.sub(kpi_pattern, kpi_replacement, content)

# 2. Обновляем TasksStackParamList (добавляем UserProfile от Ивана, если его там нет)
if 'UserProfile:' not in content:
    content = re.sub(
        r'(type TasksStackParamList = \{[^}]+)(\})',
        r'\1  UserProfile: { userId: number };\n\2',
        content
    )

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ TypeScript типы навигации исправлены')
