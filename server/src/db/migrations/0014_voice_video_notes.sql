-- 0014: голосовые сообщения и видеосообщения («кружочки»), как в Telegram.
--
-- media_kind: + 'voice' | 'video_note'.
-- media_waveform — форма волны голосового: до 100 уровней 0..31 через запятую
-- (снимается на телефоне при записи, рисуется полосками в пузыре).
-- message_listens — кто прослушал голосовое/кружочек: пока не прослушано,
-- рядом с ним горит точка (у получателя — пока он сам не послушает,
-- у отправителя — пока не послушает кто-то другой).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_waveform TEXT;

CREATE TABLE IF NOT EXISTS message_listens (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);
