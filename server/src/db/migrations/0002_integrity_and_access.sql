-- 0002: целостность данных, статус активности пользователей, мягкое удаление чатов,
-- индексы. Миграция идемпотентна: безопасна для любой из существующих баз.

-- ---------- Пользователи: активный / неактивный ----------
-- Сотрудников не удаляем (история задач и переписки должна сохраняться),
-- а деактивируем: такой пользователь не может войти и не предлагается
-- в списках исполнителей, участников и т.д.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ---------- Дерево ролей ----------
-- Названия должностей могут повторяться в разных отделах ("Менеджер" в продажах
-- и в закупках). Директор определяется корнем дерева, а не именем узла.
ALTER TABLE role_tree DROP CONSTRAINT IF EXISTS roles_name_key;
ALTER TABLE role_tree ALTER COLUMN name TYPE VARCHAR(100);
ALTER TABLE role_tree ALTER COLUMN icon TYPE VARCHAR(16);

-- Привязка пользователя к узлу — единый источник правды. Дозаполняем её
-- для тех, у кого была только users.role_id.
INSERT INTO user_role_assignments (user_id, role_node_id)
SELECT u.id, u.role_id
FROM users u
JOIN role_tree rt ON rt.id = u.role_id
WHERE u.role_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ---------- Чаты: мягкое удаление ----------
ALTER TABLE chats ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();

-- ---------- Сообщения ----------
-- client_id — идентификатор, который генерирует приложение при отправке.
-- Нужен, чтобы повторная отправка после обрыва связи не создавала дубль.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_sender_client
  ON messages(sender_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_chat_topic_created
  ON messages(chat_id, topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(chat_id) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

-- ---------- Задачи ----------
-- Колонки из старых ручных миграций (server/migrations/*) — на случай,
-- если какую-то из них не применили.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_deadline TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewer_deadline TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS task_status_history (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_watchers_user ON task_watchers(user_id);

-- ---------- KPI: колонки, которые раньше добавлялись прямо в обработчике запроса ----------
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC DEFAULT 0;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS payment_amount NUMERIC DEFAULT 0;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS target_percent NUMERIC DEFAULT 100;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- ---------- Настройки компании (раньше создавалась в обработчике запроса) ----------
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
