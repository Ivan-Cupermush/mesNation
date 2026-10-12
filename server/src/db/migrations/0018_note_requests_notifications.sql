-- Заметка в чате как файл: подпись хранится в тексте самого сообщения.
-- Раньше в тексте лежало «📝 Название» — убираем, название берётся из снимка.
UPDATE messages m SET text = NULL
FROM note_shares ns
WHERE m.note_share_id = ns.id
  AND m.text = '📝 ' || COALESCE(NULLIF(ns.title, ''), 'Заметка');

-- Запрос актуальной версии пересланной заметки. Владелец подтверждает —
-- и запросившему приходит новая копия (снимок не обновляется).
CREATE TABLE IF NOT EXISTS note_share_requests (
  id              SERIAL PRIMARY KEY,
  share_id        INTEGER NOT NULL REFERENCES note_shares(id) ON DELETE CASCADE,
  requester_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id         INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  result_note_id  INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);
-- Один открытый запрос на одну пересланную заметку от одного человека.
CREATE UNIQUE INDEX IF NOT EXISTS note_share_requests_pending_uq
  ON note_share_requests (share_id, requester_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS note_share_requests_owner_idx ON note_share_requests (owner_id, status);

-- Колокольчик: новые задачи, запросы заметок и ответы на них.
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(32) NOT NULL,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
