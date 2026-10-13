-- Вход на сайт по QR-коду с телефона, как в Telegram и WhatsApp Web:
-- сайт показывает код, приложение сканирует его и подтверждает вход.
-- token — в QR-коде (его может увидеть кто угодно рядом с экраном),
-- secret — только у браузера, который показал код: без него сессию не забрать.
-- В базе хранятся только хеши.
CREATE TABLE IF NOT EXISTS qr_logins (
  id           SERIAL PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  secret_hash  TEXT NOT NULL,
  status       VARCHAR(16) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'scanned', 'approved', 'declined', 'used')),
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_agent   TEXT,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS qr_logins_expires_idx ON qr_logins (expires_at);
