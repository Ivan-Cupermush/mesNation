-- Два отдельных дедлайна + время архивации
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_deadline TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewer_deadline TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Миграция существующих данных: hard_deadline → executor_deadline
UPDATE tasks SET executor_deadline = hard_deadline WHERE hard_deadline IS NOT NULL AND executor_deadline IS NULL;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_tasks_executor_deadline ON tasks(executor_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_reviewer_deadline ON tasks(reviewer_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at) WHERE archived_at IS NOT NULL;

SELECT '✅ Миграция выполнена' as status;
