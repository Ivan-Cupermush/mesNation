#!/bin/bash

API="http://localhost:5000/api"

echo "🌱 Создаём тестовых пользователей..."

for i in 1 2 3; do
  curl -s -X POST $API/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"user$i\",\"email\":\"u$i@e.com\",\"password\":\"123\",\"display_name\":\"User $i\"}" > /dev/null
  echo "✅ user$i / 123"
done

# Создать админа
curl -s -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"a@e.com","password":"1","display_name":"Admin"}' > /dev/null
echo "✅ admin / 1"

echo ""
echo "📊 Данные для входа:"
echo "  admin / 1"
echo "  user1 / 123"
echo "  user2 / 123"
echo "  user3 / 123"
