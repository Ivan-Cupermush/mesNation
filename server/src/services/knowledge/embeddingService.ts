import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://localhost:11434' });

const EMBEDDING_MODEL = 'nomic-embed-text';
const GENERATION_MODEL = 'llama3.2:3b';

/**
 * Получить векторное представление текста (эмбеддинг)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, 8000);
  
  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: truncated,
  });

  return response.embeddings[0];
}

/**
 * Получить эмбеддинги для массива текстов (batch)
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const truncated = texts.map(t => t.slice(0, 8000));
  
  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: truncated,
  });

  return response.embeddings;
}

/**
 * Генерация ответа LLM на основе промпта
 */
export async function generateResponse(prompt: string): Promise<string> {
  const response = await ollama.generate({
    model: GENERATION_MODEL,
    prompt,
    stream: false,
    options: {
      temperature: 0.3,
      num_predict: 800,
    },
  });

  return response.response;
}

/**
 * Проверка доступности Ollama
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    await ollama.list();
    return true;
  } catch {
    return false;
  }
}
