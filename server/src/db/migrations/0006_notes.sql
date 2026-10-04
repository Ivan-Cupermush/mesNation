-- Вложения заметок и пересылка заметок во внутренний чат.

CREATE TABLE IF NOT EXISTS note_files (
  id          SERIAL PRIMARY KEY,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_size   BIGINT,
  mime_type   VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS note_files_note_idx ON note_files (note_id);
CREATE INDEX IF NOT EXISTS note_files_url_idx ON note_files (file_url);

-- Снимок заметки на момент отправки: получатель принимает именно то,
-- что ему отправили, даже если автор потом изменит или удалит оригинал.
CREATE TABLE IF NOT EXISTS note_shares (
  id          SERIAL PRIMARY KEY,
  note_id     INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  chat_id     INTEGER NOT NULL,
  title       VARCHAR(255) NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  files       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Кто и в какую заметку принял пересланную заметку.
CREATE TABLE IF NOT EXISTS note_share_acceptances (
  share_id    INTEGER NOT NULL REFERENCES note_shares(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  note_id     INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (share_id, user_id)
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS note_share_id INTEGER REFERENCES note_shares(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_note_share_idx ON messages (note_share_id) WHERE note_share_id IS NOT NULL;
