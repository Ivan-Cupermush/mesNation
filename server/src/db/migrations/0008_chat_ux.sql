-- Мессенджер: альбомы и размеры медиа, прочитанность, присутствие,
-- служебные сообщения, пояснение к викторине.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_group_id VARCHAR(64);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_kind VARCHAR(16);       -- photo | video | file
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_width INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_height INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration NUMERIC(10, 2); -- секунды (видео)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mime_type VARCHAR(255);
CREATE INDEX IF NOT EXISTS messages_media_group_idx ON messages (media_group_id) WHERE media_group_id IS NOT NULL;

-- Старые картинки: у них есть превью — считаем их фото.
UPDATE messages SET media_kind = 'photo' WHERE thumb_url IS NOT NULL AND media_kind IS NULL;
UPDATE messages SET media_kind = 'file' WHERE file_url IS NOT NULL AND thumb_url IS NULL AND media_kind IS NULL;

-- До какого сообщения участник прочитал чат.
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_message_id INTEGER NOT NULL DEFAULT 0;
-- Уже существующая переписка считается прочитанной, чтобы не вывалить сотни «непрочитанных».
UPDATE chat_members cm SET last_read_message_id = COALESCE(
  (SELECT MAX(m.id) FROM messages m WHERE m.chat_id = cm.chat_id::text), 0);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE polls ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- «Удалить чат» в личной переписке скрывает его только у себя; новое
-- сообщение возвращает чат в список (как в Telegram).
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
