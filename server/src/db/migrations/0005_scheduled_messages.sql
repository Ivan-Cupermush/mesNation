-- 0005: отложенная отправка сообщений.
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  chat_id INT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  topic_id INT REFERENCES topics(id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  reply_to_message_id INT REFERENCES messages(id) ON DELETE SET NULL,
  send_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- pending → sent | failed | cancelled
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_message_id INT REFERENCES messages(id) ON DELETE SET NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages(send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_sender_chat ON scheduled_messages(sender_id, chat_id) WHERE status = 'pending';
