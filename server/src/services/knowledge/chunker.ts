export interface Chunk {
  content: string;
  index: number;
  charStart: number;
  charEnd: number;
}

interface ChunkerOptions {
  chunkSize?: number;     // целевой размер в символах (по умолчанию 1500)
  overlap?: number;       // перекрытие между чанками (по умолчанию 200)
}

/**
 * Разбивает текст на чанки с перекрытием
 */
export function chunkText(
  text: string,
  options: ChunkerOptions = {}
): Chunk[] {
  const { chunkSize = 1500, overlap = 200 } = options;

  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanText) return [];

  const sentences = splitIntoSentences(cleanText);

  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStart = 0;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    // Добавляем пробел между предложениями
    const candidate = currentChunk.length > 0 
      ? currentChunk + ' ' + sentence 
      : sentence;

    if (candidate.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        charStart: currentStart,
        charEnd: currentStart + currentChunk.length,
      });
      chunkIndex++;

      // Overlap: берём последние N символов предыдущего чанка
      const overlapText =
        currentChunk.length > overlap
          ? currentChunk.slice(-overlap)
          : currentChunk;
      
      currentChunk = overlapText.trim() + ' ' + sentence;
      currentStart = currentStart + currentChunk.length - overlapText.length - sentence.length;
    } else {
      currentChunk = candidate;
    }
  }

  // Не забываем последний чанк
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      charStart: currentStart,
      charEnd: currentStart + currentChunk.length,
    });
  }

  return chunks;
}

/**
 * Разбивает текст на предложения
 */
function splitIntoSentences(text: string): string[] {
  // Разбивка по .!? с сохранением пробелов
  const sentenceRegex = /[^.!?]+[.!?]+[\s]*|[^.!?]+$/g;
  const matches = text.match(sentenceRegex) || [];
  
  return matches
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
