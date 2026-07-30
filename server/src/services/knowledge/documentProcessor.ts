import fs from 'fs';
import path from 'path';
import pool from '../../db/pool';
import { parseDocument } from './documentParser';
import { chunkText } from './chunker';
import { getEmbeddings } from './embeddingService';

const UPLOADS_DIR = path.join(__dirname, '../../../uploads/knowledge');

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
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Файл ${doc.filename} не найден на диске`);
    }

    await client.query(
      `UPDATE knowledge_documents 
       SET status = 'processing' 
       WHERE id = $1`,
      [documentId]
    );

    console.log(`📄 Парсинг: ${doc.original_name}`);
    const parseResult = await parseDocument(filePath, doc.mime_type);
    
    if (!parseResult.text || parseResult.text.trim().length < 50) {
      throw new Error('Документ пустой или не удалось извлечь текст');
    }
    
    console.log(`✓ Извлечено ${parseResult.text.length} символов`);

    const chunks = chunkText(parseResult.text);
    console.log(`✓ Создано ${chunks.length} чанков`);

    if (chunks.length === 0) {
      throw new Error('Не удалось разбить документ на чанки');
    }

    const BATCH_SIZE = 10;
    const embeddings: number[][] = [];
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map(c => c.content);
      console.log(`🧠 Эмбеддинги: батч ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(chunks.length/BATCH_SIZE)}`);
      const batchEmbeddings = await getEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
    }

    await client.query('BEGIN');
    
    try {
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
             processed_at = NOW()
         WHERE id = $2`,
        [chunks.length, documentId]
      );

      await client.query('COMMIT');
      console.log(`✅ Документ "${doc.original_name}" обработан: ${chunks.length} чанков`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error: any) {
    console.error(`❌ Ошибка обработки документа ${documentId}:`, error.message);
    
    await client.query(
      `UPDATE knowledge_documents 
       SET status = 'failed', 
           error_message = $1 
       WHERE id = $2`,
      [error.message || 'Неизвестная ошибка', documentId]
    ).catch(e => console.error('Не удалось сохранить ошибку:', e));
    
  } finally {
    client.release();
  }
}
