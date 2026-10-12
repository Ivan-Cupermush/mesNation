-- 0017: права на функции сотрудников и автоматический архив задач.

-- Функции, которые руководитель включает или отключает сотруднику
-- (по умолчанию — по должности: директору и руководителям отделов — да).
-- allowed = TRUE — включено явно, FALSE — отключено явно; строки нет — по умолчанию.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(40) NOT NULL,
  allowed BOOLEAN NOT NULL,
  granted_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

-- Выполненные задачи через 3 дня уходят в архив автоматически: такая запись
-- в истории — без автора.
ALTER TABLE task_status_history ALTER COLUMN changed_by DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_status_history_done ON task_status_history (task_id, created_at) WHERE to_status = 'done';
CREATE INDEX IF NOT EXISTS idx_tasks_status_new ON tasks (status_new);
