-- Просьбы: тот же формат, что задача (исполнители, срок, контрольные точки,
-- файлы, комментарии), но без важности, наблюдателей и проверки — исполнитель
-- выполняет и отмечает «Готово», создатель может отправить в архив.
-- Просьбу можно отправить коллегам своего уровня, задачу — только себе и
-- своему поддереву (services/access.ts).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'task';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_kind_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_kind_check CHECK (kind IN ('task', 'request'));
  END IF;
END $$;
-- Создатель поблагодарил за выполненную просьбу.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS thanked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks (kind);
