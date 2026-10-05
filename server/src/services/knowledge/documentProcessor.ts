import fs from 'fs';
import path from 'path';
import pool from '../../db/pool';
import { logger } from '../../lib/logger';
import { UPLOAD_DIRS } from '../../lib/uploads';
import { parseDocument } from './documentParser';
import { chunkText } from './chunker';
import { getEmbeddings } from './embeddingService';

const UPLOADS_DIR = UPLOAD_DIRS.knowledge;

/**
 * Причина ошибки — понятная руководителю, без «fetch failed»: чаще всего
 * на сервере не запущена нейросеть или не установлен pgvector.
 */
export function readableProcessingError(error: any): string {
  const msg = `${error?.message || ''} ${error?.cause?.code || ''}`;
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET/i.test(msg)) {
    return 'Нейросеть на сервере недоступна — документ не обработан. Нажмите «Обработать снова», когда она заработает.';
  }
  if (/model .*not found/i.test(msg)) return 'На сервере не установлена модель для поиска по документам (nomic-embed-text).';
  if (/type "vector" does not exist|column "embedding"/i.test(msg)) {
    return 'Поиск по документам не настроен: на сервере нет расширения pgvector.';
  }
  return error?.message || 'Неизвестная ошибка';
}

/**
 * Главный процессор: парсит документ, разбивает на чанки,
 * создаёт эмбеддинги и сохраняет всё в БД.
 */
export async function processDocument(documentId: number): Promise<void> {
  const client = await pool.connect();
  
  try {
    const docRes = await client.query(
      'SELECT * FROM knowledge_documents WHERE id = $1',
      [documentId]
    );
    
    if (docRes.rows.length === 0) {
      throw new Error(`Документ ${documentId} не найден`);
    }
    
    const doc = docRes.rows[0];
    const filePath = path.join(UPLOADS_DIR, path.basename(doc.filename));
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Файл ${doc.filename} не найден на диске`);
    }

    await client.query(
      `UPDATE knowledge_documents 
       SET status = 'processing' 
       WHERE id = $1`,
      [documentId]
    );

    logger.info({ documentId, name: doc.original_name }, 'База знаний: парсинг документа');
    const parseResult = await parseDocument(filePath, doc.mime_type);
    
    if (!parseResult.text || parseResult.text.trim().length < 50) {
      throw new Error('Документ пустой или не удалось извлечь текст');
    }
    
    logger.debug({ documentId, chars: parseResult.text.length }, 'База знаний: текст извлечён');

    const chunks = chunkText(parseResult.text);
    logger.debug({ documentId, chunks: chunks.length }, 'База знаний: текст разбит на фрагменты');

    if (chunks.length === 0) {
      throw new Error('Не удалось разбить документ на чанки');
    }

    const BATCH_SIZE = 10;
    const embeddings: number[][] = [];
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map(c => c.content);
      logger.debug({ documentId, batch: Math.floor(i / BATCH_SIZE) + 1, of: Math.ceil(chunks.length / BATCH_SIZE) }, 'База знаний: эмбеддинги');
      const batchEmbeddings = await getEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
    }

    await client.query('BEGIN');
    
    try {
      // Повторная обработка: прежние фрагменты заменяются новыми.
      await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        
        const embeddingStr = `[${embedding.join(',')}]`;
        
        await client.query(
          `INSERT INTO knowledge_chunks 
             (document_id, content, chunk_index, embedding, char_start, char_end)
           VALUES ($1, $2, $3, $4::vector, $5, $6)`,
          [
            documentId,
            chunk.content,
            chunk.index,
            embeddingStr,
            chunk.charStart,
            chunk.charEnd,
          ]
        );
      }

      await client.query(
        `UPDATE knowledge_documents 
         SET status = 'completed',
             chunks_count = $1,
             error_message = NULL,
             processed_at = NOW()
         WHERE id = $2`,
        [chunks.length, documentId]
      );

      await client.query('COMMIT');
      logger.info({ documentId, chunks: chunks.length }, 'База знаний: документ обработан');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error: any) {
    logger.error({ err: error, documentId }, 'База знаний: ошибка обработки документа');
    
    await client.query(
      `UPDATE knowledge_documents 
       SET status = 'failed', 
           error_message = $1 
       WHERE id = $2`,
      [readableProcessingError(error), documentId]
    ).catch((e) => logger.error({ err: e, documentId }, 'База знаний: не удалось сохранить ошибку обработки'));
    
  } finally {
    client.release();
  }
}
