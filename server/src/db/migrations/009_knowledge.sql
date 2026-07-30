-- ============================================================
-- Миграция 009: База знаний с AI-чатом (RAG)
-- ============================================================

-- 1. Активируем pgvector (если ещё не активирован)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Таблица загруженных документов
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id SERIAL PRIMARY KEY,
    
    -- Метаданные файла
    filename VARCHAR(255) NOT NULL,           -- сохранённое имя на диске
    original_name VARCHAR(255) NOT NULL,      -- оригинальное имя файла
    file_size INT NOT NULL,                   -- размер в байтах
    mime_type VARCHAR(100) NOT NULL,          -- application/pdf и т.п.
    
    -- Категоризация
    tags TEXT[] DEFAULT '{}',                 -- массив тегов: {'HR', 'Инструкции'}
    description TEXT,                         -- описание документа
    
    -- Статус обработки
    status VARCHAR(20) DEFAULT 'pending',     -- pending | processing | completed | failed
    chunks_count INT DEFAULT 0,               -- количество созданных чанков
    error_message TEXT,                       -- если status = failed
    
    -- Аудит
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    CONSTRAINT valid_doc_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    )
);

CREATE INDEX idx_knowledge_docs_status ON knowledge_documents(status);
CREATE INDEX idx_knowledge_docs_tags ON knowledge_documents USING GIN(tags);
CREATE INDEX idx_knowledge_docs_uploaded_by ON knowledge_documents(uploaded_by);

-- ============================================================
-- Таблица чанков (фрагментов документов с векторами)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id SERIAL PRIMARY KEY,
    document_id INT NOT NULL REFERENCES knowledge_documents(id) 
        ON DELETE CASCADE,
    
    -- Содержимое
    content TEXT NOT NULL,                    -- текст чанка
    chunk_index INT NOT NULL,                 -- порядковый номер в документе
    
    -- Векторное представление (768 размерностей для nomic-embed-text)
    embedding vector(768),
    
    -- Метаданные
    page_number INT,                          -- номер страницы (для PDF)
    char_start INT,                           -- начало в исходном тексте
    char_end INT,                             -- конец в исходном тексте
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_doc ON knowledge_chunks(document_id);

-- Индекс для быстрого векторного поиска (cosine similarity)
-- lists = 100 — компромисс между скоростью и точностью для <100k чанков
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
    ON knowledge_chunks 
    USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);

-- ============================================================
-- Таблица сессий чата
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,              -- автогенерируется из первого вопроса
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- ============================================================
-- Таблица сообщений в чате
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    
    role VARCHAR(20) NOT NULL,                -- user | assistant | system
    content TEXT NOT NULL,                    -- текст сообщения
    
    -- Для ответов AI: источники (ID чанков, которые использовались)
    source_chunk_ids INT[] DEFAULT '{}',
    
    -- Обратная связь
    feedback VARCHAR(10),                     -- positive | negative | NULL
    feedback_comment TEXT,                    -- комментарий к отзыву
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_msg_role CHECK (role IN ('user', 'assistant', 'system')),
    CONSTRAINT valid_feedback CHECK (
        feedback IS NULL OR feedback IN ('positive', 'negative')
    )
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- ============================================================
-- Триггер: автоматическое обновление updated_at у сессии
-- при добавлении нового сообщения
-- ============================================================
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_sessions 
    SET updated_at = NOW() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chat_sessions_updated_at 
    ON chat_messages;

CREATE TRIGGER trigger_update_chat_sessions_updated_at
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_sessions_updated_at();

-- ============================================================
-- Показать результат
-- ============================================================
SELECT 
    tablename, 
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'knowledge_%' OR tablename LIKE 'chat_%'
ORDER BY tablename;
