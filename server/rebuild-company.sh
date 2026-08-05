#!/bin/bash
# Полная пересборка компании с чистой иерархией

echo "🔄 Пересоздаю компанию с чистой структурой..."
echo ""

# ── 1. Очистка ──
echo "🗑️  Очищаю базу..."
psql -U postgres -d mesnation > /dev/null 2>&1 <<SQL
DELETE FROM sales_transactions;
DELETE FROM sales_targets;
DELETE FROM sales_imports;
DELETE FROM users;
DELETE FROM role_tree;
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE role_tree_id_seq RESTART WITH 1;
SQL
echo "   ✅ База очищена"

# ── 2. Создание дерева ролей ──
echo ""
echo "🌳 Создаю дерево ролей..."
psql -U postgres -d mesnation > /dev/null 2>&1 <<SQL
INSERT INTO role_tree (name, parent_id, level, description, color, icon) VALUES
  ('Директор', NULL, 0, 'Высшее руководство компании', '#DC2626', '👔'),
  ('Руководитель отдела продаж', 1, 1, 'Руководит отделом продаж', '#F59E0B', '👨‍💼'),
  ('Менеджер по продажам', 2, 2, 'Линейный менеджер отдела продаж', '#10B981', '👤');
SQL
echo "   ✅ Дерево создано:"
psql -U postgres -d mesnation -c "SELECT id, name, parent_id, level FROM role_tree ORDER BY level, id;"

# ── 3. Создание пользователей ──
echo ""
echo "👥 Создаю пользователей..."
API="http://localhost:5000/api"

# Директор
echo "   👔 Создаю директора..."
DIRECTOR_RESULT=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "director",
    "email": "director@ty.com",
    "password": "123",
    "display_name": "Алексей Волков"
  }')
DIRECTOR_ID=$(echo "$DIRECTOR_RESULT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "      ✅ Алексей Волков (id=$DIRECTOR_ID, логин: director, пароль: 123)"

# Руководитель отдела продаж
echo "   👨‍💼 Создаю руководителя отдела продаж..."
MANAGER_RESULT=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sales_head",
    "email": "sales@ty.com",
    "password": "123",
    "display_name": "Дмитрий Козлов"
  }')
MANAGER_ID=$(echo "$MANAGER_RESULT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "      ✅ Дмитрий Козлов (id=$MANAGER_ID, логин: sales_head, пароль: 123)"

# Менеджер 1 (с KPI)
echo "   👤 Создаю менеджера 1..."
EMP1_RESULT=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ivan",
    "email": "ivan@ty.com",
    "password": "123",
    "display_name": "Иван Петров"
  }')
EMP1_ID=$(echo "$EMP1_RESULT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "      ✅ Иван Петров (id=$EMP1_ID, логин: ivan, пароль: 123)"

# Менеджер 2
echo "   👤 Создаю менеджера 2..."
EMP2_RESULT=$(curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "maria",
    "email": "maria@ty.com",
    "password": "123",
    "display_name": "Мария Сидорова"
  }')
EMP2_ID=$(echo "$EMP2_RESULT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "      ✅ Мария Сидорова (id=$EMP2_ID, логин: maria, пароль: 123)"

# ── 4. Назначение ролей ──
echo ""
echo "🔗 Назначаю роли..."
psql -U postgres -d mesnation > /dev/null 2>&1 <<SQL
UPDATE users SET role_id = 1 WHERE id = $DIRECTOR_ID;  -- Директор
UPDATE users SET role_id = 2 WHERE id = $MANAGER_ID;   -- Руководитель отдела продаж
UPDATE users SET role_id = 3 WHERE id IN ($EMP1_ID, $EMP2_ID);  -- Менеджеры
SQL
echo "   ✅ Роли назначены"

# ── 5. Создание KPI для Ивана ──
echo ""
echo "🎯 Создаю KPI для Ивана Петрова..."

# Получаю токен Ивана
IVAN_TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ivan","password":"123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$IVAN_TOKEN" ]; then
  echo "   ⛔ Не удалось авторизоваться как ivan"
  exit 1
fi

# Создаю товарный KPI
KPI_RESULT=$(curl -s -X POST $API/kpi/sales/targets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IVAN_TOKEN" \
  -d '{
    "product_name": "Премиум пакет",
    "metric_type": "quantity",
    "target_value": 50,
    "current_value": 0,
    "description": "Продать 50 премиум-пакетов за месяц"
  }')

KPI_ID=$(echo "$KPI_RESULT" | grep -o '"id":[0-9]*' | cut -d: -f2)

if [ -n "$KPI_ID" ]; then
  echo "   ✅ KPI создан (id=$KPI_ID)"
else
  echo "   ⚠️  KPI не создан: $KPI_RESULT"
fi

# ── 6. Итог ──
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Компания пересоздана!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Структура компании Ty:"
echo ""
echo "   👔 Алексей Волков (director / 123)"
echo "      │   Директор, полные права администратора"
echo "      │"
echo "      └── 👨‍💼 Дмитрий Козлов (sales_head / 123)"
echo "             │   Руководитель отдела продаж"
echo "             │"
echo "             ├── 👤 Иван Петров (ivan / 123)"
echo "             │      │   Менеджер по продажам"
echo "             │      └── 🎯 KPI: Премиум пакет (0/50)"
echo "             │"
echo "             └── 👤 Мария Сидорова (maria / 123)"
echo "                    │   Менеджер по продажам"
echo ""
echo "🔑 Доступы для входа:"
echo ""
echo "   Директор:          director / 123"
echo "   Руководитель:      sales_head / 123"
echo "   Менеджер 1 (KPI):  ivan / 123"
echo "   Менеджер 2:        maria / 123"
echo ""
echo "📱 Зайди в приложение под ivan / 123 и увидишь свой KPI"
echo "   на экране статистики."
echo ""
echo "════════════════════════════════════════════════════════════════"
