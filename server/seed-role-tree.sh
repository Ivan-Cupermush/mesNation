#!/bin/bash
# Создаёт дерево ролей: Директор → Начальник отдела → Сотрудник
# И назначает роли пользователям admin, user1, user2, user3

API="http://localhost:5000/api"

echo "🌳 Создаём дерево ролей..."

# Получить токен админа
TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "⛔ Не удалось войти как admin. Убедись что seed.sh запущен."
  exit 1
fi

echo "✅ Админ авторизован"

# Создать корневую роль "Директор" (parent_id = null, level = 1)
DIRECTOR_ID=$(curl -s -X POST $API/role-tree \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Директор","description":"Топ-менеджмент","color":"#DC2626","icon":"👔"}' | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "✅ Директор (id=$DIRECTOR_ID)"

# Создать роль "Начальник отдела" (parent = Директор, level = 2)
MANAGER_ID=$(curl -s -X POST $API/role-tree \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\":\"Начальник отдела\",\"description\":\"Руководитель подразделения\",\"color\":\"#F59E0B\",\"icon\":\"👨‍💼\",\"parent_id\":$DIRECTOR_ID}" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "✅ Начальник отдела (id=$MANAGER_ID, parent=$DIRECTOR_ID)"

# Создать роль "Сотрудник" (parent = Начальник, level = 3)
EMPLOYEE_ID=$(curl -s -X POST $API/role-tree \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\":\"Сотрудник\",\"description\":\"Линейный персонал\",\"color\":\"#10B981\",\"icon\":\"👤\",\"parent_id\":$MANAGER_ID}" | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "✅ Сотрудник (id=$EMPLOYEE_ID, parent=$MANAGER_ID)"

echo ""
echo "📊 Дерево ролей создано:"
echo "  👔 Директор (id=$DIRECTOR_ID)"
echo "     └── 👨‍💼 Начальник отдела (id=$MANAGER_ID)"
echo "           └── 👤 Сотрудник (id=$EMPLOYEE_ID)"

echo ""
echo "Теперь назначь роли пользователям через RoleTreeEditorScreen"
echo "или вручную через SQL:"
echo "  UPDATE users SET role_id = $DIRECTOR_ID WHERE username = 'admin';"
echo "  UPDATE users SET role_id = $MANAGER_ID WHERE username = 'user1';"
echo "  UPDATE users SET role_id = $EMPLOYEE_ID WHERE username IN ('user2', 'user3');"
