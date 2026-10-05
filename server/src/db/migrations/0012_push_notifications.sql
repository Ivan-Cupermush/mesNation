-- Push-уведомления: токены устройств (Firebase Cloud Messaging) и
-- «Без звука» для чатов (как в Telegram: на час, 8 часов, 2 дня, навсегда).
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);

ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
