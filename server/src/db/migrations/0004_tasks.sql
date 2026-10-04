-- 0004: задачи — разархивация, мягкое удаление, контрольные точки.

-- Статус до архивации: чтобы «Разархивировать» вернуло задачу туда, где она была.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_before_archive VARCHAR(20);
-- Кто и когда отправил задачу в архив/удалил (archived_as: 'done' | 'deleted').
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_by INT REFERENCES users(id) ON DELETE SET NULL;

UPDATE tasks SET archived_as = 'done'
WHERE status_new = 'archived' AND archived_as IS NULL;

-- Контрольные точки: кто отметил выполнение.
ALTER TABLE task_checkpoints ADD COLUMN IF NOT EXISTS completed_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE task_checkpoints DROP CONSTRAINT IF EXISTS task_checkpoints_status_check;
ALTER TABLE task_checkpoints ADD CONSTRAINT task_checkpoints_status_check
  CHECK (status IN ('pending', 'completed', 'missed'));

CREATE INDEX IF NOT EXISTS idx_tasks_executor_deadline ON tasks(executor_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
