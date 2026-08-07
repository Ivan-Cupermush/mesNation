#!/bin/bash
OUTFILE="/tmp/mesnation_dump.txt"

echo "========== СБОР ФАЙЛОВ ==========" > "$OUTFILE"
echo "Дата: $(date)" >> "$OUTFILE"
echo "" >> "$OUTFILE"

# Список важных файлов
FILES=(
  "src/db/migrations/010_polls.sql"
  "src/routes/polls.ts"
  "src/routes/chats.ts"
  "src/index.ts"
  "src/db/pool.ts"
  ".env"
)

for f in "${FILES[@]}"; do
  echo "========== $f ==========" >> "$OUTFILE"
  if [ -f "$f" ]; then
    cat "$f" >> "$OUTFILE"
  else
    echo "[ФАЙЛ НЕ НАЙДЕН]" >> "$OUTFILE"
  fi
  echo "" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
done

# Таблицы БД
echo "========== ТАБЛИЦЫ БД ==========" >> "$OUTFILE"
DB_URL=$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '"' | tr -d "'")
psql "$DB_URL" -c "\dt" >> "$OUTFILE" 2>&1

echo "" >> "$OUTFILE"
echo "✅ Файл создан: $OUTFILE"
echo "Размер: $(wc -c < "$OUTFILE") байт"
