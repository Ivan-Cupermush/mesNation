import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParseResult {
  text: string;
  pageCount?: number;
  metadata?: Record<string, any>;
}

/**
 * Парсит документ в зависимости от MIME типа
 * Поддерживает: PDF, DOCX, TXT, MD
 */
export async function parseDocument(
  filePath: string,
  mimeType: string
): Promise<ParseResult> {
  // PDF
  if (mimeType === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      pageCount: data.numpages,
      metadata: data.info,
    };
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return {
      text: result.value,
      metadata: { warnings: result.messages.length },
    };
  }

  // TXT, MD, и другие текстовые форматы
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    mimeType.startsWith('text/')
  ) {
    const text = fs.readFileSync(filePath, 'utf-8');
    return { text };
  }

  throw new Error(`Неподдерживаемый тип файла: ${mimeType}`);
}

/**
 * Определяет MIME тип по расширению (fallback, если клиент не прислал)
 */
export function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'txt': return 'text/plain';
    case 'md': return 'text/markdown';
    default: return 'application/octet-stream';
  }
}
