#!/bin/bash

echo "===== 1. Получаем токен директора ====="
LOGIN_RESULT=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"director","password":"1234"}')

TOKEN=$(echo "$LOGIN_RESULT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "❌ Токен не получен!"
  echo "$LOGIN_RESULT"
  exit 1
fi
echo "✅ Токен: ${TOKEN:0:50}..."

echo ""
echo "===== 2. Получаем дерево ролей ====="
ROLE_TREE=$(curl -s http://localhost:5000/api/role-tree \
  -H "Authorization: Bearer $TOKEN")

# Извлекаем ID ролей
DIRECTOR_ID=$(echo "$ROLE_TREE" | python3 -c "import sys, json; data=json.load(sys.stdin); print([n['id'] for n in data if n['name']=='director'][0])")
MANAGER_ID=$(echo "$ROLE_TREE" | python3 -c "import sys, json; data=json.load(sys.stdin); print([n['id'] for n in data if n['name']=='manager'][0])")
EMPLOYEE_ID=$(echo "$ROLE_TREE" | python3 -c "import sys, json; data=json.load(sys.stdin); print([n['id'] for n in data if n['name']=='employee'][0])")

echo "🔍 Реальные ID ролей:"
echo "   director (id=$DIRECTOR_ID)"
echo "   manager  (id=$MANAGER_ID)"
echo "   employee (id=$EMPLOYEE_ID)"

echo ""
echo "===== 3. Создание менеджера ====="
curl -s -X POST http://localhost:5000/api/role-tree/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"username\": \"manager1\",
    \"email\": \"manager1@test.com\",
    \"password\": \"1234\",
    \"display_name\": \"Пётр Менеджеров\",
    \"role_node_id\": $MANAGER_ID
  }" | python3 -m json.tool

echo ""
echo "===== 4. Создание сотрудника ====="
curl -s -X POST http://localhost:5000/api/role-tree/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"username\": \"employee1\",
    \"email\": \"employee1@test.com\",
    \"password\": \"1234\",
    \"display_name\": \"Анна Сотрудникова\",
    \"role_node_id\": $EMPLOYEE_ID
  }" | python3 -m json.tool

echo ""
echo "===== 5. Все пользователи ====="
curl -s http://localhost:5000/api/users \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "✅ Готово!"
