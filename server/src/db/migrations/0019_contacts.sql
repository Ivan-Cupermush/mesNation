-- «Изменить контакт», как в Telegram: своё имя для коллеги, видно только мне.
-- В профиле сотрудника по-прежнему показываются его настоящие данные.
CREATE TABLE IF NOT EXISTS contact_names (
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name  VARCHAR(100) NOT NULL DEFAULT '',
  last_name   VARCHAR(100) NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, user_id),
  CHECK (owner_id <> user_id)
);

-- «Поделиться контактом»: карточка сотрудника в сообщении.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
