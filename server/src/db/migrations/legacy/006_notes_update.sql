-- Миграция 006: Обновление таблицы notes для календаря

-- Добавить колонку note_date (дата заметки для календаря)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date DATE;

-- Заполнить note_date существующих заметок датой создания
UPDATE notes 
SET note_date = DATE(created_at) 
WHERE note_date IS NULL;

-- Сделать note_date обязательной
ALTER TABLE notes ALTER COLUMN note_date SET NOT NULL;

-- Установить значение по умолчанию (сегодня)
ALTER TABLE notes ALTER COLUMN note_date SET DEFAULT CURRENT_DATE;

-- Индекс для быстрого поиска заметок по дате
CREATE INDEX IF NOT EXISTS idx_notes_user_date ON notes(user_id, note_date);

-- Индекс для быстрого поиска заметок за месяц
CREATE INDEX IF NOT EXISTS idx_notes_month ON notes(user_id, DATE_TRUNC('month', note_date));

-- Индекс для избранных заметок
CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes(user_id, is_favorite) WHERE is_favorite = TRUE;
