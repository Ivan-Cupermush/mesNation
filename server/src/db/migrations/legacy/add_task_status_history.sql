-- Таблица для хранения истории переходов статусов задач
CREATE TABLE IF NOT EXISTS task_status_history (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_created_at ON task_status_history(created_at DESC);

-- Добавляем начальные записи для существующих задач
INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment, created_at)
SELECT 
  id,
  NULL,
  status_new,
  creator_id,
  'Задача создана',
  created_at
FROM tasks
WHERE NOT EXISTS (
  SELECT 1 FROM task_status_history WHERE task_id = tasks.id
);

SELECT '✅ Таблица task_status_history создана' as status;
