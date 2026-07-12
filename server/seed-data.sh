#!/bin/bash

API_URL="http://localhost:5000/api"

echo "🌱 Начинаем наполнение базы данных..."

# Создать нескольких пользователей
echo "👤 Создаём пользователей..."
USER1=$(curl -s -X POST $API_URL/auth/register -H "Content-Type: application/json" -d '{
  "username": "ivan",
  "email": "ivan@example.com",
  "password": "password123",
  "display_name": "Иван Иванов"
}')
TOKEN1=$(echo $USER1 | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "✅ Иван создан"

USER2=$(curl -s -X POST $API_URL/auth/register -H "Content-Type: application/json" -d '{
  "username": "petr",
  "email": "petr@example.com",
  "password": "password123",
  "display_name": "Петр Петров"
}')
TOKEN2=$(echo $USER2 | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "✅ Петр создан"

USER3=$(curl -s -X POST $API_URL/auth/register -H "Content-Type: application/json" -d '{
  "username": "anna",
  "email": "anna@example.com",
  "password": "password123",
  "display_name": "Анна Сидорова"
}')
TOKEN3=$(echo $USER3 | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "✅ Анна создана"

echo ""
echo "📊 Итоговая статистика:"
echo "Пользователей создано: 3"
echo ""
echo "Данные для входа:"
echo "  ivan@example.com / password123"
echo "  petr@example.com / password123"
echo "  anna@example.com / password123"

