-- Дедлайн проверки — промежуточный срок ДО дедлайна выполнения (общего срока
-- задачи): к нему работа сдана и проверена наблюдателями. Чтобы отличать первую
-- сдачу от повторной (после отклонения), запоминаем момент отправки на проверку.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ;
UPDATE tasks t SET review_started_at = h.at
FROM (
  SELECT task_id, MAX(created_at) AS at FROM task_status_history WHERE to_status = 'on_review' GROUP BY task_id
) h
WHERE h.task_id = t.id AND t.review_started_at IS NULL;
