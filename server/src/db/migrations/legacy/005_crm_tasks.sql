-- ============================================
-- Миграция 005: CRM — Дерево прав + Задачи
-- ============================================

-- ========== 1. ДЕРЕВО ПРАВ (Role Tree) ==========
-- Расширяем существующую таблицу roles → role_tree
-- Старые роли (director/manager/employee) становятся узлами дерева

-- Переименовываем roles в role_tree и добавляем поля
ALTER TABLE roles RENAME TO role_tree;
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES role_tree(id) ON DELETE SET NULL;
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS level INT DEFAULT 0;
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS color VARCHAR(7);
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id);
ALTER TABLE role_tree ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Создаём индекс для быстрого поиска поддеревьев
CREATE INDEX IF NOT EXISTS idx_role_tree_parent ON role_tree(parent_id);

-- Устанавливаем иерархию для существующих ролей:
-- director (корень) → manager → employee
UPDATE role_tree SET level = 0, description = 'Директор (корень дерева)', icon = '👑', color = '#6366F1' WHERE name = 'director';
UPDATE role_tree SET level = 1, description = 'Руководитель', icon = '💼', color = '#10B981',
    parent_id = (SELECT id FROM role_tree WHERE name = 'director') WHERE name = 'manager';
UPDATE role_tree SET level = 2, description = 'Сотрудник', icon = '👤', color = '#F59E0B',
    parent_id = (SELECT id FROM role_tree WHERE name = 'manager') WHERE name = 'employee';

-- Обновляем foreign key в users (role_id → role_tree.id)
-- (он уже есть, просто проверяем)
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_id_fkey;
-- ALTER TABLE users ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES role_tree(id);

-- ========== 2. ПРИВЯЗКА ПОЛЬЗОВАТЕЛЕЙ К УЗЛАМ ДЕРЕВА ==========
-- (Альтернатива существующему role_id в users — для гибкости)
CREATE TABLE IF NOT EXISTS user_role_assignments (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_node_id INT NOT NULL REFERENCES role_tree(id) ON DELETE RESTRICT,
    assigned_by INT REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)  -- один пользователь = один узел
);

CREATE INDEX IF NOT EXISTS idx_user_role_node ON user_role_assignments(role_node_id);

-- Мигрируем существующие role_id из users в user_role_assignments
INSERT INTO user_role_assignments (user_id, role_node_id)
SELECT id, role_id FROM users WHERE role_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ========== 3. ЗАДАЧИ (Tasks) — расширение ==========
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS importance VARCHAR(10) DEFAULT 'yellow' CHECK (importance IN ('green', 'yellow', 'red'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hard_deadline TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_new VARCHAR(20) DEFAULT 'new' CHECK (status_new IN ('new', 'in_progress', 'on_review', 'done', 'overdue', 'rejected', 'archived'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS watcher_id INT REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_comment TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS watcher_comment TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_as VARCHAR(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Миграция старого status → status_new
UPDATE tasks SET status_new = CASE 
    WHEN status = 'done' THEN 'done'
    WHEN status = 'overdue' THEN 'overdue'
    ELSE 'new'
END;

-- Создаём новые индексы
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(hard_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status_new);
CREATE INDEX IF NOT EXISTS idx_tasks_importance ON tasks(importance);

-- ========== 4. MANY-TO-MANY: исполнители и смотрящие ==========
CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_watchers (
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

-- Миграция старого assignee_id → task_assignees
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ========== 5. КОНТРОЛЬНЫЕ ТОЧКИ ==========
CREATE TABLE IF NOT EXISTS task_checkpoints (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    deadline TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON task_checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_deadline ON task_checkpoints(deadline);

-- ========== 6. SHARED CANVAS (общий блокнот команды) ==========
CREATE TABLE IF NOT EXISTS task_canvas_posts (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'checklist', 'image')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_task ON task_canvas_posts(task_id);
CREATE INDEX IF NOT EXISTS idx_canvas_created ON task_canvas_posts(created_at);

-- ========== 7. ФАЙЛЫ В ЗАДАЧАХ ==========
CREATE TABLE IF NOT EXISTS task_files (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INT,
    mime_type VARCHAR(100),
    uploaded_by INT REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);
