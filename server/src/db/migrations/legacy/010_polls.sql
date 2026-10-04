-- ========== ОПРОСЫ ==========
CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  chat_id INT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  topic_id INT REFERENCES topics(id) ON DELETE SET NULL,
  creator_id INT NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  allows_multiple BOOLEAN DEFAULT false,
  is_quiz BOOLEAN DEFAULT false,
  correct_option_index INT,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id SERIAL PRIMARY KEY,
  poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  UNIQUE(poll_id, option_index)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id INT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, option_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_chat ON polls(chat_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id INT REFERENCES polls(id) ON DELETE SET NULL;

-- ========== ПЕРСОНАЛИЗАЦИЯ ТОПИКОВ ==========
ALTER TABLE topics ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT 'hash';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS icon_color VARCHAR(20) DEFAULT '#1F7A52';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS icon_opacity REAL DEFAULT 1;

-- ========== АВАТАР ГРУППЫ ==========
ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT;
