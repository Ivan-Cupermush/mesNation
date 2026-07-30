import { chunkText } from './src/services/knowledge/chunker';
import { getEmbedding, checkOllamaHealth } from './src/services/knowledge/embeddingService';

async function test() {
  console.log('=== ТЕСТ 1: Проверка Ollama ===');
  const healthy = await checkOllamaHealth();
  console.log('Ollama доступен:', healthy ? '✅' : '❌');

  console.log('\n=== ТЕСТ 2: Чанкинг текста ===');
  const sampleText = `
    Искусственный интеллект (ИИ) — это область компьютерных наук, 
    занимающаяся созданием интеллектуальных систем. 
    Машинное обучение является подмножеством ИИ. 
    Нейронные сети имитируют работу человеческого мозга.
    GPT — это большая языковая модель.
    RAG помогает LLM работать с актуальными данными.
    Векторный поиск находит похожие по смыслу тексты.
  `.trim();

  const chunks = chunkText(sampleText, { chunkSize: 200, overlap: 30 });
  console.log(`Создано чанков: ${chunks.length}`);
  chunks.forEach((c, i) => {
    console.log(`\n--- Чанк ${i} (${c.content.length} символов) ---`);
    console.log(c.content);
  });

  console.log('\n=== ТЕСТ 3: Эмбеддинги ===');
  const embedding = await getEmbedding('Как оформить отпуск?');
  console.log(`Размерность вектора: ${embedding.length}`);
  console.log(`Первые 5 чисел:`, embedding.slice(0, 5).map(n => n.toFixed(4)));
  
  console.log('\n✅ Все тесты пройдены!');
}

test().catch(e => {
  console.error('❌ Ошибка теста:', e);
});
