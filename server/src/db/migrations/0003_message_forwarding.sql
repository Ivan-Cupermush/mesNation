-- 0003: пересылка сообщений ("Переслано от ...").
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_message_id INT REFERENCES messages(id) ON DELETE SET NULL;

-- Мягкое удаление топиков: раньше при удалении топика его сообщения из-за
-- ON DELETE SET NULL "выпадали" в общий чат группы.
ALTER TABLE topics ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
