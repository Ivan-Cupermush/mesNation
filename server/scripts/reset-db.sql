-- ПОЛНАЯ ОЧИСТКА БД + создание базовых ролей
TRUNCATE TABLE 
  users, role_tree, app_settings,
  messages, chat_members, chat_admins, topics, chats,
  task_canvas_posts, task_checkpoints, task_assignees, task_watchers, task_files, tasks,
  notes,
  sales_transactions, sales_targets, sales_imports,
  user_role_assignments
CASCADE;

-- Сбрасываем ВСЕ возможные sequence (игнорируем ошибки если не существует)
DO $$ 
DECLARE 
  seq_name text;
BEGIN
  FOR seq_name IN 
    SELECT sequence_name FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq_name);
    RAISE NOTICE 'Reset sequence: %', seq_name;
  END LOOP;
END $$;

-- 3 ОТДЕЛЬНЫХ INSERT (чтобы parent_id правильно подставлялся)
INSERT INTO role_tree (name, parent_id, description, level, icon, color) VALUES
  ('director', NULL, 'Директор', 0, '👑', '#6366F1');
INSERT INTO role_tree (name, parent_id, description, level, icon, color) VALUES
  ('manager', (SELECT id FROM role_tree WHERE name='director'), 'Менеджер', 1, '💼', '#10B981');
INSERT INTO role_tree (name, parent_id, description, level, icon, color) VALUES
  ('employee', (SELECT id FROM role_tree WHERE name='manager'), 'Сотрудник', 2, '👤', '#F59E0B');

SELECT '✅ БД очищена и готова' as status;
SELECT id, name, parent_id, level FROM role_tree ORDER BY id;
