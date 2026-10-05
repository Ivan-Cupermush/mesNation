-- 0015: реакции на сообщения, как в Telegram — одна реакция от человека
-- на сообщение (повторное нажатие снимает, другая — заменяет).

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- Поиск по тексту сообщений внутри чата.
CREATE INDEX IF NOT EXISTS idx_messages_chat_text ON messages (chat_id, id DESC) WHERE text IS NOT NULL AND deleted_for_all IS NOT TRUE;
