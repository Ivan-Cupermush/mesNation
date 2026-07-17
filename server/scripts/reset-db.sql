-- ПОЛНАЯ ОЧИСТКА БД
TRUNCATE TABLE 
  messages, chat_members, chat_admins, topics, chats,
  task_canvas_posts, task_checkpoints, task_assignees, task_watchers, task_files, tasks,
  note_attachments, notes,
  sales_transactions, sales_targets, sales_imports,
  user_role_assignments, users, role_tree,
  app_settings
CASCADE;

-- Сброс счётчиков
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE role_tree_id_seq RESTART WITH 1;
ALTER SEQUENCE chats_id_seq RESTART WITH 1;
ALTER SEQUENCE messages_id_seq RESTART WITH 1;
ALTER SEQUENCE topics_id_seq RESTART WITH 1;
ALTER SEQUENCE tasks_id_seq RESTART WITH 1;
ALTER SEQUENCE task_checkpoints_id_seq RESTART WITH 1;
ALTER SEQUENCE task_canvas_posts_id_seq RESTART WITH 1;
ALTER SEQUENCE task_files_id_seq RESTART WITH 1;
ALTER SEQUENCE notes_id_seq RESTART WITH 1;
ALTER SEQUENCE sales_targets_id_seq RESTART WITH 1;
ALTER SEQUENCE sales_transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE sales_imports_id_seq RESTART WITH 1;

-- Базовые роли
INSERT INTO role_tree (name, parent_id, description, level, icon, color) VALUES
  ('director', NULL, 'Директор (корень)', 0, '👑', '#6366F1'),
  ('manager', (SELECT id FROM role_tree WHERE name='director'), 'Менеджер', 1, '💼', '#10B981'),
  ('employee', (SELECT id FROM role_tree WHERE name='manager'), 'Сотрудник', 2, '👤', '#F59E0B');

SELECT '✅ БД очищена' as status;
SELECT id, name, parent_id, level, icon FROM role_tree ORDER BY id;
