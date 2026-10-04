-- Индекс для быстрого поиска задач с дедлайнами
CREATE INDEX IF NOT EXISTS idx_tasks_hard_deadline 
  ON tasks(hard_deadline) 
  WHERE hard_deadline IS NOT NULL 
    AND status_new NOT IN ('done', 'archived', 'overdue');

SELECT '✅ Индекс для проверки дедлайнов создан' as status;
