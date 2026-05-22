CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (name) VALUES ('director'), ('manager'), ('employee') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES departments(id),
    color VARCHAR(7) DEFAULT '#3498db'
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('director', 'manager', 'employee')),
    department_id INTEGER REFERENCES departments(id),
    sales_plan DECIMAL(15,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    deadline TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'done', 'overdue')),
    creator_id INTEGER REFERENCES users(id),
    assignee_id INTEGER REFERENCES users(id),
    department_id INTEGER REFERENCES departments(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    sender_id INT DEFAULT 0,
    text TEXT,
    file_url TEXT,
    file_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Добавляем столбцы для регистрации (если их ещё нет)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INT REFERENCES roles(id);
-- Заполним role_id по текстовому полю role (для существующих записей)
UPDATE users SET role_id = (SELECT id FROM roles WHERE roles.name = users.role) WHERE role_id IS NULL;
-- Снимем ограничение NOT NULL с role (оно несовместимо с добавлением новых пользователей без значения)
ALTER TABLE users ALTER COLUMN role DROP NOT NULL;

CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(20) NOT NULL DEFAULT 'group' CHECK (type IN ('private', 'group')),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INT REFERENCES chats(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

-- ========== Дополнения для расширенных чатов ==========

-- 1. Супергруппы
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_supergroup BOOLEAN DEFAULT false;

-- 2. Топики для супергрупп
CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    chat_id INT REFERENCES chats(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ответы на сообщения
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id INT REFERENCES messages(id) ON DELETE SET NULL;

-- 4. Редактирование сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 5. Удаление сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_user_ids INT[] DEFAULT '{}';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN DEFAULT false;

-- 6. Привязка сообщения к топику
ALTER TABLE messages ADD COLUMN IF NOT EXISTS topic_id INT REFERENCES topics(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thumb_url TEXT;
